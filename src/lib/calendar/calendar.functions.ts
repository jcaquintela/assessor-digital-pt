// Server functions do módulo de calendário — ponte entre a UI e o gateway.
// Nada de credenciais chega ao browser: só estado ("ligado"/"não ligado").
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CALENDAR_CLIENT_KEY_ENV,
  CALENDAR_PROVIDERS,
  CALENDAR_RETURN_PATH,
  CALENDAR_SCOPES,
  GATEWAY_BASE_URL,
  type CalendarProvider,
} from "./providers";

const ProviderInput = z.object({
  provider: z.enum(["google_calendar", "microsoft_outlook"]),
});

export const startCalendarConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ProviderInput.parse(d))
  .handler(async ({ data, context }) => {
    const provider = data.provider as CalendarProvider;
    const clientAPIKey = process.env[CALENDAR_CLIENT_KEY_ENV[provider]];
    if (!clientAPIKey) throw new Error(`${CALENDAR_CLIENT_KEY_ENV[provider]} não está configurado.`);

    const request = getRequest();
    if (!request) throw new Error("O pedido de autorização tem de partir da app.");
    const returnUrl = new URL(CALENDAR_RETURN_PATH[provider], request.url).toString();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      getConnectionKeyForUser,
      getAppUserIdForConnector,
      rotateAppUserIdForConnector,
    } = await import("./connections.server");
    const { authorizeAppUserOAuth } = await import("@/integrations/lovable/appUserConnector");

    const existing = await getConnectionKeyForUser(supabaseAdmin, context.userId, provider);
    const start = (appUserId: string) =>
      authorizeAppUserOAuth({
        gatewayBaseUrl: GATEWAY_BASE_URL,
        connectorId: provider,
        appUserId,
        clientAPIKey,
        returnUrl,
        connectionAPIKey: existing ?? undefined,
        credentialsConfiguration: { scopes: CALENDAR_SCOPES[provider] },
      });

    const appUserId = await getAppUserIdForConnector(supabaseAdmin, context.userId, provider);
    try {
      const { authorizationUrl } = await start(appUserId);
      return { authorizationUrl };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Ligação órfã no gateway (existe lá, mas a chave local desapareceu):
      // recomeça com um identificador novo em vez de bloquear o consultor.
      const orphan = !existing && /Reconnect requires/i.test(msg);
      if (!orphan) throw err;
      const fresh = await rotateAppUserIdForConnector(supabaseAdmin, context.userId, provider);
      const { authorizationUrl } = await start(fresh);
      return { authorizationUrl };
    }
  });

export const completeCalendarConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { exchangeAppUserOAuthCode } = await import("@/integrations/lovable/appUserConnector");
    const { saveConnectionKeyForUser } = await import("./connections.server");

    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(GATEWAY_BASE_URL, data.code);
    if (connectorId !== "google_calendar" && connectorId !== "microsoft_outlook") {
      throw new Error("Ligação devolvida para o conector errado.");
    }
    await saveConnectionKeyForUser(supabaseAdmin, context.userId, connectorId, connectionAPIKey);
    // Primeira sincronização imediata, para o consultor ver logo o efeito.
    try {
      const { pullFromProvider } = await import("./sync.server");
      await pullFromProvider(supabaseAdmin, context.userId, connectorId);
    } catch { /* o cron apanha na próxima ronda */ }
    return { ok: true, provider: connectorId };
  });

export const getCalendarStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { listConnectedProviders } = await import("./connections.server");
    const connected = await listConnectedProviders(supabaseAdmin, context.userId);
    const { data: states } = await supabaseAdmin
      .from("calendar_sync_state")
      .select("provider, last_polled_at, last_error")
      .eq("user_id", context.userId);
    const byProvider = Object.fromEntries(
      ((states ?? []) as Array<{ provider: string; last_polled_at: string | null; last_error: string | null }>)
        .map((s) => [s.provider, s]),
    );
    return CALENDAR_PROVIDERS.map((p) => ({
      provider: p,
      connected: connected.includes(p),
      lastPolledAt: byProvider[p]?.last_polled_at ?? null,
      lastError: byProvider[p]?.last_error ?? null,
    }));
  });

export const disconnectCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ProviderInput.parse(d))
  .handler(async ({ data, context }) => {
    const provider = data.provider as CalendarProvider;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getConnectionKeyForUser, deleteConnectionForUser } = await import("./connections.server");
    const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");

    const key = await getConnectionKeyForUser(supabaseAdmin, context.userId, provider);
    if (key) {
      try {
        await disconnectAppUser({ gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey: key, connectorId: provider });
      } catch { /* segue para limpeza local */ }
    }
    await deleteConnectionForUser(supabaseAdmin, context.userId, provider);
    await supabaseAdmin.from("calendar_sync_state").delete()
      .eq("user_id", context.userId).eq("provider", provider);
    return { ok: true };
  });

export const syncCalendarNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { pullAllForUser } = await import("./sync.server");
    return await pullAllForUser(supabaseAdmin, context.userId);
  });

// Replica no Google/Outlook uma alteração feita no Afonso (dashboard ou motor).
export const pushFollowUpToCalendars = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      followUpId: z.string().uuid(),
      action: z.enum(["upsert", "delete"]).default("upsert"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { pushEventToProviders } = await import("./sync.server");
    await pushEventToProviders({
      userId: context.userId,
      followUpId: data.followUpId,
      action: data.action,
    });
    return { ok: true };
  });