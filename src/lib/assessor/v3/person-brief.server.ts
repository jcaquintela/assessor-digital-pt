// Recolha de dados para o resumo rápido de pessoa. Só lê — nunca escreve.

import type { DomainContext } from "../v2/domain.server";
import type { PersonBrief } from "./person-brief";
import { foldLike } from "@/lib/search/normalize";
import { dropConfidential, outwardInteractionFilter } from "../culture/confidential";

export type PersonBriefLookup =
  | { kind: "not_found" }
  | { kind: "ambiguous"; names: string[] }
  | { kind: "ok"; brief: PersonBrief };

export async function buildPersonBrief(
  ctx: DomainContext,
  name: string,
  /**
   * `outward`: o resumo vai alimentar texto que SAI para fora (rascunho de
   * email a um contacto). Nesse caso as interações confidenciais nunca entram.
   * `personId`: quando o chamador já sabe de quem se trata, não há ambiguidade.
   */
  opts?: { outward?: boolean; personId?: string | null },
): Promise<PersonBriefLookup> {
  const { supabase, userId } = ctx;

  const base = supabase
    .from("people")
    .select("id, name, phone, relationship_type, summary, next_action, next_action_date")
    .eq("user_id", userId);
  const { data: people } = opts?.personId
    ? await base.eq("id", opts.personId).limit(1)
    : await base
        .ilike("name_norm", `%${foldLike(name)}%`)
        .order("updated_at", { ascending: false })
        .limit(5);

  const rows = (people as any[]) ?? [];
  if (!rows.length) return { kind: "not_found" };

  let person = rows[0];
  if (rows.length > 1) {
    const lower = name.trim().toLowerCase();
    const exact = rows.filter((r) => String(r.name ?? "").trim().toLowerCase() === lower);
    if (exact.length === 1) person = exact[0];
    else if (exact.length > 1 || rows.length > 1) {
      // Nomes distintos → pergunta; variações do mesmo nome → usa o mais recente.
      const distinct = Array.from(new Set(rows.map((r) => String(r.name ?? "").trim())));
      if (distinct.length > 1) return { kind: "ambiguous", names: distinct };
    }
  }

  // Texto que sai para fora nunca leva notas confidenciais.
  const interactionsQ = (() => {
    const q = supabase
      .from("interactions")
      .select("summary, original_content, occurred_at, created_at, is_confidential")
      .eq("user_id", userId)
      .eq("person_id", person.id);
    return (opts?.outward ? outwardInteractionFilter(q) : q)
      .order("occurred_at", { ascending: false })
      .limit(opts?.outward ? 5 : 1);
  })();

  const [interactionsR, propertiesR, opportunitiesR, followUpsR] = await Promise.all([
    interactionsQ,
    supabase
      .from("properties")
      .select("title, status, asking_price")
      .eq("user_id", userId)
      .eq("owner_person_id", person.id)
      .order("updated_at", { ascending: false })
      .limit(3),
    supabase
      .from("opportunities")
      .select("type, status, value, next_action, next_action_date")
      .eq("user_id", userId)
      .eq("person_id", person.id)
      .order("updated_at", { ascending: false })
      .limit(3),
    supabase
      .from("follow_ups")
      .select("title, due_date, status")
      .eq("user_id", userId)
      .eq("person_id", person.id)
      .in("status", ["pending", "scheduled", "aguarda_resultado"])
      .order("due_date", { ascending: true })
      .limit(1),
  ]);

  // Segunda rede: mesmo que a query falhe o filtro, nada confidencial passa.
  const interRows = dropConfidential(((interactionsR as any)?.data as any[]) ?? []);
  const inter = interRows[0] ?? null;
  const props = (((propertiesR as any)?.data as any[]) ?? []).map((p) => ({
    title: String(p.title ?? "Imóvel"),
    status: p.status ?? null,
    price: p.asking_price ?? null,
  }));
  const deals = (((opportunitiesR as any)?.data as any[]) ?? []).map((o) => ({
    label: String(o.type ?? "negócio"),
    value: o.value ?? null,
    status: o.status ?? null,
  }));
  const fu = ((followUpsR as any)?.data as any[])?.[0] ?? null;
  const opWithNext = (((opportunitiesR as any)?.data as any[]) ?? []).find((o) => o.next_action);

  const nextAction =
    fu?.title
      ? { text: String(fu.title), when: fu.due_date ?? null }
      : person.next_action
        ? { text: String(person.next_action), when: person.next_action_date ?? null }
        : opWithNext
          ? { text: String(opWithNext.next_action), when: opWithNext.next_action_date ?? null }
          : null;

  const lastText = String(inter?.summary ?? inter?.original_content ?? "").trim() || String(person.summary ?? "").trim();

  const brief: PersonBrief = {
    name: String(person.name ?? name),
    relationship: person.relationship_type ?? null,
    phone: person.phone ?? null,
    lastInteraction: lastText
      ? { when: inter ? (inter.occurred_at ?? inter.created_at ?? null) : null, text: lastText }
      : null,
    properties: props,
    deals,
    nextAction,
  };

  return { kind: "ok", brief };
}
