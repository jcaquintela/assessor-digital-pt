// Provedores de email suportados. Ficheiro seguro para o browser:
// só nomes, labels e caminhos — nunca chaves.

export type MailProvider = "gmail" | "outlook";

export const MAIL_PROVIDERS: MailProvider[] = ["gmail", "outlook"];

export const MAIL_PROVIDER_LABEL: Record<MailProvider, string> = {
  gmail: "Gmail",
  outlook: "Outlook (email)",
};

/** Conector do gateway por provedor de email. */
export const MAIL_CONNECTOR_ID: Record<MailProvider, string> = {
  gmail: "google_mail",
  // O Outlook é um só conector para email e calendário — a mesma ligação
  // Microsoft serve os dois módulos (decisão de 15/08, opção A).
  outlook: "microsoft_outlook",
};

/**
 * Ligar o Gmail está desativado em produção: os scopes gmail.readonly e
 * gmail.compose foram retirados da submissão de verificação Google.
 * O conector fica dormente (código intacto) mas nenhum ecrã pode iniciar o
 * fluxo OAuth. Voltar a true só depois de os scopes serem verificados.
 */
export const GMAIL_CONNECT_ENABLED = false;

export function isMailProvider(v: unknown): v is MailProvider {
  return v === "gmail" || v === "outlook";
}
