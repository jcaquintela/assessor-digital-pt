// Mesma régua do mentor em /hoje (60 dias sem contacto real), mas focada
// numa pessoa concreta. Sem caso real, devolve null — nunca se inventa nada.
export interface PersonAttention {
  personId: string;
  name: string;
  days: number;
  everContacted: boolean;
}

export async function computePersonAttention(supabase: any, userId: string): Promise<PersonAttention | null> {
  const now = Date.now();
  const days = (iso: string | null) => (iso ? Math.floor((now - new Date(iso).getTime()) / 864e5) : 0);
  const latest = (...vals: (string | null | undefined)[]) => {
    const ts = vals.filter(Boolean).map((v) => new Date(v as string).getTime()).filter((n) => !Number.isNaN(n));
    return ts.length ? new Date(Math.max(...ts)).toISOString() : null;
  };

  const [people, ints, done] = await Promise.all([
    supabase.from("people").select("id, name, created_at").eq("user_id", userId).limit(500),
    supabase.from("interactions").select("person_id, occurred_at").eq("user_id", userId),
    supabase.from("follow_ups").select("person_id, outcome_recorded_at")
      .eq("user_id", userId).not("outcome_recorded_at", "is", null),
  ]);

  const last = new Map<string, string | null>();
  for (const r of ((ints.data as any[]) ?? [])) if (r.person_id) last.set(r.person_id, latest(last.get(r.person_id), r.occurred_at));
  for (const r of ((done.data as any[]) ?? [])) if (r.person_id) last.set(r.person_id, latest(last.get(r.person_id), r.outcome_recorded_at));

  const frias = ((people.data as any[]) ?? [])
    .filter((p) => days(p.created_at) >= 60)
    .map((p) => ({
      personId: p.id as string,
      name: String(p.name ?? "").trim() || "Contacto sem nome",
      days: days(last.get(p.id) ?? p.created_at ?? null),
      everContacted: !!last.get(p.id),
    }))
    .filter((p) => p.days >= 60)
    .sort((a, b) => b.days - a.days);

  return frias[0] ?? null;
}
