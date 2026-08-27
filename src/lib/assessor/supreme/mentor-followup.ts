// Seguimento sugerido a partir de um sinal do Mentor.
// Determinístico: a mesma sugestão gera sempre o mesmo tipo, notas e prazo.

import { lisbonYmd } from "../lisbon-day";

export interface MentorFollowUpSuggestion {
  title: string;
  /** Tipo do seguimento — "chamada" é tarefa, não compromisso de agenda. */
  type: "chamada" | "tarefa";
  notes: string;
  /** Prazo em dias a contar de hoje. */
  dueInDays: number;
}

const BY_KEY: Record<string, MentorFollowUpSuggestion> = {
  "imoveis-parados": {
    title: "Retomar contacto dos imóveis por angariar",
    type: "chamada",
    notes:
      "Sugerido pelo mentor: imóveis \"Por angariar\" há mais de 10 dias sem movimento registado. Ligar aos proprietários e registar o resultado.",
    dueInDays: 2,
  },
  "negocios-parados": {
    title: "Destravar negócios parados na mesma fase",
    type: "tarefa",
    notes:
      "Sugerido pelo mentor: negócios na mesma fase há mais de três semanas. Decidir por cada um: avançar de fase ou fechar.",
    dueInDays: 3,
  },
  "pessoas-frias": {
    title: "Contacto curto a pessoas sem contacto há 2 meses",
    type: "chamada",
    notes:
      "Sugerido pelo mentor: pessoas sem contacto registado há mais de 60 dias. Mensagem ou chamada curta, sem agenda de venda.",
    dueInDays: 5,
  },
};

export function mentorFollowUpSuggestion(tipKey: string): MentorFollowUpSuggestion | null {
  return BY_KEY[tipKey] ?? null;
}

/** Data-limite (YYYY-MM-DD) do seguimento sugerido. */
export function mentorFollowUpDueDate(dueInDays: number, from = new Date()): string {
  return lisbonYmd(new Date(from.getTime() + dueInDays * 864e5));
}
