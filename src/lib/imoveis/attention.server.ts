// Mesma régua do mentor em /hoje (10 dias sem contacto real para imóveis),
// mas focada nos que continuam "Por angariar". Sem caso real, devolve null.
export interface PropertyAttention {
  count: number;
  days: number;
  first: { id: string; title: string };
}

export async function computePropertyAttention(supabase: any, userId: string): Promise<PropertyAttention | null> {
  const now = Date.now();
  const dias = (iso: string | null) => (iso ? Math.floor((now - new Date(iso).getTime()) / 864e5) : 0);
  const maisRecente = (...vals: (string | null | undefined)[]) => {
    const ts = vals.filter(Boolean).map((v) => new Date(v as string).getTime()).filter((n) => !Number.isNaN(n));
    return ts.length ? new Date(Math.max(...ts)).toISOString() : null;
  };

  const [props, ints, done] = await Promise.all([
    supabase.from("properties").select("id, title, status, created_at").eq("user_id", userId).limit(500),
    supabase.from("interactions").select("property_id, occurred_at").eq("user_id", userId),
    supabase.from("follow_ups").select("related_property_id, outcome_recorded_at")
      .eq("user_id", userId).not("outcome_recorded_at", "is", null),
  ]);

  const last = new Map<string, string | null>();
  for (const r of ((ints.data as any[]) ?? [])) {
    if (r.property_id) last.set(r.property_id, maisRecente(last.get(r.property_id), r.occurred_at));
  }
  for (const r of ((done.data as any[]) ?? [])) {
    const id = r.related_property_id;
    if (id) last.set(id, maisRecente(last.get(id), r.outcome_recorded_at));
  }

  const parados = ((props.data as any[]) ?? [])
    .filter((p) => String(p.status ?? "") === "por_angariar")
    .map((p) => ({
      id: p.id as string,
      title: String(p.title ?? "").trim() || "Imóvel sem título",
      days: dias(last.get(p.id) ?? p.created_at ?? null),
    }))
    .filter((p) => p.days >= 10)
    .sort((a, b) => b.days - a.days);

  if (!parados.length) return null;
  return { count: parados.length, days: parados[0].days, first: { id: parados[0].id, title: parados[0].title } };
}
