// Server functions do Outlook Mail — ponte entre a UI e o gateway.
// Nada de credenciais chega ao browser: só estado ("ligado"/"não ligado").
//
// Opção A (15/08): email e calendário partilham a MESMA ligação Microsoft.
// Por isso a autorização do email pede sempre também `Calendars.ReadWrite` —
// consentir só o email retiraria o calendário já ligado.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  GATEWAY_BASE_URL,
  OUTLOOK_CLIENT_KEY_ENV,
  OUTLOOK_CONNECTOR_ID,
  OUTLOOK_MAIL_RETURN_PATH,
  microsoftScopes,
} from "./provider";

export const startOutlookMailConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Gate de plano no servidor: esconder na UI não chega.
    const { requireEmailModule } = await import("@/lib/subscription/email-gate.server");
    await requireEmailModule(context.userId);
    const clientAPIKey = process.env[OUTLOOK_CLIENT_KEY_ENV];
    if (!clientAPIKey) throw new Error(`${OUTLOOK_CLIENT_KEY_ENV} não está configurado.`);

    const request = getRequest();
    if (!request) throw new Error("O pedido de autorização tem de partir da app.");
    const returnUrl = new URL(OUTLOOK_MAIL_RETURN_PATH, request.url).toString();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      getConnectionKeyForUser,
      getAppUserIdForConnector,
      rotateAppUserIdForConnector,
    } = await import("@/lib/calendar/connections.server");
    const { authorizeAppUserOAuth } = await import("@/integrations/lovable/appUserConnector");

    const existing = await getConnectionKeyForUser(
      supabaseAdmin,
      context.userId,
      OUTLOOK_CONNECTOR_ID,
    );
    const start = (appUserId: string) =>
      authorizeAppUserOAuth({
        gatewayBaseUrl: GATEWAY_BASE_URL,
        connectorId: OUTLOOK_CONNECTOR_ID,
        appUserId,
        clientAPIKey,
        returnUrl,
        connectionAPIKey: existing ?? undefined,
        credentialsConfiguration: { scopes: microsoftScopes({ mail: true, calendar: true }) },
      });

    const appUserId = await getAppUserIdForConnector(
      supabaseAdmin,
      context.userId,
      OUTLOOK_CONNECTOR_ID,
    );
    try {
      const { authorizationUrl } = await start(appUserId);
      return { authorizationUrl };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const orphan = !existing && /Reconnect requires/i.test(msg);
      if (!orphan) throw err;
      const fresh = await rotateAppUserIdForConnector(
        supabaseAdmin,
        context.userId,
        OUTLOOK_CONNECTOR_ID,
      );
      const { authorizationUrl } = await start(fresh);
      return { authorizationUrl };
    }
  });

export const completeOutlookMailConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { requireEmailModule } = await import("@/lib/subscription/email-gate.server");
    await requireEmailModule(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { exchangeAppUserOAuthCode } = await import("@/integrations/lovable/appUserConnector");
    const { saveConnectionKeyForUser } = await import("@/lib/calendar/connections.server");

    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(
      GATEWAY_BASE_URL,
      data.code,
    );
    if (connectorId !== OUTLOOK_CONNECTOR_ID) {
      throw new Error("Ligação devolvida para o conector errado.");
    }
    // A mesma chave serve o calendário: guardá-la aqui renova as duas coisas.
    await saveConnectionKeyForUser(supabaseAdmin, context.userId, connectorId, connectionAPIKey);

    let emailAddress: string | null = null;
    try {
      const { fetchOutlookProfile } = await import("./outlook.server");
      emailAddress = (await fetchOutlookProfile(connectionAPIKey)).emailAddress;
    } catch { /* o endereço aparece na próxima leitura */ }

    const now = new Date().toISOString();
    await supabaseAdmin.from("email_connections").upsert(
      {
        user_id: context.userId,
        provider: "outlook",
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

export const getOutlookMailStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("email_connections")
      .select("email_address, connected_at, expires_at, last_error")
      .eq("user_id", context.userId)
      .eq("provider", "outlook")
      .maybeSingle();
    if (!data) {
      return { connected: false, needsReconnect: false, emailAddress: null as string | null };
    }
    const { isExpired } = await import("../gmail/reauth");
    return {
      connected: true,
      needsReconnect: isExpired({ ...(data as any), provider: "outlook" }),
      emailAddress: (data as any).email_address ?? null,
    };
  });

/**
 * Desligar o email do Outlook NÃO desliga o calendário: a ligação Microsoft é
 * partilhada. Só apagamos o registo de email; a chave fica para o calendário.
 * (Os scopes de Mail deixam de ser usados; saem de vez quando o consultor
 * desligar também o calendário.)
 */
export const disconnectOutlookMail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getConnectionKeyForUser, deleteConnectionForUser } = await import(
      "@/lib/calendar/connections.server"
    );
    const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");

    const { data: cal } = await supabaseAdmin
      .from("calendar_connections")
      .select("id")
      .eq("user_id", context.userId)
      .eq("provider", OUTLOOK_CONNECTOR_ID)
      .maybeSingle();

    if (!cal) {
      // Sem calendário ligado, a ligação Microsoft já não serve para nada.
      const key = await getConnectionKeyForUser(
        supabaseAdmin,
        context.userId,
        OUTLOOK_CONNECTOR_ID,
      );
      if (key) {
        try {
          await disconnectAppUser({
            gatewayBaseUrl: GATEWAY_BASE_URL,
            connectionAPIKey: key,
            connectorId: OUTLOOK_CONNECTOR_ID,
          });
        } catch { /* segue para limpeza local */ }
      }
      await deleteConnectionForUser(supabaseAdmin, context.userId, OUTLOOK_CONNECTOR_ID);
    }

    await supabaseAdmin
      .from("email_connections")
      .delete()
      .eq("user_id", context.userId)
      .eq("provider", "outlook");
    return { ok: true };
  });
