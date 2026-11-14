// Proveniência de links e de pesquisas — última linha de defesa da resposta.
//
// - Um link na resposta que não veio de um resultado deste turno (ou do
//   próprio painel) é retirado: nunca se mostra um anúncio inventado.
// - "Pesquisei na carteira da Rede / nos portais" sem a pesquisa ter corrido
//   é substituído por uma resposta honesta.

import { foldText } from "@/lib/search/normalize";

export const REDE_NO_ACCESS_REPLY =
  "Não tenho acesso à carteira da Rede. Manda-me referências ZMPT ou links e eu analiso.";

const URL_RE = /https?:\/\/[^\s<>()*_]+/g;
const OWN_HOSTS = ["app.meuafonso.com", "meuafonso.com"];

function host(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}
const canon = (u: string) => u.replace(/[).,;:!?]+$/, "").replace(/\/$/, "");

/** Todos os URLs que aparecem nos dados devolvidos pelas ferramentas. */
export function collectToolUrls(toolResults: Array<{ ok: boolean; data?: unknown }>): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown, depth: number) => {
    if (depth > 6 || v == null) return;
    if (typeof v === "string") { for (const m of v.match(URL_RE) ?? []) out.add(canon(m)); return; }
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    if (typeof v === "object") for (const x of Object.values(v as object)) walk(x, depth + 1);
  };
  for (const t of toolResults) if (t.ok) walk(t.data, 0);
  return out;
}

export interface ProvenanceResult { reply: string; removed: string[] }

/** Retira da resposta links que não vieram de lado nenhum verificável. */
export function enforceUrlProvenance(reply: string, allowed: Set<string>, extraAllowed: string[] = []): ProvenanceResult {
  const ok = new Set([...allowed, ...extraAllowed.map(canon)]);
  const removed: string[] = [];
  const out = String(reply ?? "").replace(URL_RE, (m) => {
    const u = canon(m);
    if (ok.has(u) || OWN_HOSTS.includes(host(u))) return m;
    removed.push(u);
    return "(link por confirmar)";
  });
  return { reply: out, removed };
}

const CLAIMS_REDE_SEARCH_RE =
  /\b(pesquisei|procurei|consultei|vi|encontrei|verifiquei)\b[^.!?\n]{0,60}\b(carteira (?:da|na) rede|rede (?:zome|remax)|zome|zmpt|carteira da agencia)\b/;
const CLAIMS_PORTAL_SEARCH_RE =
  /\b(pesquisei|procurei|consultei|fui ver)\b[^.!?\n]{0,60}\b(portais?|idealista|imovirtual|supercasa|casa sapo|mercado)\b/;

/**
 * A resposta afirma uma pesquisa que não correu? A carteira da Rede nunca é
 * pesquisável (não há ligação); portais só se a ferramenta correu.
 */
export function claimsUnperformedSearch(reply: string, opts: { portalSearched: boolean }): boolean {
  const t = foldText(reply);
  if (CLAIMS_REDE_SEARCH_RE.test(t)) return true;
  return !opts.portalSearched && CLAIMS_PORTAL_SEARCH_RE.test(t);
}

export const PORTAL_NOT_SEARCHED_REPLY =
  "Não fiz nenhuma pesquisa nos portais neste momento. " + REDE_NO_ACCESS_REPLY;

export const PORTAL_TOOLS = new Set(["search_similar_listings", "search_listings_for_buyer"]);

/** Guarda completa para respostas da IA (interruptor ligado). */
export function guardSearchAndLinks(
  reply: string,
  toolResults: Array<{ name: string; ok: boolean; data?: unknown }>,
): ProvenanceResult & { replaced: boolean } {
  const portalSearched = toolResults.some((t) => t.ok && PORTAL_TOOLS.has(t.name));
  if (claimsUnperformedSearch(reply, { portalSearched })) {
    const redeClaim = CLAIMS_REDE_SEARCH_RE.test(foldText(reply));
    return { reply: redeClaim ? REDE_NO_ACCESS_REPLY : PORTAL_NOT_SEARCHED_REPLY, removed: [], replaced: true };
  }
  return { ...enforceUrlProvenance(reply, collectToolUrls(toolResults)), replaced: false };
}
