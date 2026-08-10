// Regra larga para o BRIEFING MATINAL e a AGENDA DO DIA.
//
// Duas perguntas diferentes, dois filtros diferentes:
//  - "Como correu X?" (check-in qualitativo) → filtro ESTRITO:
//    hasCommercialOutcomeContext() exige ligação a Pessoa/Imóvel/Negócio.
//  - "O que tens hoje" (briefing/agenda) → esta regra, mais larga: mostra o
//    compromisso a menos que seja claramente pessoal/lazer.
//
// Assim o consultor continua a ver a agenda real do dia sem ser interrogado
// sobre um almoço de família.

import { hasCommercialOutcomeContext, type OutcomeCandidateContext } from "./outcome-eligibility";

/** Termos de lazer/pessoal. Comparados sem acentos, em minúsculas. */
export const LEISURE_TERMS: readonly string[] = [
  // refeições e convívio
  "almoco", "jantar", "cafe", "lanche", "brunch", "pequeno-almoco", "pequeno almoco",
  "copo", "petiscos",
  // datas pessoais (inclui os aniversários recorrentes importados do calendário)
  "aniversario", "aniversarios", "parabens", "birthday", "onomastico",
  "casamento", "batizado", "baptizado", "funeral",
  // descanso
  "ferias", "folga", "feriado", "day off", "pto", "descanso",
  // saude pessoal
  "medico", "dentista", "consulta medica", "hospital", "analises", "vacina",
  // desporto e lazer
  "ginasio", "treino", "jogo", "futebol", "padel", "corrida", "yoga", "pilates",
  "cinema", "concerto", "festa", "praia", "viagem pessoal",
  // familia
  "escola dos", "escola do", "escola da", "pediatra", "familia",
];

function norm(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** O título é claramente pessoal/lazer? */
export function isLeisureTitle(title: unknown): boolean {
  const t = norm(title);
  if (!t) return false;
  return LEISURE_TERMS.some((term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // fronteira de palavra tolerante a hífen/espaço, para não apanhar
    // "jogos florais" dentro de outra palavra nem falhar "Almoço:" com pontuação.
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(t);
  });
}

export interface AgendaCandidate extends OutcomeCandidateContext {
  title?: string | null;
}

/**
 * Entra no briefing matinal / agenda do dia?
 * Sim por omissão. Não quando é lazer sem qualquer ligação comercial —
 * um "Almoço com o Sr. Coelho" ligado à pessoa continua a ser trabalho.
 */
export function belongsInDailyAgenda(item: AgendaCandidate): boolean {
  if (hasCommercialOutcomeContext(item)) return true;
  return !isLeisureTitle(item.title);
}