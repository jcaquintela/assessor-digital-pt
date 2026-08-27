// Dia útil sem prioridades: o Afonso não fica em silêncio — dá sinal de vida
// com uma sugestão de acção. O texto roda por semana para não soar a robô
// em semanas consecutivas de agenda vazia.

import { lisbonYmd } from "../lisbon-day";

export const EMPTY_DAY_SUGGESTIONS: string[] = [
  "Boa oportunidade para fazeres a ronda de prospeção — só tirares uma foto a uma placa e eu trato do resto.",
  "Aproveita para ligar a dois ou três proprietários antigos — diz-me quem são e eu preparo o guião.",
  "Dia ideal para dar um toque aos compradores em espera — manda-me o nome e eu ajudo-te a retomar a conversa.",
];

/** Semana ISO em Lisboa — base estável para rodar as variantes. */
export function lisbonIsoWeek(now: Date): number {
  const d = new Date(`${lisbonYmd(now)}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // segunda = 0
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const fday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fday + 3);
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86400000));
}

export function emptyDaySuggestion(now: Date = new Date()): string {
  const i = Math.abs(lisbonIsoWeek(now)) % EMPTY_DAY_SUGGESTIONS.length;
  return EMPTY_DAY_SUGGESTIONS[i]!;
}

/** Mensagem completa para dia útil sem prioridades. */
export function composeEmptyDayBriefing(firstName: string, now: Date = new Date()): string {
  const hello = `Bom dia${firstName ? `, ${firstName}` : ""}.`;
  return `${hello} Hoje a agenda está livre. ${emptyDaySuggestion(now)}`;
}
