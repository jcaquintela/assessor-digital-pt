// Reasoning Engine — Fase 3: SEARCH.

import { TOOL_REGISTRY, type DomainContext } from "../v2/domain.server";
import type { Observation, SearchName, SearchResults } from "./types";
import { foldLike } from "@/lib/search/normalize";
import { pendingSlot } from "../pending-slots";

function firstOf(observations: Observation[], type: Observation["type"]): Observation | undefined {
  return observations.find((o) => o.type === type);
}

export async function search(
  ctx: DomainContext,
  observations: Observation[],
  recommended: SearchName[],
): Promise<SearchResults> {
  const out: SearchResults = {};
  const wants = new Set(recommended);

  if (wants.has("people_by_phone")) {
    const phone = firstOf(observations, "phone")?.value;
    if (phone) {
      const nine = phone.replace(/\D/g, "").slice(-9);
      const { data } = await ctx.supabase
        .from("people")
        .select("id, name, phone, relationship_type, summary")
        .eq("user_id", ctx.userId)
        .ilike("phone", `%${nine}%`)
        .limit(5);
      out.people = (data as unknown[]) ?? [];
    }
  }

  if (wants.has("people_by_name")) {
    const nameObs = firstOf(observations, "name") ?? firstOf(observations, "reference");
    if (nameObs) {
      const r = await TOOL_REGISTRY.search_people(ctx, { query: nameObs.value });
      const existing = out.people ?? [];
      const extra = ((r.data as any)?.results as unknown[]) ?? [];
      const ids = new Set(existing.map((p: any) => p?.id));
      out.people = [...existing, ...extra.filter((p: any) => !ids.has(p?.id))];
    }
  }

  if (wants.has("properties_by_location")) {
    const addrObs = firstOf(observations, "address") ?? firstOf(observations, "name");
    if (addrObs) {
      const r = await TOOL_REGISTRY.search_properties(ctx, { query: addrObs.value });
      out.properties = ((r.data as any)?.results as unknown[]) ?? [];
    }
  }

  if (wants.has("properties_by_title")) {
    const q =
      firstOf(observations, "typology")?.value ??
      firstOf(observations, "name")?.value ??
      firstOf(observations, "reference")?.value;
    if (q) {
      const r = await TOOL_REGISTRY.search_properties(ctx, { query: q });
      const existing = (out.properties as any[]) ?? [];
      const extra = ((r.data as any)?.results as unknown[]) ?? [];
      const ids = new Set(existing.map((p: any) => p?.id));
      out.properties = [...existing, ...extra.filter((p: any) => !ids.has(p?.id))];
    }
  }

  const period =
    wants.has("agenda_today") ? "today" :
    wants.has("agenda_tomorrow") ? "tomorrow" :
    wants.has("agenda_week") ? "week" : null;
  if (period) {
    const r = await TOOL_REGISTRY.search_agenda(ctx, { period });
    out.agenda = r.data ?? null;
  }

  if (wants.has("conversation_state")) {
    const { data } = await ctx.supabase
      .from("conversation_states")
      .select("active_topic, state_summary, last_intent, last_entity_type, last_entity_id, last_created_resource_type, last_created_resource_id, last_property_id, active_person_id, goal, factual_summary, pending_action_id, sparring_turns")
      .eq("user_id", ctx.userId)
      .eq("channel", ctx.channel)
      .maybeSingle();
    out.conversation_state = data ?? null;
  }

  if (wants.has("pending_action") || wants.has("conversation_state")) {
    const { data } = await ctx.supabase
      .from("pending_actions")
      .select("id, intent, status, structured_payload, current_question, confirmed_fields, missing_fields, goal, expires_at")
      .eq("user_id", ctx.userId)
      .eq("channel", ctx.channel)
      .in("status", ["collecting_information", "pending_confirmation", "correction_pending"])
      .order("created_at", { ascending: false })
      .limit(5);
    // Só o assunto principal chega ao DECIDE. Perguntas laterais (escolhas,
    // ficheiros, âncora de esclarecimento) têm ranhura própria e não podem
    // tapar a proposta que está mesmo à espera de confirmação.
    const rows = ((data as any[]) ?? []).filter((r) => pendingSlot(r?.intent) === "main");
    out.pending_action = rows[0] ?? null;
  }

  // Prospeção — placas/leads. Usadas para deduplicação por telefone e
  // para responder a "que placas registei em X?".
  if (wants.has("prospecting_by_phone")) {
    const phone = firstOf(observations, "phone")?.value;
    if (phone) {
      const nine = phone.replace(/\D/g, "").slice(-9);
      const { data } = await ctx.supabase
        .from("prospecting_leads" as never)
        .select("id, title, phone, location, address, property_type, typology, status, listing_type, agency_name")
        .eq("user_id", ctx.userId)
        .eq("phone", nine)
        .neq("status", "archived")
        .order("created_at", { ascending: false })
        .limit(5);
      out.prospecting_leads = (data as unknown[]) ?? [];
    }
  }
  if (wants.has("prospecting_by_location")) {
    const loc =
      firstOf(observations, "address")?.value ??
      firstOf(observations, "name")?.value ??
      firstOf(observations, "reference")?.value;
    if (loc) {
      const term = `%${foldLike(String(loc)).slice(0, 60)}%`;
      const { data } = await ctx.supabase
        .from("prospecting_leads" as never)
        .select("id, title, phone, location, address, property_type, typology, status")
        .eq("user_id", ctx.userId)
        .neq("status", "archived")
        .ilike("search_norm", term)
        .order("created_at", { ascending: false })
        .limit(5);
      const existing = (out.prospecting_leads as any[]) ?? [];
      const extra = (data as any[]) ?? [];
      const ids = new Set(existing.map((p) => p?.id));
      out.prospecting_leads = [...existing, ...extra.filter((p) => !ids.has(p?.id))];
    }
  }

  return out;
}