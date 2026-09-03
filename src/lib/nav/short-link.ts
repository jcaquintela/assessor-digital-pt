// Encurtador de links: parte pura (código e URL). A escrita vive no .server.
//
// O link curto é só um atalho de navegação: aponta para o caminho real da
// aplicação, que continua a exigir sessão e a respeitar as regras de acesso.

const ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export const SHORT_LINK_PREFIX = "/s/";
export const SHORT_CODE_MIN = 6;
export const SHORT_CODE_MAX = 8;

/** Código curto alfanumérico (6 caracteres por omissão, sem letras ambíguas). */
export function generateShortCode(len = SHORT_CODE_MIN, rnd: () => number = Math.random): string {
  const n = Math.min(SHORT_CODE_MAX, Math.max(SHORT_CODE_MIN, Math.floor(len)));
  let out = "";
  for (let i = 0; i < n; i++) out += ALPHABET[Math.floor(rnd() * ALPHABET.length)] ?? "a";
  return out;
}

export function isShortCode(code: unknown): boolean {
  return typeof code === "string" && new RegExp(`^[A-Za-z0-9]{${SHORT_CODE_MIN},${SHORT_CODE_MAX}}$`).test(code);
}

/** URL do link curto. Sem base devolve caminho relativo. */
export function shortLinkUrl(code: string, base?: string | null): string {
  const b = String(base ?? "").trim().replace(/\/+$/, "");
  return `${b}${SHORT_LINK_PREFIX}${code}`;
}

/**
 * Só aceitamos caminhos internos. Nunca redirecionamos para outro domínio,
 * mesmo que alguém consiga escrever na tabela.
 */
export function isInternalPath(path: unknown): boolean {
  return typeof path === "string" && /^\/[^/\\]/.test(path) && !path.startsWith("//");
}
