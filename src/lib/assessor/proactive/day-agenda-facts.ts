// "A agenda está livre" é uma AFIRMAÇÃO — só pode sair depois de olhar para o
// dia inteiro, na mesma janela que a consulta directa de agenda usa.
//
// Contexto do bug que isto blinda: o briefing dizia "agenda livre" sempre que
// a lista de PRIORIDADES vinha vazia. Mas a lista de prioridades filtra coisas
// que a agenda mostra (compromissos já terminados, lazer, reuniões internas
// atrasadas) e podia ainda vir vazia por efeito de limite de query. Resultado:
// "agenda livre" com cinco compromissos marcados.
//
// Diferença documentada, de propósito:
//   - PRIORIDADES: o que vale a pena preparar/fazer AGORA (filtra lazer,
//     compromissos já terminados e reuniões internas atrasadas).
//   - AGENDA DO DIA: tudo o que está marcado, incluindo lazer e o que já
//     passou.
// São perguntas diferentes. O briefing só pode dizer "livre" quando as DUAS
// estão vazias; nos casos intermédios diz a verdade parcial.

import { lisbonHhMm } from "../lisbon-day";
import { emptyDaySuggestion } from "./empty-day";

export interface AgendaFactEvent {
  id: string;
  title: string;
  /** Início/fim em ISO (null quando o compromisso não tem hora marcada). */
  startIso: string | null;
  endIso: string | null;
  /** Compromisso de trabalho (false = lazer/pessoal, ex.: almoço). */
  isWork: boolean;
}

export interface DayAgendaSplit {
  /** Ainda por acontecer (ou sem hora) — o que interessa para "livre". */
  remaining: AgendaFactEvent[];
  remainingWork: AgendaFactEvent[];
  remainingLeisure: AgendaFactEvent[];
  /** Já terminou hoje. */
  past: AgendaFactEvent[];
  pastWork: AgendaFactEvent[];
  total: number;
}

function isOver(ev: AgendaFactEvent, nowMs: number): boolean {
  if (!ev.endIso) return false; // sem hora: conta como do dia todo
  const t = new Date(ev.endIso).getTime();
  return Number.isFinite(t) && t <= nowMs;
}

export function splitDayAgenda(events: AgendaFactEvent[], now: Date = new Date()): DayAgendaSplit {
  const nowMs = now.getTime();
  const remaining = events.filter((e) => !isOver(e, nowMs));
  const past = events.filter((e) => isOver(e, nowMs));
  return {
    remaining,
    remainingWork: remaining.filter((e) => e.isWork),
    remainingLeisure: remaining.filter((e) => !e.isWork),
    past,
    pastWork: past.filter((e) => e.isWork),
    total: events.length,
  };
}

function label(ev: AgendaFactEvent): string {
  const title = String(ev.title ?? "").trim() || "compromisso";
  const hh = ev.startIso ? lisbonHhMm(ev.startIso) : null;
  return hh ? `${title} às ${hh}` : title;
}

function listOf(events: AgendaFactEvent[], max = 4): string {
  return events.slice(0, max).map(label).join("; ");
}

/**
 * Texto do briefing quando NÃO há prioridades a destacar.
 * Nunca diz "livre" sem ter olhado para a agenda do dia inteira.
 */
export function composeNoPrioritiesBriefing(
  firstName: string,
  events: AgendaFactEvent[],
  now: Date = new Date(),
): string {
  const hello = `Bom dia${firstName ? `, ${firstName}` : ""}.`;
  const s = splitDayAgenda(events, now);

  // Dia genuinamente vazio — a única situação em que "livre" é verdade.
  if (s.total === 0) {
    return `${hello} Hoje a agenda está livre. ${emptyDaySuggestion(now)}`;
  }

  // Ainda há trabalho marcado: não se diz "livre" de maneira nenhuma.
  if (s.remainingWork.length) {
    const extra = s.remainingLeisure.length ? ` Tens também ${listOf(s.remainingLeisure, 2)}.` : "";
    return `${hello} Não tenho nada a destacar como prioridade, mas tens hoje: ${listOf(s.remainingWork)}.${extra}`;
  }

  // Só lazer/pessoal por acontecer: "sem trabalho" não é "sem nada".
  if (s.remainingLeisure.length) {
    return `${hello} Sem compromissos de trabalho marcados para hoje — tens ${listOf(s.remainingLeisure, 2)}. ${emptyDaySuggestion(now)}`;
  }

  // Tudo o que havia já aconteceu: livre a partir de agora, não o dia todo.
  if (s.pastWork.length) {
    return `${hello} A partir de agora estás livre — hoje já tiveste ${listOf(s.pastWork, 3)}. ${emptyDaySuggestion(now)}`;
  }
  return `${hello} A partir de agora estás livre — hoje já tiveste ${listOf(s.past, 3)}. ${emptyDaySuggestion(now)}`;
}
