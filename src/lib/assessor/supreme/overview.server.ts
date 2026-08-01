// Resumo geral do dia — contagens simples, nenhuma lógica de priorização.
// Serve a grelha de 6 cartões de /hoje e a sugestão do mentor.

export interface OverviewSummary {
  deals: { count: number; value: number };
  properties: { count: number; toAcquire: number };
  people: { count: number; contactedWeek: number };
  misc: { pending: number };
  agenda: {
    today: number;
    nextLabel: string | null;
    nextTime: string | null;
    /** Fonte única dos compromissos de hoje — o cartão e o bloco "Próximos compromissos" leem daqui. */
    items: AgendaItem[];
  };
  billing: { forecast: number; open: number };
}

export interface AgendaItem {
  id: string;
  title: string;
  time: string | null;
  type: string | null;
  personId: string | null;
  propertyId: string | null;
}

/** Estados que tiram um compromisso do dia. */
const DONE_FOLLOW_UP = new Set([
  "concluído", "concluido", "concluída", "concluida", "done", "completed", "cancelado", "cancelled", "arquivado",
]);

export function isOpenFollowUp(status: unknown): boolean {
  return !DONE_FOLLOW_UP.has(String(status ?? "").trim().toLowerCase());
}

export interface MentorTip {
  text: string;
  linkLabel: string;
  to: string;
  key: string;
}

const CLOSED_DEAL = new Set(["perdida", "escritura", "closed_lost", "closed_won", "cancelled", "concluido", "concluído"]);
const CLOSED_PROPERTY = new Set(["vendido", "arquivado"]);

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 864e5).toISOString();
}

function todayRangeLisbon(now = new Date()): { start: string; end: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  const start = new Date(`${m.year}-${m.month}-${m.day}T00:00:00+00:00`);
  return { start: start.toISOString(), end: new Date(start.getTime() + 864e5 - 1).toISOString() };
}

export async function computeOverview(supabase: any, userId: string): Promise<OverviewSummary> {
  const { start, end } = todayRangeLisbon();

  const [deals, props, people, misc, events, movements, interactions] = await Promise.all([
    supabase.from("opportunities").select("id, status, value, archived_at").eq("user_id", userId),
    supabase.from("properties").select("id, status").eq("user_id", userId),
    supabase.from("people").select("id").eq("user_id", userId),
    supabase.from("miscellaneous_items").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "inbox"),
    supabase.from("follow_ups").select("id, title, type, due_date, due_time, status")
      .eq("user_id", userId).gte("due_date", start).lte("due_date", end).order("due_time", { ascending: true }),
    supabase.from("financial_movements").select("id, type, amount, status").eq("user_id", userId).eq("type", "commission"),
    supabase.from("interactions").select("person_id").eq("user_id", userId).gte("occurred_at", isoDaysAgo(7)),
  ]);

  const dealRows = ((deals.data as any[]) ?? []).filter(
    (d) => !d.archived_at && !CLOSED_DEAL.has(String(d.status ?? "").toLowerCase()),
  );
  const propRows = ((props.data as any[]) ?? []).filter(
    (p) => !CLOSED_PROPERTY.has(String(p.status ?? "").toLowerCase()),
  );
  const eventRows = ((events.data as any[]) ?? []).filter(
    (e) => String(e.status ?? "").toLowerCase() !== "concluído" && String(e.status ?? "").toLowerCase() !== "concluido",
  );
  const next = eventRows[0] ?? null;
  const commissions = ((movements.data as any[]) ?? []);
  const open = commissions.filter((m) => {
    const s = String(m.status ?? "").toLowerCase();
    return s !== "recebida" && s !== "received" && s !== "paga" && s !== "paid";
  });

  return {
    deals: { count: dealRows.length, value: dealRows.reduce((s, d) => s + Number(d.value ?? 0), 0) },
    properties: {
      count: propRows.length,
      toAcquire: propRows.filter((p) => String(p.status ?? "") === "por_angariar").length,
    },
    people: {
      count: ((people.data as any[]) ?? []).length,
      contactedWeek: new Set(((interactions.data as any[]) ?? []).map((i) => i.person_id).filter(Boolean)).size,
    },
    misc: { pending: misc.count ?? 0 },
    agenda: {
      today: eventRows.length,
      nextLabel: next?.title ?? null,
      nextTime: next?.due_time ? String(next.due_time).slice(0, 5) : null,
    },
    billing: { forecast: open.reduce((s, m) => s + Number(m.amount ?? 0), 0), open: open.length },
  };
}

// Sugestão do mentor: padrões reais nos dados, tom de conselho.
// Se não houver padrão relevante, devolve null — nunca se inventa nada.
export async function computeMentorTip(supabase: any, userId: string): Promise<MentorTip | null> {
  const now = Date.now();
  const days = (iso: string | null) => (iso ? Math.floor((now - new Date(iso).getTime()) / 864e5) : 0);

  const [props, deals, people] = await Promise.all([
    supabase.from("properties").select("id, status, updated_at").eq("user_id", userId),
    supabase.from("opportunities").select("id, status, stage, stage_changed_at, archived_at").eq("user_id", userId),
    supabase.from("people").select("id, name, created_at").eq("user_id", userId).limit(200),
  ]);

  // 1. Imóveis por angariar parados há mais de 10 dias.
  const parados = ((props.data as any[]) ?? []).filter(
    (p) => String(p.status ?? "") === "por_angariar" && days(p.updated_at) >= 10,
  );
  if (parados.length) {
    return {
      key: "imoveis-parados",
      text: `Tens ${parados.length} imóve${parados.length === 1 ? "l" : "is"} "Por angariar" há mais de 10 dias sem nenhum movimento registado. Vale a pena retomares o contacto antes que arrefeçam de vez.`,
      linkLabel: parados.length === 1 ? "Ver o imóvel →" : `Ver os ${parados.length} imóveis →`,
      to: "/imoveis",
    };
  }

  // 2. Negócios na mesma fase há semanas.
  const presos = ((deals.data as any[]) ?? []).filter(
    (d) => !d.archived_at && !CLOSED_DEAL.has(String(d.status ?? "").toLowerCase()) && days(d.stage_changed_at) >= 21,
  );
  if (presos.length) {
    return {
      key: "negocios-parados",
      text: `${presos.length === 1 ? "Há 1 negócio" : `Há ${presos.length} negócios`} na mesma fase há mais de três semanas. Ou avança, ou fecha — deixar parado só ocupa cabeça.`,
      linkLabel: "Ver negócios →",
      to: "/negocios",
    };
  }

  // 3. Pessoas sem qualquer contacto registado há muito tempo.
  const rows = ((people.data as any[]) ?? []).filter((p) => days(p.created_at) >= 30);
  if (rows.length) {
    const ids = rows.map((p) => p.id);
    const { data: ints } = await supabase
      .from("interactions").select("person_id").eq("user_id", userId).in("person_id", ids)
      .gte("occurred_at", isoDaysAgo(30));
    const recentes = new Set(((ints as any[]) ?? []).map((i) => i.person_id));
    const frias = rows.filter((p) => !recentes.has(p.id));
    if (frias.length >= 3) {
      return {
        key: "pessoas-frias",
        text: `Tens ${frias.length} pessoas sem contacto registado há mais de um mês — ${frias.slice(0, 2).map((p) => String(p.name).split(" ")[0]).join(" e ")} entre elas. Um contacto curto agora vale mais do que uma campanha daqui a meio ano.`,
        linkLabel: "Ver pessoas →",
        to: "/pessoas",
      };
    }
  }

  return null;
}
