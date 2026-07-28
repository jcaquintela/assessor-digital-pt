// Consulta de agenda — período (hoje/amanhã/semana/próxima semana/intervalo)
// e formatação de resposta agrupada por dia em PT-PT (Europe/Lisbon).
// Puro: sem I/O. Recebe as linhas da BD e devolve a string final.

export type AgendaPeriod =
  | { kind: "today"; from: string; to: string; label: string }
  | { kind: "tomorrow"; from: string; to: string; label: string }
  | { kind: "week"; from: string; to: string; label: string }
  | { kind: "next_week"; from: string; to: string; label: string }
  | { kind: "range"; from: string; to: string; label: string };

export interface AgendaRow {
  title: string;
  type: string | null;
  due_date: string; // YYYY-MM-DD (ou timestamp — normalizamos)
  due_time: string | null; // HH:mm[:ss]
  status: string | null;
}

const WEEKDAY_PT = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

// Devolve YYYY-MM-DD + weekday (0=domingo..6=sábado) no fuso Europe/Lisbon.
export function lisbonParts(d: Date): { ymd: string; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(d);
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  const wd: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return { ymd: `${m.year}-${m.month}-${m.day}`, weekday: wd[m.weekday] ?? 0 };
}

export function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

// Deteta o período pedido a partir do texto do utilizador (PT-PT).
// Devolve `null` se o texto não é uma consulta de agenda reconhecível.
export function detectAgendaPeriod(text: string, now: Date): AgendaPeriod | null {
  const t = text.toLowerCase();
  const { ymd: today, weekday } = lisbonParts(now);
  // 0=domingo. Semana ISO PT começa na segunda-feira.
  const daysSinceMonday = (weekday + 6) % 7;
  const monday = addDaysYmd(today, -daysSinceMonday);
  const sunday = addDaysYmd(monday, 6);

  if (/\bpr[óo]xima\s+semana\b|\bna\s+pr[óo]xima\b|\bpara\s+a\s+pr[óo]xima\b/.test(t)) {
    const from = addDaysYmd(monday, 7);
    return { kind: "next_week", from, to: addDaysYmd(from, 6), label: "na próxima semana" };
  }
  if (/\b(esta|nesta|para\s+esta)\s+semana\b|\bsemana\b(?!\s+passada)/.test(t)) {
    return { kind: "week", from: monday, to: sunday, label: "esta semana" };
  }
  if (/\bamanh[ãa]\b/.test(t)) {
    const d = addDaysYmd(today, 1);
    return { kind: "tomorrow", from: d, to: d, label: "amanhã" };
  }
  if (/\bhoje\b/.test(t)) {
    return { kind: "today", from: today, to: today, label: "hoje" };
  }
  // Fallback quando o utilizador pergunta genericamente "agenda/compromissos"
  // sem período — assume hoje.
  if (/\b(agenda|compromissos?|marca(?:d[oa]s?|ç[õo]es)|agendamentos?)\b/.test(t)) {
    return { kind: "today", from: today, to: today, label: "hoje" };
  }
  return null;
}

function normalizeDate(v: string): string {
  // Aceita "2026-07-28" ou "2026-07-28 00:00:00+00" — devolve só a parte YYYY-MM-DD.
  return String(v).slice(0, 10);
}

function fmtHour(hhmm: string): string {
  const [h, m] = hhmm.split(":");
  const mm = Number(m || 0);
  return mm ? `${Number(h)}h${String(mm).padStart(2, "0")}` : `${Number(h)}h`;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function weekdayLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
  }).formatToParts(dt);
  const wd: Record<string, number> = { Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6 };
  const idx = wd[parts.find((p) => p.type === "weekday")!.value] ?? 0;
  return WEEKDAY_PT[idx];
}

function shortDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
  }).format(dt);
}

export interface AgendaFormatOptions {
  period: AgendaPeriod;
  rows: AgendaRow[];
  now: Date;
  maxItems?: number;
}

export function formatAgendaReply(opts: AgendaFormatOptions): string {
  const { period, rows, now } = opts;
  const max = opts.maxItems ?? 12;
  const active = rows.filter((r) => (r.status ?? "").toLowerCase() !== "concluído" && (r.status ?? "").toLowerCase() !== "cancelado");
  const normalized = active.map((r) => ({ ...r, due_date: normalizeDate(r.due_date) }));
  const withTime = normalized.filter((r) => !!r.due_time).sort(sortRows);
  const withoutTime = normalized.filter((r) => !r.due_time).sort(sortRows);

  if (withTime.length === 0 && withoutTime.length === 0) {
    if (period.kind === "today") return "Hoje não tens nada agendado.";
    if (period.kind === "tomorrow") return "Amanhã não tens nada agendado.";
    if (period.kind === "week") return "Não tens agendamentos para esta semana.";
    if (period.kind === "next_week") return "Não tens agendamentos para a próxima semana.";
    return "Não tens agendamentos nesse período.";
  }

  const totalWithTime = withTime.length;
  const capped = withTime.slice(0, max);
  const truncated = totalWithTime > capped.length;

  // Dia único → sem cabeçalhos de dia.
  const isSingleDay = period.kind === "today" || period.kind === "tomorrow" ||
    (period.from === period.to);

  const lines: string[] = [];
  if (period.kind === "today") lines.push("Hoje tens:");
  else if (period.kind === "tomorrow") lines.push("Amanhã tens:");
  else if (period.kind === "week") lines.push("Esta semana tens:");
  else if (period.kind === "next_week") lines.push("Na próxima semana tens:");
  else lines.push("Tens:");

  if (isSingleDay) {
    for (const r of capped) {
      lines.push(`• ${fmtHour(r.due_time!.slice(0, 5))} — ${r.title}`);
    }
  } else {
    // Agrupar por dia — só dias com itens.
    const byDay = new Map<string, AgendaRow[]>();
    for (const r of capped) {
      const key = r.due_date;
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(r);
    }
    const days = Array.from(byDay.keys()).sort();
    const { ymd: today } = lisbonParts(now);
    const tomorrow = addDaysYmd(today, 1);
    for (const day of days) {
      let header = capitalize(weekdayLabel(day));
      if (day === today) header = `Hoje (${header.toLowerCase()})`;
      else if (day === tomorrow) header = `Amanhã (${header.toLowerCase()})`;
      lines.push("");
      lines.push(header);
      for (const r of byDay.get(day)!) {
        lines.push(`• ${fmtHour(r.due_time!.slice(0, 5))} — ${r.title}`);
      }
    }
  }

  if (truncated) {
    lines.push("");
    lines.push(`Mostrei ${capped.length} de ${totalWithTime}. Vê o resto no dashboard.`);
  }

  if (withoutTime.length > 0) {
    lines.push("");
    lines.push(
      withoutTime.length === 1
        ? "Também tens 1 seguimento sem hora definida."
        : `Também tens ${withoutTime.length} seguimentos sem hora definida.`,
    );
  }

  // Evita "esta semana / próxima semana" quando só há 1 dia real — já dito no cabeçalho.
  void shortDate;
  return lines.join("\n").trim();
}

function sortRows(a: AgendaRow, b: AgendaRow): number {
  if (a.due_date !== b.due_date) return a.due_date < b.due_date ? -1 : 1;
  const at = (a.due_time || "").slice(0, 5);
  const bt = (b.due_time || "").slice(0, 5);
  if (at !== bt) return at < bt ? -1 : 1;
  return 0;
}

// ---------- Título descritivo -------------------------------------------------

const GENERIC_TITLE_RE = /^(tarefa|seguimento|evento|visita\s+(?:amanh[ãa]|hoje)?)$/i;

export interface TitleContext {
  intent: "create_event" | "create_follow_up" | string;
  entities: {
    title?: string | null;
    event_type?: string | null;
    person_name?: string | null;
    person_title?: string | null;
    property_type?: string | null;
    location?: string | null;
    notes?: string | null;
  };
  originalText?: string | null;
}

const VERBS: Array<{ re: RegExp; verb: string; prep: "a" | "para" | "com" | "de" | "" }> = [
  { re: /\bligar\b/i, verb: "Ligar", prep: "a" },
  { re: /\btelefonar\b/i, verb: "Telefonar", prep: "a" },
  { re: /\benviar\b/i, verb: "Enviar", prep: "para" },
  { re: /\bmandar\b/i, verb: "Mandar", prep: "para" },
  { re: /\bescrever\b/i, verb: "Escrever", prep: "a" },
  { re: /\bcontact(?:ar|a)\b/i, verb: "Contactar", prep: "" },
  { re: /\bfalar\b/i, verb: "Falar", prep: "com" },
  { re: /\brever\b/i, verb: "Rever", prep: "" },
  { re: /\bconfirmar\b/i, verb: "Confirmar", prep: "" },
  { re: /\bcombinar\b/i, verb: "Combinar", prep: "com" },
  { re: /\bvisitar\b/i, verb: "Visitar", prep: "" },
  { re: /\bavaliar\b/i, verb: "Avaliar", prep: "" },
  { re: /\bpreparar\b/i, verb: "Preparar", prep: "" },
];

function personObject(prep: "a" | "de" | "com" | "para" | "", name: string): string {
  if (!name) return prep;
  const first = (name.split(/\s+/)[0] || "").toLowerCase();
  const feminine = /a$/.test(first) && !/(costa|papa|maia|jesus)$/.test(first);
  if (prep === "a") return `${feminine ? "à" : "ao"} ${name}`;
  if (prep === "de") return `${feminine ? "da" : "do"} ${name}`;
  if (prep === "" ) return `${feminine ? "a" : "o"} ${name}`;
  return `${prep} ${feminine ? "a" : "o"} ${name}`;
}

function capitalizeFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// Constrói um título descritivo a partir do contexto disponível.
// Nunca inventa: se não houver contexto útil, devolve fallback aceitável.
export function buildDescriptiveTitle(ctx: TitleContext): string {
  const t = (ctx.entities.title || "").trim();
  if (t && !GENERIC_TITLE_RE.test(t)) return t;

  const text = String(ctx.originalText || "").trim();
  const ent = ctx.entities;

  if (ctx.intent === "create_event") {
    const evento = capitalizeFirst(String(ent.event_type || "Visita").trim() || "Visita");
    const parts: string[] = [evento];
    if (ent.property_type) parts.push(`ao ${ent.property_type}`);
    if (ent.location) parts.push(`em ${ent.location}`);
    if (ent.person_name) parts.push(`com ${ent.person_name}`);
    return parts.join(" ");
  }

  // create_follow_up (default).
  const hit = VERBS.find((v) => v.re.test(text));
  if (hit) {
    if (ent.person_name && (hit.prep === "a" || hit.prep === "com" || hit.prep === "para" || hit.prep === "")) {
      return `${hit.verb} ${personObject(hit.prep, ent.person_name)}`.trim();
    }
    if (ent.property_type || ent.location) {
      const alvo = [ent.property_type, ent.location].filter(Boolean).join(" em ");
      return `${hit.verb} ${alvo}`.trim();
    }
    return hit.verb;
  }
  if (ent.person_name) return `Seguimento com ${ent.person_name}`;
  if (ent.property_type || ent.location) {
    const alvo = [ent.property_type, ent.location].filter(Boolean).join(" em ");
    return `Seguimento — ${alvo}`;
  }
  return "Seguimento";
}