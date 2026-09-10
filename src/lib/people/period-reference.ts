// Referências temporais a pessoas/leads ("a lead do fim de semana").
//
// Caso real (30-31/08, Iolanda): "a lead do fim de semana" não é um nome — é
// um período. Como não havia ninguém registado com esse nome, o Afonso
// escreveu uma mensagem genérica, sem nome nem contacto. Regra: quando o
// consultor identifica alguém por período, procuramos por período; se houver
// dúvida, perguntamos; se não houver ninguém, dizemos claramente.

import { foldText } from "@/lib/search/normalize";
import { lisbonYmd, lisbonLocalToUtcIso } from "@/lib/assessor/lisbon-day";

/** Substantivos que, no discurso do consultor, designam uma pessoa. */
const PERSON_NOUN = "(?:lead|leads|contacto|cliente|pessoa|senhora|senhor|comprador|compradora|propriet[aá]ri[oa]|interessad[oa]|visitante)";

export interface PersonPeriodReference {
  /** Expressão tal como foi dita ("fim de semana"). */
  expression: string;
  /** Descrição para a resposta ("do fim de semana"). */
  label: string;
  /** Limites (instantes UTC) do período, prontos para consulta. */
  fromIso: string;
  toIso: string;
}

function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  const base = new Date(Date.UTC(y!, m! - 1, d!));
  base.setUTCDate(base.getUTCDate() + delta);
  return base.toISOString().slice(0, 10);
}

function dow(ymd: string): number {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

function window(startYmd: string, endYmd: string): { fromIso: string; toIso: string } {
  return {
    fromIso: lisbonLocalToUtcIso(startYmd, "00:00"),
    toIso: lisbonLocalToUtcIso(addDaysYmd(endYmd, 1), "00:00"),
  };
}

/**
 * Intervalo de cada expressão temporal, em dias de calendário de Lisboa.
 * "fim de semana" = o sábado/domingo mais recente (o que já passou, ou o que
 * está a decorrer quando hoje é sábado ou domingo).
 */
function periodWindow(expr: string, todayYmd: string): { fromIso: string; toIso: string } | null {
  const day = dow(todayYmd);
  switch (expr) {
    case "hoje":
      return window(todayYmd, todayYmd);
    case "ontem": {
      const y = addDaysYmd(todayYmd, -1);
      return window(y, y);
    }
    case "anteontem": {
      const y = addDaysYmd(todayYmd, -2);
      return window(y, y);
    }
    case "fim de semana": {
      // Sábado mais recente (hoje incluído quando é sábado/domingo).
      const backToSat = day === 6 ? 0 : day === 0 ? 1 : day + 1;
      const sat = addDaysYmd(todayYmd, -backToSat);
      return window(sat, addDaysYmd(sat, 1));
    }
    case "semana passada": {
      const monThisWeek = addDaysYmd(todayYmd, -(((day + 6) % 7)));
      const mon = addDaysYmd(monThisWeek, -7);
      return window(mon, addDaysYmd(mon, 6));
    }
    case "esta semana": {
      const mon = addDaysYmd(todayYmd, -(((day + 6) % 7)));
      return window(mon, todayYmd);
    }
    case "mês passado": {
      const [y, m] = todayYmd.split("-").map((n) => parseInt(n, 10));
      const first = new Date(Date.UTC(y!, m! - 2, 1)).toISOString().slice(0, 10);
      const last = new Date(Date.UTC(y!, m! - 1, 0)).toISOString().slice(0, 10);
      return window(first, last);
    }
    default:
      return null;
  }
}

// Ordem importa: expressões mais longas primeiro.
const EXPRESSIONS: Array<{ key: string; re: RegExp; label: string }> = [
  { key: "fim de semana", re: /fim de semana|fim-de-semana/, label: "do fim de semana" },
  { key: "semana passada", re: /semana passada|semana anterior/, label: "da semana passada" },
  { key: "esta semana", re: /esta semana|desta semana/, label: "desta semana" },
  { key: "mês passado", re: /mes passado/, label: "do mês passado" },
  { key: "anteontem", re: /anteontem/, label: "de anteontem" },
  { key: "ontem", re: /ontem/, label: "de ontem" },
  { key: "hoje", re: /hoje/, label: "de hoje" },
];

/**
 * "a lead do fim de semana", "o contacto de ontem", "a pessoa da semana
 * passada" → período. Devolve `null` quando não há referência clara: nunca
 * inventa um intervalo a partir de uma data solta da frase.
 */
export function personPeriodReference(
  text: string | null | undefined,
  now: Date = new Date(),
): PersonPeriodReference | null {
  const t = foldText(text);
  if (!t) return null;
  const todayYmd = lisbonYmd(now);
  for (const e of EXPRESSIONS) {
    // O substantivo de pessoa tem de vir antes da expressão temporal, com no
    // máximo três palavras pelo meio ("a lead que entrou no fim de semana").
    const re = new RegExp(
      `${PERSON_NOUN}\\s+(?:\\p{L}+\\s+){0,3}(?:do|da|de|no|na|em|desse|dessa|deste|desta)?\\s*(?:${e.re.source})`,
      "u",
    );
    if (!re.test(t)) continue;
    const w = periodWindow(e.key, todayYmd);
    if (!w) continue;
    return { expression: e.key, label: e.label, ...w };
  }
  return null;
}

/**
 * Menção a uma lead/pessoa nova sem nome nenhum ("tenho de ligar à lead").
 * Serve para pedir o essencial antes de criar uma tarefa órfã.
 */
export function mentionsUnnamedLead(text: string | null | undefined): boolean {
  const t = foldText(text);
  if (!t) return false;
  return new RegExp(`(?:^|[^\\p{L}])${PERSON_NOUN}(?![\\p{L}])`, "u").test(t);
}
