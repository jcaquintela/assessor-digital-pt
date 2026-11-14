// Angariação com pouca procura, action-first (mesmo interruptor por conta da
// qualificação: `assessor.action_first_qualification.v1`, desligado).
//
// Só lê: carteira própria, comparáveis nos portais e, para as referências
// ZMPT dadas (o imóvel e o concorrente), o anúncio no site PÚBLICO zome.pt
// (mesmo limite diário e cache das pesquisas de mercado). Não escreve, não contacta ninguém, não
// publica nem altera anúncios.

import { isAccountFlagEnabled } from "@/lib/flags/account-flag.server";
import { ACTION_FIRST_FLAG, CONTINUATION_WINDOW_MS } from "../qualification/qualification.server";
import { composeListingReply, isListingReply, type Comparable, type ComparablesStatus, type ZomeLookup } from "./compose";
import {
  extractListingBrief, hasListingIdentity, isListingDiagnosis, mergeListingBriefs, type ListingBrief,
} from "./listing-brief";
import { resolveAppBaseUrl } from "@/lib/env/app-url";

export interface ListingDeps {
  loadRecent(): Promise<Array<{ role: string; content: string; created_at: string }>>;
  findOwnListing(b: ListingBrief): Promise<{ found: boolean; price: number | null; url: string | null }>;
  searchComparables(b: ListingBrief): Promise<{ status: ComparablesStatus; results: Comparable[] }>;
  /** Anúncio público zome.pt de uma referência ZMPT. Ausente = não consultado. */
  lookupZomeRef?(ref: string): Promise<ZomeLookup>;
}

export function defaultListingDeps(supabase: any, userId: string, channel: string): ListingDeps {
  return {
    async loadRecent() {
      const since = new Date(Date.now() - CONTINUATION_WINDOW_MS).toISOString();
      const { data } = await supabase.from("assessor_messages").select("role, content, created_at")
        .eq("user_id", userId).eq("channel", channel).gte("created_at", since)
        .order("created_at", { ascending: false }).limit(20);
      return ((data ?? []) as any[]).reverse();
    },
    async findOwnListing(b) {
      if (!b.ref) return { found: false, price: null, url: null };
      const { data } = await supabase.from("properties").select("id, asking_price")
        .eq("user_id", userId).or(`title.ilike.%${b.ref}%,notes.ilike.%${b.ref}%`).limit(1);
      const row = Array.isArray(data) && data.length ? data[0] : null;
      return row
        ? { found: true, price: row.asking_price ?? null, url: `${resolveAppBaseUrl()}/imoveis/${row.id}` }
        : { found: false, price: null, url: null };
    },
    async searchComparables(b) {
      if (!b.zone) return { status: "not_run", results: [] };
      const { execSearchSimilarListings } = await import("@/lib/imoveis/similar-listings.server");
      const r = await execSearchSimilarListings({ supabase, userId }, { typology: b.typology ?? b.propertyType, location: b.zone });
      if (!r.ok) return { status: "failed", results: [] };
      if (r.data?.rate_limited) return { status: "rate_limited", results: [] };
      return { status: "ok", results: (r.data?.results ?? []) as Comparable[] };
    },
    async lookupZomeRef(ref) {
      const { lookupZomeRef } = await import("@/lib/imoveis/zome-public.server");
      return lookupZomeRef({ supabase, userId }, ref);
    },
  };
}

const ADDS_RE = /\b(t\s?\d|moradia|apartamento|impressoes|visualizacoes|cliques|leads|pedidos|contactos?|visitas?|concorrente|zmpt|preco|€|\d+\s*k\b)/;

export interface ListingTurn { reply: string; acted: boolean; brief: ListingBrief }

export async function runListingDiagnosis(params: {
  supabase: any;
  userId: string;
  channel: string;
  trimmed: string;
  now?: Date;
  deps?: ListingDeps;
  skipFlagCheck?: boolean;
}): Promise<ListingTurn | null> {
  const { supabase, userId, channel, trimmed } = params;
  if (!params.skipFlagCheck && !(await isAccountFlagEnabled(supabase, ACTION_FIRST_FLAG, userId))) return null;
  const now = params.now ?? new Date();
  const deps = params.deps ?? defaultListingDeps(supabase, userId, channel);

  const startsNow = isListingDiagnosis(trimmed);
  const recent = startsNow ? [] : await deps.loadRecent();
  const lastAssistant = [...recent].reverse().find((r) => r.role === "assistant") ?? null;
  const continuing = !startsNow && !!lastAssistant && isListingReply(lastAssistant.content) &&
    now.getTime() - new Date(lastAssistant.created_at).getTime() < CONTINUATION_WINDOW_MS;
  if (!startsNow && !continuing) return null;

  let brief: ListingBrief;
  if (startsNow) {
    brief = extractListingBrief(trimmed);
  } else {
    if (!ADDS_RE.test(trimmed.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase())) return null;
    const users = recent.filter((r) => r.role === "user").map((r) => String(r.content ?? ""));
    if (users[users.length - 1]?.trim() !== trimmed) users.push(trimmed);
    const first = Math.max(0, users.findIndex((u) => isListingDiagnosis(u)));
    brief = mergeListingBriefs(users.slice(first).map(extractListingBrief));
  }

  if (!hasListingIdentity(brief)) {
    return {
      reply: `${"*Angariação — diagnóstico*"}\n\nPara pesquisar comparáveis e preparar o kit só me falta, de uma vez:\n- Referência ZMPT ou tipologia e zona?\n- Preço pedido?\nResponde tudo numa mensagem.`,
      acted: false,
      brief,
    };
  }

  const lookup = (ref: string | null): Promise<ZomeLookup> =>
    !ref || !deps.lookupZomeRef ? Promise.resolve({ status: "not_run", listing: null })
      : deps.lookupZomeRef(ref).catch(() => ({ status: "failed" as const, listing: null }));
  const [own, comparables, zomeOwn, zomeCompetitor] = await Promise.all([
    deps.findOwnListing(brief).then((r) => ({ ran: true, ...r })).catch(() => ({ ran: false, found: false, price: null, url: null })),
    deps.searchComparables(brief).catch(() => ({ status: "failed" as ComparablesStatus, results: [] })),
    lookup(startsNow ? brief.ref : null),
    lookup(startsNow ? brief.competitorRef : null),
  ]);
  return {
    reply: composeListingReply({ brief, now, ownLookup: own, comparables, update: !startsNow, zomeOwn, zomeCompetitor }),
    acted: true,
    brief,
  };
}
