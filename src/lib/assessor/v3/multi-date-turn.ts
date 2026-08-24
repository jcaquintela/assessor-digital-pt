// Duas datas na MESMA instrução: dois compromissos ou correção de um?
//
// Caso real (Iolanda, 13/08): um único áudio dizia "marcação das unhas dia 13
// de agosto às 15... e depois tenho no dia 7 de setembro às 10 da manhã". O
// motor criou o primeiro e, para o segundo, reconheceu o título igual e
// reagendou o de 13 de agosto para 7 de setembro: a marcação de 13 desapareceu,
// o aviso de véspera ficou órfão e nasceu um registo confuso.
//
// A heurística "título igual = reagendar" só é legítima quando as datas vêm em
// turnos diferentes ("muda a marcação das unhas para sexta" é uma mensagem à
// parte sobre algo que já existe). Dentro do mesmo turno, duas datas distintas
// são normalmente dois compromissos — excepto quando o consultor se corrige a
// meio da frase ("dia 13, ah não, afinal é dia 7"). Na dúvida ficamos com o
// comportamento antigo (um só registo): duplicar é pior do que reagendar.

const norm = (s: string): string =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** "ah não", "afinal", "espera", "quer dizer" — está a corrigir-se. */
const CORRECTION_RE =
  /\b(ah,?\s*n[ao]o|a[hi]\s*espera|espera(,| )|afinal|na verdade|quer dizer|melhor dizendo|desculpa|enganei|engano|corrig(e|i|indo)|nao e (no )?dia|nao e (a|as) \d)/;

/** "e depois tenho", "e também", "e no dia" — está a acrescentar. */
const ADDITION_RE =
  /\b(e depois|e tambem|e no dia|e a seguir|e ainda|e tenho|e mais tarde|alem disso|outra marcacao|outro compromisso|e outra|e outro|depois tenho)\b/;

const DATE_RE =
  /(\bdia\s+\d{1,2}\b|\b\d{1,2}\s+de\s+(janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b|\b(amanha|hoje|depois de amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo)\b)/g;

/** Quantas datas distintas são mencionadas no texto. */
export function countDateMentions(text: string | null | undefined): number {
  const t = norm(text ?? "");
  const found = [...t.matchAll(DATE_RE)].map((m) => m[0].trim().replace(/\s+/g, " "));
  return new Set(found).size;
}

export type MultiDateIntent = "single" | "separate" | "correction";

/**
 * Classifica a intenção quando há 2+ datas no mesmo turno.
 * - "separate"  → dois compromissos a criar (não reagendar o primeiro)
 * - "correction"→ o consultor corrigiu-se: um só registo
 * - "single"    → menos de duas datas; nada muda
 */
export function classifyMultiDateIntent(text: string | null | undefined): MultiDateIntent {
  if (countDateMentions(text) < 2) return "single";
  const t = norm(text ?? "");
  // Correção manda sempre: na dúvida não duplicamos.
  if (CORRECTION_RE.test(t)) return "correction";
  if (ADDITION_RE.test(t)) return "separate";
  return "correction";
}

/**
 * Sinal para o domínio: neste turno, um título igual com data diferente é um
 * compromisso NOVO, não um reagendamento do que acabou de ser criado.
 */
export function allowsSameTurnSiblings(text: string | null | undefined): boolean {
  return classifyMultiDateIntent(text) === "separate";
}

/** O mesmo sinal a partir dos itens já separados de um áudio. */
export function breakdownHasSeparateDates(
  items: Array<{ due_date?: string | null; text?: string | null }>,
): boolean {
  const dated = items.filter((i) => i?.due_date);
  if (dated.length < 2) return false;
  return new Set(dated.map((i) => String(i.due_date))).size >= 2;
}
