// Fonte única do estado das integrações ao nível da plataforma.
// A Visão geral e a página de Integrações leem daqui — nunca hardcoded.
//
// Distinção importante (era enganadora antes): esta lista responde a
// "a integração está montada e com credenciais no servidor?" — NÃO a
// "quantos consultores é que a têm ligada". Para as integrações que cada
// consultor liga à sua própria conta (calendários), devolvemos também o
// número de contas ligadas, lido de `app_user_connections`.

export type IntegrationStatus = "active" | "planned";

export type IntegrationInfo = {
  name: string;
  status: IntegrationStatus;
  detail: string;
  /** "plataforma" = uma ligação para todos; "por consultor" = cada um liga a sua. */
  scope: "plataforma" | "por consultor";
  /** Contas de consultor ligadas (só faz sentido em scope "por consultor"). */
  connectedAccounts?: number;
};

export async function getIntegrationStatuses(
  supabaseAdmin?: any,
): Promise<IntegrationInfo[]> {
  const whatsappReady =
    !!process.env.WHATSAPP_ACCESS_TOKEN &&
    !!process.env.WHATSAPP_PHONE_NUMBER_ID &&
    !!process.env.WHATSAPP_APP_SECRET &&
    !!process.env.WHATSAPP_VERIFY_TOKEN;
  const telegramReady = !!process.env.TELEGRAM_API_KEY;
  const aiReady = !!process.env.LOVABLE_API_KEY || !!process.env.OPENAI_API_KEY;
  const googleReady = !!process.env.GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY;
  const outlookReady = !!process.env.MICROSOFT_OUTLOOK_APP_USER_CONNECTOR_CLIENT_API_KEY;
  const stripeReady = !!process.env.STRIPE_SECRET_KEY;

  const counts: Record<string, number> = {};
  if (supabaseAdmin) {
    const { data } = await supabaseAdmin
      .from("app_user_connections")
      .select("connector_id");
    for (const r of data ?? []) {
      const k = (r as any).connector_id as string;
      counts[k] = (counts[k] ?? 0) + 1;
    }
  }

  const perConsultant = (
    name: string,
    connectorId: string,
    ready: boolean,
  ): IntegrationInfo => {
    const n = counts[connectorId] ?? 0;
    return {
      name,
      status: ready ? "active" : "planned",
      scope: "por consultor",
      connectedAccounts: n,
      detail: ready
        ? `Disponível (OAuth por consultor) · ${n} conta(s) ligada(s)`
        : "Credenciais do cliente OAuth em falta",
    };
  };

  return [
    {
      name: "WhatsApp",
      status: whatsappReady ? "active" : "planned",
      scope: "plataforma",
      detail: whatsappReady ? "Ativo (webhook)" : "Credenciais em falta",
    },
    {
      name: "Telegram",
      status: telegramReady ? "active" : "planned",
      scope: "plataforma",
      detail: telegramReady ? "Ativo (webhook)" : "Credenciais em falta",
    },
    {
      name: "IA (motor do Assessor)",
      status: aiReady ? "active" : "planned",
      scope: "plataforma",
      detail: aiReady ? "Ativo" : "Credenciais em falta",
    },
    perConsultant("Google Calendar", "google_calendar", googleReady),
    perConsultant("Microsoft Outlook", "microsoft_outlook", outlookReady),
    {
      name: "Stripe",
      status: stripeReady ? "active" : "planned",
      scope: "plataforma",
      detail: stripeReady ? "Ativo" : "Não implementado (planos geridos à mão)",
    },
  ];
}
