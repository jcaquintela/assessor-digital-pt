// Fonte única do estado das integrações ao nível da plataforma.
// A Visão geral e a página de Integrações leem daqui — nunca hardcoded.

export type IntegrationStatus = "active" | "planned";

export type IntegrationInfo = {
  name: string;
  status: IntegrationStatus;
  detail: string;
};

export function getIntegrationStatuses(): IntegrationInfo[] {
  const whatsappReady =
    !!process.env.WHATSAPP_ACCESS_TOKEN &&
    !!process.env.WHATSAPP_PHONE_NUMBER_ID &&
    !!process.env.WHATSAPP_APP_SECRET &&
    !!process.env.WHATSAPP_VERIFY_TOKEN;
  const telegramReady = !!process.env.TELEGRAM_API_KEY;
  const aiReady = !!process.env.LOVABLE_API_KEY || !!process.env.OPENAI_API_KEY;

  return [
    {
      name: "WhatsApp",
      status: whatsappReady ? "active" : "planned",
      detail: whatsappReady ? "Ativo (webhook)" : "Credenciais em falta",
    },
    {
      name: "Telegram",
      status: telegramReady ? "active" : "planned",
      detail: telegramReady ? "Ativo (webhook)" : "Credenciais em falta",
    },
    {
      name: "IA (motor do Assessor)",
      status: aiReady ? "active" : "planned",
      detail: aiReady ? "Ativo" : "Credenciais em falta",
    },
    { name: "Google Calendar", status: "planned", detail: "Planeado" },
    { name: "Microsoft Outlook", status: "planned", detail: "Planeado" },
    { name: "Stripe", status: "planned", detail: "Planeado" },
  ];
}
