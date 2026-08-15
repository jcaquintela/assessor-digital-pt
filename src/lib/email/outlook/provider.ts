// Configuração do Outlook Mail (Microsoft Graph via App User Connector).
//
// Decisão de produto (15/08): o Afonso lê e prepara rascunhos, nunca envia.
// Por isso pedimos `Mail.Read` (ler) + `Mail.ReadWrite` (criar rascunho) e
// NUNCA `Mail.Send`. No Graph, enviar exige `Mail.Send` — sem esse scope não
// existe caminho possível de envio automático.
//
// Ao contrário da Google, o Microsoft Graph não classifica estes scopes como
// "restricted": não há auditoria anual, nem limite de test users, nem token a
// expirar de 7 em 7 dias. Depende apenas da política de consentimento do
// tenant, tal como já acontece com `Calendars.ReadWrite`.

export const OUTLOOK_CONNECTOR_ID = "microsoft_outlook";

export const OUTLOOK_MAIL_SCOPES = ["Mail.Read", "Mail.ReadWrite"];

export const OUTLOOK_BASE_SCOPES = ["openid", "profile", "email", "offline_access"];

/** Calendário + email na mesma autorização: é uma só ligação Microsoft. */
export const OUTLOOK_CALENDAR_SCOPE = "Calendars.ReadWrite";

export function microsoftScopes(opts: { mail: boolean; calendar: boolean }): string[] {
  const out = [...OUTLOOK_BASE_SCOPES];
  if (opts.calendar) out.push(OUTLOOK_CALENDAR_SCOPE);
  if (opts.mail) out.push(...OUTLOOK_MAIL_SCOPES);
  return out;
}

export const OUTLOOK_CLIENT_KEY_ENV = "MICROSOFT_OUTLOOK_APP_USER_CONNECTOR_CLIENT_API_KEY";

export const OUTLOOK_MAIL_RETURN_PATH = "/oauth/outlook-mail/return";

export const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";

export const GRAPH_API_BASE = "/v1.0";
