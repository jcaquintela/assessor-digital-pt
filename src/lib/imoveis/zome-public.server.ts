// Pesquisa no site PÚBLICO zome.pt (via Firecrawl, pelo gateway). Só leitura.
//
// Mesmo orçamento das pesquisas de mercado: cache de 24h e o limite diário
// SIMILAR_MAX_PER_DAY contam juntos (tabela similar_listing_searches). Se a
// fonte falhar, devolve "failed" — quem responde diz a limitação e não
// mostra nada inventado.

import { fetchListingsFromGateway } from "./similar-listings.server";
import { SIMILAR_CACHE_HOURS, SIMILAR_MAX_PER_DAY } from "./similar-listings";
import {
  filterZomeResults, normalizeZmpt, parseZomeListingUrl, parseZomePage, zomeInZone, zomeRefQuery, zomeSearchQuery,
  type ZomeListing,
} from "./zome-public";
import { foldText } from "@/lib/search/normalize";

/** Páginas lidas por pesquisa (as restantes ficam "visto na pesquisa"). */
export const PAGES_PER_SEARCH = 3;

export const FIRECRAWL_SCRAPE_URL = "https://connector-gateway.lovable.dev/firecrawl/v2/scrape";

export type ZomeStatus = "ok" | "rate_limited" | "failed" | "not_run";

interface Ctx { supabase: any; userId: string }

export async function fetchPageFromGateway(url: string, fetchImpl: typeof fetch = fetch): Promise<{ markdown: string; title: string | null }> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["FIRECRAWL_API_KEY"];
  if (!lovableKey || !connectionKey) throw new Error("firecrawl_not_configured");
  const res = await fetchImpl(FIRECRAWL_SCRAPE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": connectionKey },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
  });
  if (!res.ok) throw new Error(`firecrawl_scrape_failed [${res.status}]: ${await res.text()}`);
  const body = (await res.json()) as { data?: { markdown?: string; metadata?: { title?: string } } };
  return { markdown: String(body?.data?.markdown ?? ""), title: body?.data?.metadata?.title ?? null };
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function cached(ctx: Ctx, key: string): Promise<ZomeListing[] | null> {
  try {
    const since = new Date(Date.now() - SIMILAR_CACHE_HOURS * 3600_000).toISOString();
    const { data } = await ctx.supabase.from("similar_listing_searches").select("results")
      .eq("user_id", ctx.userId).eq("cache_key", key).gte("created_at", since)
      .order("created_at", { ascending: false }).limit(1);
    const hit = Array.isArray(data) && data.length ? data[0] : null;
    return hit ? ((hit.results ?? []) as ZomeListing[]) : null;
  } catch { return null; }
}

async function overDailyLimit(ctx: Ctx): Promise<boolean> {
  try {
    const { count } = await ctx.supabase.from("similar_listing_searches")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.userId).eq("cache_hit", false).gte("created_at", startOfTodayIso());
    return typeof count === "number" && count >= SIMILAR_MAX_PER_DAY;
  } catch { return false; }
}

async function record(ctx: Ctx, key: string, query: string, results: ZomeListing[]) {
  try {
    await ctx.supabase.from("similar_listing_searches").insert({ user_id: ctx.userId, cache_key: key, query, results, cache_hit: false });
  } catch { /* registo é bónus */ }
}

export interface ZomeNet {
  search(query: string): Promise<Array<{ url?: string; title?: string; description?: string }>>;
  scrape(url: string): Promise<{ markdown: string; title: string | null }>;
}
const defaultNet: ZomeNet = { search: (q) => fetchListingsFromGateway(q, 15), scrape: (u) => fetchPageFromGateway(u) };

/** Anúncios públicos zome.pt para uma tipologia/zona (só resultados da pesquisa). */
export async function searchZomePublic(
  ctx: Ctx, p: { typology?: string | null; propertyType?: string | null; location?: string | null }, net: ZomeNet = defaultNet,
): Promise<{ status: ZomeStatus; results: ZomeListing[] }> {
  const query = zomeSearchQuery(p);
  if (!query) return { status: "not_run", results: [] };
  const key = `zome|${foldText(p.location)}|${foldText(p.typology ?? p.propertyType)}`;
  const hit = await cached(ctx, key);
  if (hit) return { status: "ok", results: hit };
  if (await overDailyLimit(ctx)) return { status: "rate_limited", results: [] };
  let raw;
  try { raw = await net.search(query); } catch (err) {
    console.error("[zome-public] search failed", err instanceof Error ? err.message : err);
    return { status: "failed", results: [] };
  }
  const found = filterZomeResults(raw, 8).filter((l) => zomeInZone(l, p.location)).slice(0, 5);
  // Lê a página dos primeiros (preço, área, vendido/reservado). Um vendido
  // nunca é proposto; se a página falhar fica o resultado da pesquisa.
  const read = await Promise.all(found.map(async (l, n) => {
    if (n >= PAGES_PER_SEARCH) return l;
    try {
      const page = await net.scrape(l.url);
      return parseZomePage(l.url, page.markdown, page.title) ?? l;
    } catch { return l; }
  }));
  const results = read.filter((l) => l.status !== "vendido");
  await record(ctx, key, query, results);
  return { status: "ok", results };
}

/**
 * Consulta de uma referência ZMPT no site público: encontra o anúncio e lê
 * a própria página (preço, área). Sem página lida, fica só o que o URL diz.
 */
export async function lookupZomeRef(
  ctx: Ctx, ref: string, net: ZomeNet = defaultNet,
): Promise<{ status: ZomeStatus; listing: ZomeListing | null }> {
  const r = normalizeZmpt(ref);
  const query = r ? zomeRefQuery(r) : null;
  if (!r || !query) return { status: "not_run", listing: null };
  const key = `zome-ref|${r}`;
  const hit = await cached(ctx, key);
  if (hit) return { status: "ok", listing: hit[0] ?? null };
  if (await overDailyLimit(ctx)) return { status: "rate_limited", listing: null };
  let raw;
  try { raw = await net.search(query); } catch (err) {
    console.error("[zome-public] ref search failed", err instanceof Error ? err.message : err);
    return { status: "failed", listing: null };
  }
  const matches = (raw ?? []).map((x) => parseZomeListingUrl(String(x?.url ?? ""))).filter((f) => f?.ref === r);
  // Prefere o endereço /pt/ com localização no próprio URL.
  const found = matches.find((f) => f!.location) ?? matches[0] ?? null;
  let listing: ZomeListing | null = null;
  if (found) {
    try {
      const page = await net.scrape(found.url);
      listing = parseZomePage(found.url, page.markdown, page.title);
    } catch (err) {
      console.error("[zome-public] page read failed", err instanceof Error ? err.message : err);
    }
    listing ??= filterZomeResults([{ url: found.url, title: raw.find((x) => parseZomeListingUrl(String(x?.url ?? ""))?.ref === r)?.title ?? null }], 1)[0] ?? null;
  }
  await record(ctx, key, query, listing ? [listing] : []);
  return { status: "ok", listing };
}
