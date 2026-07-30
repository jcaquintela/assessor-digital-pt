// Emails de auto-registo (contas criadas via Telegram por convite/código
// promocional) são sintéticos: tg-<chatId>@shadow.assessor.local. Não servem
// para comunicar com o consultor — só ele pode corrigir isto em Definições.
export const SHADOW_EMAIL_DOMAIN = "shadow.assessor.local";

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return true;
  if (e.endsWith(`@${SHADOW_EMAIL_DOMAIN}`)) return true;
  if (e.endsWith(".local") || e.endsWith(".invalid") || e.endsWith("@example.com")) return true;
  return false;
}

export function isValidEmail(email: string): boolean {
  const e = email.trim();
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e) && !isPlaceholderEmail(e);
}
