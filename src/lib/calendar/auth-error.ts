// Ligação de calendário expirada ou revogada.
//
// Quando o consultor retira o acesso no Google (ou o refresh token morre), o
// gateway devolve 401/403 — ou uma mensagem de credenciais em falta. Nessa
// altura não vale a pena "tentar outra vez": o consultor tem de voltar a
// autorizar. Este módulo é puro (sem I/O) para poder ser testado.

const REAUTH_TEXT_RE =
  /(invalid_grant|invalid_token|token[_\s-]?(expired|revoked)|credentials not found|unauthorized|insufficient authentication|permission_denied)/i;

/** A resposta do gateway/provider indica que é preciso voltar a autorizar? */
export function isCalendarAuthError(status: number, body: string | null | undefined): boolean {
  if (status === 401 || status === 403) return true;
  return REAUTH_TEXT_RE.test(String(body ?? ""));
}

/** O erro guardado em `calendar_sync_state.last_error` é de autorização? */
export function needsReconnect(lastError: string | null | undefined): boolean {
  const raw = String(lastError ?? "").trim();
  if (!raw) return false;
  const status = Number(raw.match(/^(\d{3})\s*:/)?.[1] ?? 0);
  return isCalendarAuthError(status, raw);
}