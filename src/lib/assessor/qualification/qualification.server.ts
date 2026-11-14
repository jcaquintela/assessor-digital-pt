// Qualificação de compradores action-first (interruptor
// `assessor.action_first_qualification.v1`, por conta, desligado).
//
// Só lê: carteira própria e, com o mesmo limite diário e cache das
// pesquisas de mercado, os portais. Não escreve no domínio, não contacta
// ninguém e nunca mostra imagens.

import { isAccountFlagEnabled } from "@/lib/flags/account-flag.server";
import { foldText } from "@/lib/search/normalize";
import {
  briefFromMessages, hasMinimumCriteria, isBuyerQualification, extractBuyerBrief, type BuyerBrief,
} from "./buyer-brief";
import { composeQualificationReply, isQualificationReply, type PortalStatus } from "./compose";
import {
  fromInternalProperty, fromPortalListing, type InternalPropertyRow, type ListingProposal, type PortalListing,
} from "./proposal-format";

export const ACTION_FIRST_FLAG = "assessor.action_first_qualification.v1";
/** Uma qualificação continua viva durante 2 horas. */
export const CONTINUATION_WINDOW_MS = 2 * 3600_000;

export interface QualificationDeps {
  loadRecent(): Promise<Array<{ role: string; content: string; created_at: string }>>;
  loadProperties(): Promise<InternalPropertyRow[]>;
  searchPortals(brief: BuyerBrief): Promise<{ status: PortalStatus; results: PortalListing[] }>;
}

export function defaultDeps(supabase: any, userId: string, channel: string): QualificationDeps {
  return {
    async loadRecent() {
      const since = new Date(Date.now() - CONTINUATION_WINDOW_MS).toISOString();
      const { data } = await supabase.from("assessor_messages")
        .select("role, content, created_at")
        .eq("user_id", userId).eq("channel", channel)
        .gte("created_at", since)
        .order("created_at", { ascending: false }).limit(20);
      return ((data ?? []) as any[]).reverse();
    },
    async loadProperties() {
      const { data } = await supabase.from("properties")
        .select("id, title, typology, location, city, asking_price, status, notes")
        .eq("user_id", userId).is("archived_at", null).limit(300);
      return (data ?? []) as InternalPropertyRow[];
    },
    async searchPortals(brief) {
      const { execSearchSimilarListings } = await import("@/lib/imoveis/similar-listings.server");
      const r = await execSearchSimilarListings({ supabase, userId }, {
        typology: brief.typology?.value ?? brief.propertyType?.value ?? null,
        location: brief.zone?.value ?? null,
      });
      if (!r.ok) return { status: "failed", results: [] };
      if (r.data?.rate_limited) return { status: "rate_limited", results: [] };
      return { status: "ok", results: (r.data?.results ?? []) as PortalListing[] };
    },
  };
}

const SOLD = new Set(["vendido", "sold", "arquivado", "archived"]);

export function matchInternal(rows: InternalPropertyRow[], brief: BuyerBrief): ListingProposal[] {
  const zone = foldText(brief.zone?.value);
  const typ = foldText(brief.typology?.value).replace(/\s/g, "");
  return rows
    .filter((r) => !SOLD.has(foldText(r.status)))
    .filter((r) => !typ || foldText(r.typology).replace(/\s/g, "") === typ)
    .filter((r) => !zone || foldText(`${r.location ?? ""} ${r.city ?? ""}`).includes(zone))
    .map((r) => fromInternalProperty(r, brief));
}

function addsSomething(b: BuyerBrief): boolean {
  return !!(b.typology || b.propertyType || b.zone || b.budgetMax || b.financingApproved || b.ownFunds ||
    b.deadline || b.nearMetro || b.buyerName || b.refs.length || b.links.length);
}

export interface QualificationTurn {
  reply: string;
  acted: boolean;
  brief: BuyerBrief;
}

/**
 * Trata o turno se for qualificação de comprador (ou a continuação de uma).
 * Devolve null para deixar o motor normal responder.
 */
export async function runBuyerQualification(params: {
  supabase: any;
  userId: string;
  channel: string;
  trimmed: string;
  now?: Date;
  deps?: QualificationDeps;
  /** Só para replay de avaliação (conversas de referência): ignora o interruptor. */
  skipFlagCheck?: boolean;
}): Promise<QualificationTurn | null> {
  const { supabase, userId, channel, trimmed } = params;
  if (!params.skipFlagCheck && !(await isAccountFlagEnabled(supabase, ACTION_FIRST_FLAG, userId))) return null;
  const now = params.now ?? new Date();
  const deps = params.deps ?? defaultDeps(supabase, userId, channel);

  const recent = await deps.loadRecent();
  const lastAssistant = [...recent].reverse().find((r) => r.role === "assistant") ?? null;
  const continuing = !!lastAssistant && isQualificationReply(lastAssistant.content) &&
    now.getTime() - new Date(lastAssistant.created_at).getTime() < CONTINUATION_WINDOW_MS;

  const startsNow = isBuyerQualification(trimmed);
  if (!startsNow && !continuing) return null;
  const current = extractBuyerBrief(trimmed, now);
  if (!startsNow && !addsSomething(current)) return null;

  let users = recent.filter((r) => r.role === "user").map((r) => String(r.content ?? ""));
  if (users[users.length - 1]?.trim() !== trimmed) users.push(trimmed);
  if (!continuing) {
    users = [trimmed];
  } else {
    // Junta tudo desde a primeira mensagem de qualificação da janela; o mais
    // recente ganha. Um comprador com outro nome começa do zero.
    const first = users.findIndex((u) => isBuyerQualification(u));
    users = users.slice(Math.max(0, first));
    const prevName = briefFromMessages(users.slice(0, -1), now).brief.buyerName?.value ?? null;
    if (startsNow && current.buyerName && prevName && current.buyerName.value !== prevName) users = [trimmed];
  }
  const { brief, changes } = briefFromMessages(users, now);
  const previousReply = continuing ? lastAssistant!.content : null;

  if (!hasMinimumCriteria(brief)) {
    return {
      reply: composeQualificationReply({ brief, changes, internal: [], portal: [], portalStatus: "not_run", previousReply, now }),
      acted: false,
      brief,
    };
  }

  const [rows, portal] = await Promise.all([
    deps.loadProperties().catch(() => [] as InternalPropertyRow[]),
    deps.searchPortals(brief).catch(() => ({ status: "failed" as PortalStatus, results: [] })),
  ]);
  const internal = matchInternal(rows, brief);
  const portalProposals = portal.results.map((l) => fromPortalListing(l, brief));
  return {
    reply: composeQualificationReply({
      brief, changes, internal, portal: portalProposals, portalStatus: portal.status, previousReply, now,
    }),
    acted: true,
    brief,
  };
}
