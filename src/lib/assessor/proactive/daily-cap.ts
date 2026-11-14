// Teto diário de intervenções proativas NÃO solicitadas — módulo puro.
//
// Decisão do proprietário (14/11/2026): por defeito, no máximo UMA intervenção
// não solicitada por dia e por conta, a de maior prioridade. O resto cala-se.
//
// "Solicitado/agendado" = o consultor pediu ou configurou: briefing da manhã,
// resumo de fim de dia, aviso antes de um compromisso dele, "como correu?" de
// um compromisso dele, aviso de teto. Estes não contam para o teto, mas cada
// um sai no máximo uma vez por dia (nunca se acumulam).

export const DEFAULT_MAX_UNSOLICITED_PER_DAY = 1;

// Espelham os prefixos de `supreme/briefing.server.ts` e `nudge-expiry.ts`
// (um teste garante que continuam iguais).
export const SCHEDULED_PREFIXES = [
  "supreme_daily_briefing:",
  "supreme_evening_review:",
  "supreme_pre_event:",
  "supreme_outcome_check:",
  "supreme_cap_notice:",
] as const;

/** Prefixos agendados que só podem sair uma vez por dia (independente do assunto). */
const ONCE_PER_DAY_PREFIXES = [
  "supreme_daily_briefing:",
  "supreme_evening_review:",
  "supreme_cap_notice:",
] as const;

export interface CapRow {
  id: string;
  user_id: string;
  kind?: string | null;
  dedupe_key?: string | null;
  priority?: number | null;
  created_at?: string | null;
}

export function isScheduledNudge(row: { dedupe_key?: string | null }): boolean {
  const k = String(row.dedupe_key ?? "");
  return SCHEDULED_PREFIXES.some((p) => k.startsWith(p));
}

function oncePerDayPrefix(row: { dedupe_key?: string | null }): string | null {
  const k = String(row.dedupe_key ?? "");
  return ONCE_PER_DAY_PREFIXES.find((p) => k.startsWith(p)) ?? null;
}

// Prioridade por defeito quando o aviso não traz uma calculada
// (impacto comercial primeiro; silêncio do consultor por último).
const KIND_PRIORITY: Record<string, number> = {
  deal_stalled: 80,
  opportunity_match: 75,
  deal_deadline: 70,
  schedule_conflict: 65,
  followup_overdue: 50,
  person_silence: 40,
  property_missing_docs: 30,
  consultant_silence: 10,
};

export function nudgePriority(row: CapRow): number {
  if (typeof row.priority === "number" && Number.isFinite(row.priority)) return row.priority;
  // O resumo agregado antigo reutilizava o kind "consultant_silence".
  if (String(row.dedupe_key ?? "").startsWith("opportunity_digest:")) return 60;
  return KIND_PRIORITY[String(row.kind ?? "")] ?? 20;
}

export interface CapDecision {
  /** Saem agora (ordem: agendados primeiro, depois o não solicitado escolhido). */
  send: CapRow[];
  /** Ficam calados hoje: teto atingido ou agendado repetido. */
  drop: Array<{ row: CapRow; reason: "daily_cap" | "already_sent_today" }>;
}

/**
 * Decide, para UM consultor, o que sai deste lote.
 * - `sentTodayKeys`: dedupe_keys dos avisos já enviados hoje (dia de Lisboa).
 * - `cap`: teto de não solicitados (por defeito 1).
 */
export interface CapOptions {
  /** Quem não conta para o teto (por defeito: os agendados por prefixo). */
  isExempt?: (row: { dedupe_key?: string | null; kind?: string | null }) => boolean;
  /** Prioridade alternativa (por defeito `nudgePriority`). */
  priority?: (row: CapRow) => number;
}

export function applyDailyCap(
  pending: CapRow[],
  sentTodayKeys: Array<string | null | undefined>,
  cap: number = DEFAULT_MAX_UNSOLICITED_PER_DAY,
  opts: CapOptions = {},
): CapDecision {
  const exempt = opts.isExempt ?? isScheduledNudge;
  const prio = opts.priority ?? nudgePriority;
  const send: CapRow[] = [];
  const drop: CapDecision["drop"] = [];

  const sentOnce = new Set<string>();
  let unsolicitedSent = 0;
  for (const k of sentTodayKeys) {
    const row = { dedupe_key: k ?? null };
    const p = oncePerDayPrefix(row);
    if (p) sentOnce.add(p);
    if (!exempt(row)) unsolicitedSent++;
  }

  const scheduled = pending.filter((r) => exempt(r));
  const unsolicited = pending.filter((r) => !exempt(r));

  for (const r of scheduled) {
    const p = oncePerDayPrefix(r);
    if (p && sentOnce.has(p)) {
      drop.push({ row: r, reason: "already_sent_today" });
      continue;
    }
    if (p) sentOnce.add(p);
    send.push(r);
  }

  const room = Math.max(0, Math.floor(cap) - unsolicitedSent);
  const ranked = [...unsolicited].sort(
    (a, b) =>
      prio(b) - prio(a) ||
      String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) ||
      a.id.localeCompare(b.id),
  );
  ranked.forEach((r, i) => {
    if (i < room) send.push(r);
    else drop.push({ row: r, reason: "daily_cap" });
  });
  return { send, drop };
}

function hm(s: string | null | undefined, fallback: string): number {
  const [h, m] = String(s ?? fallback).slice(0, 5).split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/** Horário de silêncio do consultor (pode atravessar a meia-noite). */
export function isInQuietHours(
  start: string | null | undefined,
  end: string | null | undefined,
  lisbonHhMm: string,
): boolean {
  const s = hm(start, "22:00");
  const e = hm(end, "07:30");
  const n = hm(lisbonHhMm, "12:00");
  if (s === e) return false;
  return s < e ? n >= s && n < e : n >= s || n < e;
}
