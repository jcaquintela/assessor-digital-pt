// Motor de priorização — "o que devo fazer agora?".
// Determinístico. Cada item traz razões legíveis para o Assessor verbalizar.

export interface PriorityItem {
  subject_type: "follow_up" | "opportunity" | "property";
  subject_id: string;
  action: string;
  reasons: string[];
  priority_score: number;
  due_at: string | null;
  entity_label: string | null;
  /** Negócio associado (quando existe) — mostrado como "Negócio: X". */
  deal_id: string | null;
  deal_label: string | null;
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 864e5);
}

// A BD tem valores em minúsculas ("evento", "pendente", "media") mas o
// código antigo comparava com "Evento"/"Alta"/"Concluído". Resultado: quase
// nenhum fator real entrava no cálculo e a frase saía sempre igual.
const norm = (v: unknown) =>
  String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

const DONE_STATUSES = new Set(["concluido", "concluida", "done", "cancelado", "cancelada", "arquivado"]);
const EVENT_TYPES = new Set(["evento", "event", "visita", "reuniao"]);
const HIGH_PRIORITIES = new Set(["alta", "high", "urgente"]);

function startOfDayLisbon(now = new Date()): Date {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const m: Record<string, string> = {};
  for (const x of p) m[x.type] = x.value;
  return new Date(`${m.year}-${m.month}-${m.day}T00:00:00+00:00`);
}

// Fim do dia de hoje (Lisboa) em ISO — limite superior das prioridades.
function endOfDayLisbonIso(now = new Date()): string {
  const start = startOfDayLisbon(now);
  return new Date(start.getTime() + 864e5 - 1).toISOString();
}

// Computa (em memória) as prioridades top-N para um utilizador.
export async function computePriorities(
  supabase: any,
  userId: string,
  opts: { limit?: number; now?: Date } = {},
): Promise<PriorityItem[]> {
  const limit = opts.limit ?? 5;
  const now = opts.now ?? new Date();
  const items: PriorityItem[] = [];

  const [{ data: follows }, { data: opps }] = await Promise.all([
    supabase
      .from("follow_ups")
      .select("id, title, type, due_date, due_time, status, priority, person_id, opportunity_id, outcome, created_at, notes")
      .eq("user_id", userId)
      .is("outcome", null)
      // Só o que está em atraso ou é para hoje. Compromissos futuros
      // (ex.: amanhã à noite) não são prioridades de hoje.
      .lte("due_date", endOfDayLisbonIso(now))
      .order("due_date", { ascending: true })
      .limit(50),
    supabase
      .from("opportunities")
      .select("id, type, status, value, next_action, next_action_date, person_id, updated_at")
      .eq("user_id", userId)
      .not("status", "in", "(Perdida,Escritura,closed_lost,closed_won,cancelled)")
      .limit(50),
  ]);

  const dealIds = new Set<string>();
  for (const f of ((follows as any[]) ?? [])) if (f.opportunity_id) dealIds.add(f.opportunity_id);
  for (const o of ((opps as any[]) ?? [])) dealIds.add(o.id);
  const dealById = new Map<string, string>();
  if (dealIds.size) {
    const { data: deals } = await supabase
      .from("opportunities")
      .select("id, title, type")
      .in("id", [...dealIds]);
    for (const d of ((deals as any[]) ?? [])) {
      const label = String(d.title ?? "").trim() || String(d.type ?? "").trim() || "Negócio";
      dealById.set(d.id, label);
    }
  }

  const personIds = new Set<string>();
  for (const f of ((follows as any[]) ?? [])) if (f.person_id) personIds.add(f.person_id);
  for (const o of ((opps as any[]) ?? [])) if (o.person_id) personIds.add(o.person_id);
  const nameById = new Map<string, string>();
  const phoneById = new Map<string, boolean>();
  if (personIds.size) {
    const { data: people } = await supabase
      .from("people")
      .select("id, name, phone")
      .in("id", [...personIds]);
    for (const p of ((people as any[]) ?? [])) {
      nameById.set(p.id, p.name);
      if (p.phone) phoneById.set(p.id, true);
    }
  }

  const today = startOfDayLisbon(now);

  // Follow-ups (tarefas e eventos)
  for (const f of ((follows as any[]) ?? [])) {
    if (DONE_STATUSES.has(norm(f.status))) continue;
    const due = new Date(f.due_date);
    const overdueDays = Math.max(0, daysBetween(today, due));
    const isEvent = EVENT_TYPES.has(norm(f.type));
    let score = isEvent ? 65 : 55;
    const reasons: string[] = [];
    if (overdueDays > 0) {
      score += Math.min(30, overdueDays * 6);
      reasons.push(overdueDays === 1 ? "atrasado desde ontem" : `atrasado há ${overdueDays} dias`);
    } else if (daysBetween(due, today) <= 0) {
      reasons.push(isEvent ? "compromisso de hoje" : "para hoje");
    } else {
      reasons.push(isEvent ? "compromisso próximo" : "próximo do prazo");
      score -= 15;
    }
    if (HIGH_PRIORITIES.has(norm(f.priority))) { score += 10; reasons.push("prioridade alta"); }

    // Há quanto tempo isto está por tratar (fator real, não a data de entrega).
    const pendingDays = f.created_at ? Math.max(0, daysBetween(today, startOfDayLisbon(new Date(f.created_at)))) : 0;
    if (pendingDays >= 2) {
      score += Math.min(10, pendingDays);
      reasons.push(pendingDays === 1 ? "aberto desde ontem" : `pendente há ${pendingDays} dias`);
    }

    // Hora marcada: um compromisso com hora é mais premente do que uma tarefa solta.
    if (isEvent && f.due_time) reasons.push(`marcado para as ${String(f.due_time).slice(0, 5)}`);

    // Fator real: dá para agir já se houver contacto telefónico.
    if (f.person_id && phoneById.get(f.person_id)) reasons.push("com telefone disponível");

    // Faz parte de um negócio em curso — não é uma tarefa isolada.
    if (f.opportunity_id) { score += 5; reasons.push("faz parte de um negócio em curso"); }

    // Sem contexto nenhum: vale a pena dizer, porque explica o próximo passo.
    if (!f.person_id && !f.opportunity_id && !String(f.notes ?? "").trim()) {
      reasons.push("ainda sem pessoa nem negócio associado");
    }
    items.push({
      subject_type: "follow_up",
      subject_id: f.id,
      action: isEvent ? `Preparar: ${f.title}` : f.title,
      reasons,
      priority_score: Math.min(100, score),
      due_at: f.due_date,
      entity_label: f.person_id ? nameById.get(f.person_id) ?? null : null,
      deal_id: f.opportunity_id ?? null,
      deal_label: f.opportunity_id ? dealById.get(f.opportunity_id) ?? null : null,
    });
  }

  // Oportunidades sem próxima acção OU com next_action_date passada
  for (const o of ((opps as any[]) ?? [])) {
    const noAction = !o.next_action;
    const naDate = o.next_action_date ? new Date(o.next_action_date) : null;
    const staleUpdate = o.updated_at ? daysBetween(now, new Date(o.updated_at)) : 0;
    let score = 0;
    const reasons: string[] = [];
    if (noAction) { score = 45; reasons.push("oportunidade sem próxima ação"); }
    else if (naDate && naDate.getTime() < now.getTime()) {
      const days = Math.max(1, daysBetween(now, naDate));
      score = 50 + Math.min(25, days * 5);
      reasons.push(days === 1 ? "próxima ação atrasada desde ontem" : `próxima ação atrasada há ${days} dias`);
    } else continue;
    if (staleUpdate >= 14) { score += 10; reasons.push(`sem atividade há ${staleUpdate} dias`); }
    if (Number(o.value ?? 0) >= 200000) { score += 5; reasons.push("valor relevante"); }
    const nome = o.person_id ? nameById.get(o.person_id) ?? null : null;
    items.push({
      subject_type: "opportunity",
      subject_id: o.id,
      action: `Definir próxima ação${nome ? ` com ${nome}` : ""}`,
      reasons,
      priority_score: Math.min(100, score),
      due_at: o.next_action_date ?? null,
      entity_label: nome,
      deal_id: o.id,
      deal_label: dealById.get(o.id) ?? "Negócio",
    });
  }

  items.sort((a, b) => b.priority_score - a.priority_score);
  return items.slice(0, limit);
}

// Persiste snapshot (usado por /hoje para permitir dismiss/complete).
export async function persistPrioritiesSnapshot(
  supabase: any,
  userId: string,
  items: PriorityItem[],
): Promise<void> {
  try {
    // Limpa snapshot anterior (não concluído/dispensado).
    await supabase
      .from("daily_priorities")
      .delete()
      .eq("user_id", userId)
      .is("dismissed_at", null)
      .is("completed_at", null);
    if (!items.length) return;
    await supabase.from("daily_priorities").insert(
      items.map((it) => ({
        user_id: userId,
        subject_type: it.subject_type,
        subject_id: it.subject_id,
        action: it.action,
        reasons: it.reasons,
        priority_score: it.priority_score,
        due_at: it.due_at,
      })) as never,
    );
  } catch { /* noop */ }
}

// Follow-ups executados sem outcome (para bloco "Aguardam resultado").
export async function findAwaitingOutcome(
  supabase: any,
  userId: string,
  now = new Date(),
): Promise<Array<{ id: string; title: string; due_at: string; entity_label: string | null }>> {
  const { data } = await supabase
    .from("follow_ups")
    .select("id, title, due_date, person_id")
    .eq("user_id", userId)
    .is("outcome", null)
    .not("status", "in", "(Concluído,Concluido,concluido,Arquivado,arquivado,Cancelado,cancelado)")
    .lt("due_date", now.toISOString())
    .order("due_date", { ascending: false })
    .limit(10);
  const rows = (data as any[]) ?? [];
  if (!rows.length) return [];
  const pids = [...new Set(rows.map((r) => r.person_id).filter(Boolean))];
  const names = new Map<string, string>();
  if (pids.length) {
    const { data: people } = await supabase.from("people").select("id, name").in("id", pids);
    for (const p of ((people as any[]) ?? [])) names.set(p.id, p.name);
  }
  return rows.map((r) => ({
    id: r.id, title: r.title, due_at: r.due_date,
    entity_label: r.person_id ? names.get(r.person_id) ?? null : null,
  }));
}