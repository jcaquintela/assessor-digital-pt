// Liga a descrição falada ("terreno de Canelas") ao que já existe na base:
// um imóvel registado, visitas marcadas e dinheiro solto. É isto que permite
// ao assessor perceber que a visita da semana passada e a comissão de hoje
// são o mesmo processo — mesmo sem ficha de imóvel criada.

import { textMatchesHint, propertyTitleFromHint, type PropertyHint } from "./property-hint";

type Row = Record<string, any>;

/** Imóvel já registado que corresponde à descrição, se existir. */
export async function findPropertyByHint(
  supabase: any,
  userId: string,
  hint: PropertyHint,
): Promise<{ id: string; title: string } | null> {
  const { data } = await supabase
    .from("properties")
    .select("id, title, location, property_type, archived_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = ((data ?? []) as Row[]).filter((r) => !r.archived_at);
  const match = rows.find((r) =>
    textMatchesHint(`${r.title ?? ""} ${r.location ?? ""} ${r.property_type ?? ""}`, hint),
  );
  return match ? { id: match.id as string, title: (match.title as string) ?? "" } : null;
}

/** Cria o imóvel a partir da descrição (só quando o consultor confirma). */
export async function createPropertyFromHint(
  supabase: any,
  userId: string,
  hint: PropertyHint,
  value?: number | null,
): Promise<{ id: string; title: string }> {
  const title = propertyTitleFromHint(hint);
  const { data, error } = await supabase
    .from("properties")
    .insert({
      user_id: userId,
      title,
      property_type: hint.type,
      location: hint.location,
      status: "Angariado",
      value: value && value > 0 ? value : null,
    } as never)
    .select("id, title")
    .single();
  if (error) throw new Error(error.message);
  return { id: (data as Row).id as string, title: (data as Row).title as string };
}

export interface HintVisit {
  id: string;
  title: string;
  personId: string | null;
  propertyId: string | null;
  when: string | null;
}

/** Visitas (agenda e interações) que falam do mesmo imóvel descrito. */
export async function findVisitsForHint(
  supabase: any,
  userId: string,
  hint: PropertyHint,
  opts?: { days?: number },
): Promise<HintVisit[]> {
  const days = opts?.days ?? 180;
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const out: HintVisit[] = [];

  const { data: fups } = await supabase
    .from("follow_ups")
    .select("id, title, notes, type, person_id, related_property_id, due_date")
    .eq("user_id", userId)
    .gte("due_date", since)
    .order("due_date", { ascending: false })
    .limit(120);
  for (const f of ((fups ?? []) as Row[])) {
    const isVisit = /visit/i.test(String(f.type ?? "")) || /\bvisita/i.test(String(f.title ?? ""));
    if (!isVisit) continue;
    if (!textMatchesHint(`${f.title ?? ""} ${f.notes ?? ""}`, hint)) continue;
    out.push({
      id: f.id, title: String(f.title ?? "Visita"),
      personId: f.person_id ?? null, propertyId: f.related_property_id ?? null,
      when: f.due_date ?? null,
    });
  }

  const { data: inter } = await supabase
    .from("interactions")
    .select("id, summary, original_content, interaction_type, person_id, property_id, occurred_at")
    .eq("user_id", userId)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(120);
  for (const i of ((inter ?? []) as Row[])) {
    const text = `${i.summary ?? ""} ${i.original_content ?? ""}`;
    if (!/\bvisit/i.test(`${text} ${i.interaction_type ?? ""}`)) continue;
    if (!textMatchesHint(text, hint)) continue;
    out.push({
      id: i.id, title: String(i.summary ?? "Visita"),
      personId: i.person_id ?? null, propertyId: i.property_id ?? null,
      when: i.occurred_at ?? null,
    });
  }

  return out;
}