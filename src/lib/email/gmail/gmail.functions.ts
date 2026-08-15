// Server functions do módulo de email — ponte entre a UI e o gateway.
// Nada de credenciais chega ao browser: só estado ("ligado"/"não ligado").
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  GATEWAY_BASE_URL,
  GMAIL_CLIENT_KEY_ENV,
  GMAIL_CONNECTOR_ID,
  GMAIL_RETURN_PATH,
  GMAIL_SCOPES,
} from "./provider";

export const startGmailConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Gate de plano no servidor: esconder na UI não chega.
    const { requireEmailModule } = await import("@/lib/subscription/email-gate.server");
    await requireEmailModule(context.userId);
    const clientAPIKey = process.env[GMAIL_CLIENT_KEY_ENV];
    if (!clientAPIKey) throw new Error(`${GMAIL_CLIENT_KEY_ENV} não está configurado.`);

    const request = getRequest();
    if (!request) throw new Error("O pedido de autorização tem de partir da app.");
    const returnUrl = new URL(GMAIL_RETURN_PATH, request.url).toString();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      getConnectionKeyForUser,
      getAppUserIdForConnector,
      rotateAppUserIdForConnector,
    } = await import("@/lib/calendar/connections.server");
    const { authorizeAppUserOAuth } = await import("@/integrations/lovable/appUserConnector");

    // Consentimento incremental: o Gmail é um conector separado do Calendar,
    // com a sua própria chave de ligação. Pedimos só os scopes do Gmail — a
    // autorização do calendário já dada não é tocada nem repetida.
    const existing = await getConnectionKeyForUser(supabaseAdmin, context.userId, GMAIL_CONNECTOR_ID);
    const start = (appUserId: string) =>
      authorizeAppUserOAuth({
        gatewayBaseUrl: GATEWAY_BASE_URL,
        connectorId: GMAIL_CONNECTOR_ID,
        appUserId,
        clientAPIKey,
        returnUrl,
        connectionAPIKey: existing ?? undefined,
        credentialsConfiguration: { scopes: GMAIL_SCOPES },
      });

    const appUserId = await getAppUserIdForConnector(supabaseAdmin, context.userId, GMAIL_CONNECTOR_ID);
    try {
      const { authorizationUrl } = await start(appUserId);
      return { authorizationUrl };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const orphan = !existing && /Reconnect requires/i.test(msg);
      if (!orphan) throw err;
      const fresh = await rotateAppUserIdForConnector(supabaseAdmin, context.userId, GMAIL_CONNECTOR_ID);
      const { authorizationUrl } = await start(fresh);
      return { authorizationUrl };
    }
  });

export const completeGmailConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireEmailModule } = await import("@/lib/subscription/email-gate.server");
    await requireEmailModule(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { exchangeAppUserOAuthCode } = await import("@/integrations/lovable/appUserConnector");
    const { saveConnectionKeyForUser } = await import("@/lib/calendar/connections.server");

    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(GATEWAY_BASE_URL, data.code);
    if (connectorId !== GMAIL_CONNECTOR_ID) {
      throw new Error("Ligação devolvida para o conector errado.");
    }
    await saveConnectionKeyForUser(supabaseAdmin, context.userId, connectorId, connectionAPIKey);

    let emailAddress: string | null = null;
    try {
      const { fetchGmailProfile } = await import("./gmail.server");
      emailAddress = (await fetchGmailProfile(connectionAPIKey)).emailAddress;
    } catch { /* o endereço aparece na próxima leitura */ }

    const now = new Date().toISOString();
    await supabaseAdmin.from("email_connections").upsert(
      {
        user_id: context.userId,
        provider: "gmail",
        email_address: emailAddress,
        connected_at: now,
        last_ok_at: now,
        expires_at: null,
        reauth_warned_at: null,
        last_error: null,
        updated_at: now,
      },
      { onConflict: "user_id,provider" },
    );
    try {
      const { ensureActiveAfterConnect } = await import("@/lib/providers/active.server");
      await ensureActiveAfterConnect(context.userId, "mail");
    } catch { /* escolha fica para as Definições */ }
    return { ok: true };
  });

export const getGmailStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("email_connections")
      .select("email_address, connected_at, expires_at, last_error")
      .eq("user_id", context.userId)
      .eq("provider", "gmail")
      .maybeSingle();
    if (!data) {
      return { connected: false, needsReconnect: false, emailAddress: null as string | null };
    }
    const { isExpired } = await import("./reauth");
    return {
      connected: true,
      needsReconnect: isExpired(data as any),
      emailAddress: (data as any).email_address ?? null,
    };
  });

export const disconnectGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getConnectionKeyForUser, deleteConnectionForUser } = await import(
      "@/lib/calendar/connections.server"
    );
    const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");

    const key = await getConnectionKeyForUser(supabaseAdmin, context.userId, GMAIL_CONNECTOR_ID);
    if (key) {
      try {
        await disconnectAppUser({
          gatewayBaseUrl: GATEWAY_BASE_URL,
          connectionAPIKey: key,
          connectorId: GMAIL_CONNECTOR_ID,
        });
      } catch { /* segue para limpeza local */ }
    }
    await deleteConnectionForUser(supabaseAdmin, context.userId, GMAIL_CONNECTOR_ID);
    await supabaseAdmin
      .from("email_connections")
      .delete()
      .eq("user_id", context.userId)
      .eq("provider", "gmail");
    return { ok: true };
  });
