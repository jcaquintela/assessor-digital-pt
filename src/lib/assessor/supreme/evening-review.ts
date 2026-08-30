// Resumo de fim de dia — deteção (sob pedido) e composição do texto.
//
// Módulo puro: não faz I/O. O agregador é `buildDaySnapshot` (lente
// "fim_de_dia"); aqui só se decide se há sinal para falar e como se diz.

import type { DaySnapshot } from "./day-snapshot.server";

/**
 * Pedido retrospetivo explícito: "como correu o dia", "o que fiz hoje",
 * "resumo do dia", "balanço de hoje". Tem precedência sobre o estado do dia
 * (prospetivo) — ver `detectDayStateQuery`.
 */
export const EVENING_REVIEW_RE = new RegExp(
  [
    // "como correu o dia", "como correu hoje", "como é que correu o meu dia"
    "\\bcomo\\s+(?:é\\s+que\\s+)?corre(?:u|ram)\\s+(?:o\\s+)?(?:meu\\s+)?(?:dia|hoje|dia\\s+de\\s+hoje)\\b",
    // "o que fiz hoje", "que fiz hoje", "o que é que fiz hoje"
    "\\b(?:o\\s+)?que\\s+(?:é\\s+que\\s+)?fiz(?:emos)?\\s+hoje\\b",
    // "resumo do dia", "resumo de hoje", "resumo do meu dia"
    "\\bresumo\\s+d[eoa]\\s+(?:meu\\s+)?(?:dia|hoje)\\b",
    // "balanço do dia", "balanço de hoje", "fecho do dia"
    "\\b(?:balan[çc]o|fecho|fim)\\s+d[eoa]\\s+(?:meu\\s+)?(?:dia|hoje)\\b",
  ].join("|"),
  "i",
);

const NEGATION_RE = /\bn[ãa]o\b/i;

/** É um pedido de resumo de fim de dia? */
export function detectEveningReviewQuery(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t || t.length > 160) return false;
  if (NEGATION_RE.test(t)) return false;
  return EVENING_REVIEW_RE.test(t);
}

/** Resposta mínima quando o dia não deixou rasto (só sob pedido). */
export const CALM_DAY_REPLY = "Hoje foi um dia calmo, nada ficou pendente.";

/**
 * Há matéria para um resumo? Silêncio é sinal: sem visitas, sem compromissos
 * fechados, sem pendentes e sem prazos, o modo automático não fala.
 */
export function hasEveningSignal(s: DaySnapshot): boolean {
  return (
    s.visits.length > 0 ||
    s.closed.length > 0 ||
    s.openToday.length > 0 ||
    s.pendingConfirmations > 0 ||
    s.miscInbox > 0 ||
    s.deadlines.length > 0
  );
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? `1 ${one}` : `${n} ${many}`;
}

/** Texto do resumo: o que aconteceu, o que ficou pendente, o que vem amanhã. */
export function composeEveningReview(
  s: DaySnapshot,
  opts: { firstName?: string } = {},
): string {
  if (!hasEveningSignal(s) && !s.tomorrow.length) return CALM_DAY_REPLY;

  const blocks: string[] = [];

  // 1) O que aconteceu.
  const done: string[] = [];
  if (s.visits.length) done.push(plural(s.visits.length, "visita", "visitas"));
  if (s.closed.length) done.push(plural(s.closed.length, "compromisso fechado", "compromissos fechados"));
  blocks.push(done.length ? `Hoje: ${done.join(" e ")}.` : "Hoje não ficou nada registado.");

  // 2) O que ficou pendente.
  const pending: string[] = [];
  for (const f of s.openToday.slice(0, 3)) {
    pending.push(`• ${f.title}${f.person ? ` (${f.person})` : ""}`);
  }
  if (s.pendingConfirmations > 0) {
    pending.push(`• ${plural(s.pendingConfirmations, "coisa à espera da tua confirmação", "coisas à espera da tua confirmação")}`);
  }
  if (s.miscInbox > 0) {
    pending.push(`• ${plural(s.miscInbox, "nota por tratar em Diversos", "notas por tratar em Diversos")}`);
  }
  if (pending.length) blocks.push(`Por fechar:\n${pending.join("\n")}`);

  // 3) Amanhã (prioridades reais + prazos com consequência).
  const ahead: string[] = [];
  for (const p of s.tomorrow.slice(0, 3)) {
    ahead.push(`• ${p.action}${p.entity_label ? ` (${p.entity_label})` : ""}`);
  }
  for (const d of s.deadlines.slice(0, 2)) {
    ahead.push(`• ${d.label} — ${d.when} (${d.deal_label})`);
  }
  if (ahead.length) blocks.push(`Amanhã:\n${ahead.join("\n")}`);

  const hello = opts.firstName ? `${opts.firstName}, ` : "";
  const head = hello ? `${hello.charAt(0).toUpperCase()}${hello.slice(1)}fecho do dia:` : "Fecho do dia:";
  return `${head}\n${blocks.join("\n\n")}`;
}
