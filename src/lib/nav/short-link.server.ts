// Criação e resolução de links curtos. Uma escrita por (consultor, destino):
// se o link já existe, reutiliza-se — o volume é baixo e o custo constante.

import { generateShortCode, isInternalPath, isShortCode, shortLinkUrl } from "./short-link";

export interface ShortLinkRow {
  code: string;
  user_id: string | null;
  target_path: string;
}

/** Devolve o código curto para um caminho interno, criando-o se necessário. */
export async function ensureShortLink(
  supabase: any,
  userId: string,
  targetPath: string,
  opts: { rnd?: () => number } = {},
): Promise<string | null> {
  if (!isInternalPath(targetPath) || !userId) return null;

  const { data: existing } = await supabase
    .from("short_links")
    .select("code")
    .eq("user_id", userId)
    .eq("target_path", targetPath)
    .maybeSingle();
  if (existing?.code) return existing.code as string;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateShortCode(6 + (attempt > 2 ? 2 : 0), opts.rnd);
    const { error } = await supabase
      .from("short_links")
      .insert({ code, user_id: userId, target_path: targetPath });
    if (!error) return code;
  }
  return null;
}

/**
 * Encurta um lote de URLs internas (mesma base). Devolve um mapa
 * url_original → url_curto; o que falhar fica de fora e mantém o original.
 */
export async function shortenUrls(
  supabase: any,
  userId: string,
  urls: string[],
  base?: string | null,
): Promise<Record<string, string>> {
  const b = String(base ?? "").trim().replace(/\/+$/, "");
  const out: Record<string, string> = {};
  for (const url of Array.from(new Set(urls.filter(Boolean)))) {
    const path = b && url.startsWith(b) ? url.slice(b.length) : url;
    if (!isInternalPath(path)) continue;
    const code = await ensureShortLink(supabase, userId, path).catch(() => null);
    if (code) out[url] = shortLinkUrl(code, b);
  }
  return out;
}

/** Resolve um código curto no caminho real. Sem código válido, nada acontece. */
export async function resolveShortLink(supabase: any, code: string): Promise<string | null> {
  if (!isShortCode(code)) return null;
  const { data } = await supabase
    .from("short_links")
    .select("target_path")
    .eq("code", code)
    .maybeSingle();
  const path = (data as any)?.target_path ?? null;
  return isInternalPath(path) ? (path as string) : null;
}
