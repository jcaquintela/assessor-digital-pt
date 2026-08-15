// Sumarização só a pedido explícito.
//
// Decisão de produto (15/08): sumarizar automaticamente cada email recebido
// é custo linear no volume da caixa de entrada e ruído para o consultor.
// O Afonso avisa que há emails novos; só resume quando lhe pedem.

import { foldText } from "@/lib/search/normalize";

const ASK = [
  "resume", "resumo", "resumir", "sumario", "sumariza", "sumarizar",
  "do que fala", "de que fala", "o que diz", "o que e que diz", "o que quer",
  "poe em duas linhas", "explica-me esse email", "explica esse email",
];

/** `true` só quando o consultor pede mesmo um resumo. */
export function isSummaryRequest(text: string | null | undefined): boolean {
  const t = foldText(text);
  if (!t) return false;
  return ASK.some((k) => t.includes(k));
}

/** Nunca sumarizar por chegada de email — só a pedido. */
export const AUTO_SUMMARIZE_ON_ARRIVAL = false as const;

export function newEmailsNotice(count: number, knownNames: string[]): string {
  if (count <= 0) return "";
  const who = knownNames.slice(0, 3).join(", ");
  const base = count === 1 ? "Tens 1 email novo" : `Tens ${count} emails novos`;
  return who
    ? `${base} — de ${who}. Queres que resuma algum?`
    : `${base}. Queres que resuma algum?`;
}