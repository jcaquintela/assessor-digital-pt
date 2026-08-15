// Autorização do Gmail em modo Teste: o Google invalida o acesso ao fim de
// 7 dias. Nunca pode falhar em silêncio — o Afonso avisa antes de partir.

import { GMAIL_TEST_MODE_TOKEN_DAYS } from "./provider";

export type GmailConnectionState = {
  connected_at?: string | null;
  expires_at?: string | null;
  reauth_warned_at?: string | null;
  last_error?: string | null;
};

/** Data prevista de expiração: explícita, ou 7 dias depois de ligar. */
export function expiryOf(conn: GmailConnectionState): Date | null {
  if (conn.expires_at) return new Date(conn.expires_at);
  if (conn.connected_at) {
    return new Date(
      new Date(conn.connected_at).getTime() + GMAIL_TEST_MODE_TOKEN_DAYS * 24 * 3600 * 1000,
    );
  }
  return null;
}

export function hoursUntilExpiry(conn: GmailConnectionState, now = new Date()): number | null {
  const exp = expiryOf(conn);
  if (!exp || Number.isNaN(exp.getTime())) return null;
  return (exp.getTime() - now.getTime()) / 3600_000;
}

/** Avisa a 24h do fim, e no máximo uma vez por dia. */
export function shouldWarnReauth(conn: GmailConnectionState, now = new Date()): boolean {
  const h = hoursUntilExpiry(conn, now);
  if (h === null) return false;
  if (h > 24) return false;
  if (conn.reauth_warned_at) {
    const since = now.getTime() - new Date(conn.reauth_warned_at).getTime();
    if (since < 24 * 3600_000) return false;
  }
  return true;
}

export function isExpired(conn: GmailConnectionState, now = new Date()): boolean {
  const h = hoursUntilExpiry(conn, now);
  return h !== null && h <= 0;
}

/** O Gmail respondeu 401/403 por autorização caducada (não por falta de scope). */
export function isAuthError(status: number, body?: string): boolean {
  if (status !== 401 && status !== 403) return false;
  const b = String(body ?? "").toLowerCase();
  if (b.includes("insufficient authentication scopes")) return false;
  return true;
}

export function reauthWarningMessage(hoursLeft: number | null): string {
  if (hoursLeft !== null && hoursLeft > 0) {
    const h = Math.max(1, Math.round(hoursLeft));
    return `O acesso ao teu email expira dentro de ${h}h — o Google obriga a renovar de 7 em 7 dias enquanto estamos em testes. Volta a ligar em Definições para eu não perder o acesso.`;
  }
  return "Perdi o acesso ao teu email — o Google corta a autorização de 7 em 7 dias enquanto estamos em testes. Liga outra vez em Definições e continuo daí.";
}

export function expiredMessage(): string {
  return reauthWarningMessage(null);
}