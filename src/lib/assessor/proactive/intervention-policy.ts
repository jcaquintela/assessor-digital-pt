// Política única de intervenções proativas — módulo puro.
//
// Decisão do proprietário: no máximo UMA intervenção comercial NÃO
// SOLICITADA por conta e por dia, venha de que módulo vier (avisos,
// briefing, resumo, preparação de reuniões, guias de objeções...).
//
// Classes:
// - requested   → o consultor pediu (lembrete, rotina). Nunca suprimido, não conta.
// - activated   → notificação que o consultor LIGOU explicitamente
//                 (consultant_preferences.explicit_opt_ins). Não conta;
//                 cada uma continua a sair no máximo uma vez por dia/evento.
// - unsolicited → tudo o resto. Disputa a vaga única do dia.
// - retired     → deixa de existir (aviso de "teto atingido").
// - service     → aviso de serviço/dados (retenção), fora do âmbito comercial.
//
// Ligado por defeito NÃO é ativação explícita (escolha conservadora).

export const GLOBAL_CAP_FLAG = "assessor.global_unsolicited_cap.v1";

export type InterventionClass = "requested" | "activated" | "unsolicited" | "retired" | "service";

export type OptIn = "morning_briefing" | "evening_review" | "push";

export type ProactiveSource =
  | { type: "nudge"; dedupe_key?: string | null; kind?: string | null }
  | { type: "push_morning" }
  | { type: "push_checkin" }
  | { type: "meeting_briefing" }
  | { type: "objection_guide" }
  | { type: "reminder" }
  | { type: "routine" }
  | { type: "retention" };

const P = {
  briefing: "supreme_daily_briefing:",
  evening: "supreme_evening_review:",
  capNotice: "supreme_cap_notice:",
  routine: "routine:",
  opportunity: "opportunity:",
} as const;

function has(optIns: readonly string[] | null | undefined, o: OptIn): boolean {
  return Array.isArray(optIns) && optIns.includes(o);
}

export function classifyIntervention(src: ProactiveSource, optIns: readonly string[] | null | undefined): InterventionClass {
  switch (src.type) {
    case "reminder":
    case "routine":
      return "requested";
    case "retention":
      return "service";
    case "push_morning":
    case "push_checkin":
      return has(optIns, "push") ? "activated" : "unsolicited";
    case "meeting_briefing":
    case "objection_guide":
      return "unsolicited";
    case "nudge": {
      const k = String(src.dedupe_key ?? "");
      if (k.startsWith(P.capNotice)) return "retired";
      if (k.startsWith(P.routine) || src.kind === "routine_digest") return "requested";
      if (k.startsWith(P.briefing)) return has(optIns, "morning_briefing") ? "activated" : "unsolicited";
      if (k.startsWith(P.evening)) return has(optIns, "evening_review") ? "activated" : "unsolicited";
      return "unsolicited";
    }
  }
}

export function isBriefingNudge(row: { dedupe_key?: string | null }): boolean {
  return String(row.dedupe_key ?? "").startsWith(P.briefing);
}

export function isCommercialOpportunity(row: { dedupe_key?: string | null; kind?: string | null }): boolean {
  return (
    String(row.dedupe_key ?? "").startsWith(P.opportunity) ||
    row.kind === "opportunity_match" ||
    row.kind === "deal_stalled"
  );
}

/**
 * Prioridade com a política ligada: um briefing não ativado, quando está
 * na fila, ganha a vaga e LEVA DENTRO a melhor oportunidade comercial
 * (consolidação) — o consultor recebe uma só mensagem com o essencial.
 */
export function policyPriority(row: { dedupe_key?: string | null; priority?: number | null }, base: number): number {
  return isBriefingNudge(row) ? 1000 : base;
}

export function consolidateBriefing(briefing: string, opportunity: string): string {
  const b = String(briefing ?? "").trimEnd();
  const o = String(opportunity ?? "").trim();
  if (!o) return b;
  return `${b}\n\nOportunidade do dia: ${o}`;
}

function lisbonParts(now: Date): { hour: number; minute: number; weekday: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  }).formatToParts(now);
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  return { hour: Number(m.hour ?? "0") % 24, minute: Number(m.minute ?? "0"), weekday: (m.weekday ?? "").toLowerCase() };
}

function hm(s: string | null | undefined, fallback: string): number {
  const [h, mi] = String(s ?? fallback).slice(0, 5).split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(mi) ? mi : 0);
}

export type WindowVerdict = { ok: true } | { ok: false; reason: "sunday" | "outside_hours" | "quiet_hours" };

/**
 * Pode sair agora uma intervenção NÃO solicitada?
 * Domingo nunca; sábado só 9h–13h; dias úteis 9h–20h (Lisboa); e nunca no
 * horário de silêncio do consultor.
 */
export function unsolicitedWindow(
  now: Date,
  quiet: { start?: string | null; end?: string | null } = {},
): WindowVerdict {
  const { hour, minute, weekday } = lisbonParts(now);
  if (weekday === "sun") return { ok: false, reason: "sunday" };
  if (hour < 9 || hour >= 20 || (weekday === "sat" && hour >= 13)) return { ok: false, reason: "outside_hours" };
  const s = hm(quiet.start, "22:00");
  const e = hm(quiet.end, "07:30");
  const n = hour * 60 + minute;
  const inQuiet = s === e ? false : s < e ? n >= s && n < e : n >= s || n < e;
  if (inQuiet) return { ok: false, reason: "quiet_hours" };
  return { ok: true };
}
