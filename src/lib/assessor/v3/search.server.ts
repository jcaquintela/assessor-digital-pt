// Reasoning Engine — Fase 3: SEARCH.

import { TOOL_REGISTRY, type DomainContext } from "../v2/domain.server";
import type { Observation, SearchName, SearchResults } from "./types";

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
      .select("active_topic, state_summary, last_intent, last_property_id, active_person_id, goal, factual_summary, pending_action_id")
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
      .limit(1)
      .maybeSingle();
    out.pending_action = data ?? null;
  }

  return out;
}