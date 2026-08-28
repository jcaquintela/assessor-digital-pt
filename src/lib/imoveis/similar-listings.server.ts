// Comparáveis de mercado — pesquisa web dirigida via connector Firecrawl.
//
// Ponto de integração: o connector está em modo gateway, por isso as chamadas
// vão a connector-gateway.lovable.dev/firecrawl/v2/search com
// Authorization: Bearer $LOVABLE_API_KEY + X-Connection-Api-Key: $FIRECRAWL_API_KEY.
// Nunca chamar api.firecrawl.dev diretamente.

import {
  buildListingQuery, filterListings, similarListingsCacheKey,
  SIMILAR_CACHE_HOURS, SIMILAR_MAX_PER_DAY,
  type PropertyBrief, type SimilarListing, type SimilarListingsPayload,
} from "./similar-listings";

export const FIRECRAWL_SEARCH_URL =
  "https://connector-gateway.lovable.dev/firecrawl/v2/search";

interface Ctx {
  supabase: any;
  userId: string;
}

export interface GatewayResponse {
  success?: boolean;
  data?: { web?: Array<{ url?: string; title?: string; description?: string }> };
}

/** Extrai os resultados web da resposta do gateway (formato confirmado em 200). */
export function parseGatewayResults(body: unknown): Array<{ url?: string; title?: string; description?: string }> {
  const b = body as GatewayResponse | null;
  const web = b?.data?.web;
  return Array.isArray(web) ? web : [];
}

export async function fetchListingsFromGateway(
  query: string,
  limit = 15,
  fetchImpl: typeof fetch = fetch,
): Promise<Array<{ url?: string; title?: string; description?: string }>> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["FIRECRAWL_API_KEY"];
  if (!lovableKey || !connectionKey) throw new Error("firecrawl_not_configured");
  const res = await fetchImpl(FIRECRAWL_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connectionKey,
    },
    body: JSON.stringify({ query, limit }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`firecrawl_gateway_failed [${res.status}]: ${text}`);
  }
  return parseGatewayResults(await res.json());
}

async function loadBrief(ctx: Ctx, args: any): Promise<{ brief: PropertyBrief; label: string | null }> {
  const cols = "id, title, typology, property_type, location, city, asking_price";
  let row: any = null;
  if (args?.property_id) {
    const { data } = await ctx.supabase.from("properties").select(cols)
      .eq("user_id", ctx.userId).eq("id", args.property_id).maybeSingle();
    row = data ?? null;
  } else if (typeof args?.property_query === "string" && args.property_query.trim().length >= 2) {
    const q = args.property_query.trim().toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const { data } = await ctx.supabase.from("properties").select(cols)
      .eq("user_id", ctx.userId).ilike("search_norm", `%${q}%`)
      .order("updated_at", { ascending: false }).limit(1);
    row = Array.isArray(data) && data.length ? data[0] : null;
  }
  const brief: PropertyBrief = {
    typology: args?.typology ?? row?.typology ?? null,
    location: args?.location ?? row?.location ?? null,
    city: row?.city ?? null,
    property_type: row?.property_type ?? null,
    asking_price: row?.asking_price ?? null,
    title: row?.title ?? null,
  };
  return { brief, label: row?.title ?? null };
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Ferramenta de LEITURA: não escreve nada no domínio. Só regista a pesquisa
 * (cache 24h + limite diário) para não queimar créditos.
 */
export async function execSearchSimilarListings(
  ctx: Ctx,
  args: unknown,
): Promise<{ ok: boolean; data?: SimilarListingsPayload; error?: string }> {
  const a = (args ?? {}) as Record<string, unknown>;
  const { brief, label } = await loadBrief(ctx, a);
  const plan = buildListingQuery(brief);
  if (!plan.canSearch) {
    return { ok: true, data: { needs_field: true, missing: plan.missing, property_label: label } };
  }

  const cacheKey = similarListingsCacheKey(plan);

  // Cache de 24h por (zona, tipologia, faixa de preço).
  const since = new Date(Date.now() - SIMILAR_CACHE_HOURS * 3600 * 1000).toISOString();
  try {
    const { data: cached } = await ctx.supabase
      .from("similar_listing_searches")
      .select("results")
      .eq("user_id", ctx.userId).eq("cache_key", cacheKey)
      .gte("created_at", since)
      .order("created_at", { ascending: false }).limit(1);
    const hit = Array.isArray(cached) && cached.length ? cached[0] : null;
    if (hit) {
      return {
        ok: true,
        data: {
          results: (hit.results ?? []) as SimilarListing[],
          partial: plan.partial,
          property_label: label,
        },
      };
    }
  } catch { /* cache é bónus; nunca bloqueia a pesquisa */ }

  // Limite diário por consultor (só contam pesquisas reais).
  try {
    const { count } = await ctx.supabase
      .from("similar_listing_searches")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.userId).eq("cache_hit", false)
      .gte("created_at", startOfTodayIso());
    if (typeof count === "number" && count >= SIMILAR_MAX_PER_DAY) {
      return { ok: true, data: { rate_limited: true, property_label: label } };
    }
  } catch { /* noop */ }

  let raw: Array<{ url?: string; title?: string; description?: string }>;
  try {
    raw = await fetchListingsFromGateway(plan.query);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  const results = filterListings(raw, 5);

  try {
    await ctx.supabase.from("similar_listing_searches").insert({
      user_id: ctx.userId,
      cache_key: cacheKey,
      query: plan.query,
      results,
      cache_hit: false,
    });
  } catch { /* registo é bónus */ }

  return { ok: true, data: { results, partial: plan.partial, property_label: label } };
}
