import { computeDripMetrics, type DripProfileRow } from "./profile-drip-metrics";

export interface DripConsultantRow {
  id: string;
  nome: string | null;
  email: string | null;
  criadoEm: string | null;
  avisoEm: string | null;
  zonaPerguntadaEm: string | null;
  zona: string | null;
  equipa: string | null;
  emPausaAte: string | null;
}

export async function fetchProfileDripMetrics(supabaseAdmin: any) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select(
      "id, name, email, created_at, work_area, team_context, profile_questions_asked, profile_notice_sent_at, profile_paused_until",
    )
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = ((data as any[]) ?? []) as any[];
  const metrics = computeDripMetrics(rows as DripProfileRow[]);

  const consultores: DripConsultantRow[] = rows.map((r) => {
    const asked = Array.isArray(r.profile_questions_asked) ? r.profile_questions_asked : [];
    const zona = asked.find((a: any) => a?.key === "work_area");
    return {
      id: String(r.id),
      nome: r.name ?? null,
      email: r.email ?? null,
      criadoEm: r.created_at ?? null,
      avisoEm: r.profile_notice_sent_at ?? null,
      zonaPerguntadaEm: zona?.at ?? null,
      zona: r.work_area ?? null,
      equipa: r.team_context ?? null,
      emPausaAte: r.profile_paused_until ?? null,
    };
  });

  return { metrics, consultores };
}
