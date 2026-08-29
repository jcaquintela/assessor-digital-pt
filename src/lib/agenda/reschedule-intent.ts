// Esclarecimento de horas ≠ pedido de remarcação — módulo puro.
//
// Caso real (29/08): depois de um aviso de conflito, o consultor escreveu
// "Um é as 10 e o outro às 10:45" — estava a corrigir a leitura do Afonso,
// não a pedir mudança nenhuma. O motor disparou `reschedule_reminder`. Foi
// inócuo porque a hora nova coincidiu com a antiga; com números diferentes
// teria mexido na agenda (e no Outlook) sem confirmação.
//
// Regra: só um pedido explícito escreve. Uma frase que descreve o que já é
// fica em leitura — no máximo pede confirmação.

/** Verbos que significam mesmo "muda isto". */
const RESCHEDULE_VERB_RE =
  /\b(passa(r)?|muda(r)?|mude|altera(r)?|adia(r)?|antecipa(r)?|reagenda(r)?|remarca(r)?|desloca(r)?|empurra(r)?|troca(r)\s+(a\s+)?hora)\b/i;

/** Formas afirmativas de constatação: "é às 10", "está marcado para as 10". */
const STATEMENT_RE =
  /\b(é|e|era|está|esta|fica|ficou|foi|tenho|temos|são|sao)\s+(às|as|a|para|marcad[oa])\b/i;

/** "um … e o outro …", "o primeiro … o segundo …" — enumeração descritiva. */
const ENUMERATION_RE =
  /\b(um|uma)\b[^]{0,40}\b(e\s+(o|a)\s+outr[oa])\b|\bo\s+primeiro\b[^]{0,60}\bo\s+segundo\b/i;

export interface ClarificationVerdict {
  /** Frase descreve o que já é: não deve escrever. */
  clarification: boolean;
  /** Pedido explícito de remarcação: escreve normalmente. */
  explicitReschedule: boolean;
}

export function readRescheduleIntent(raw: string): ClarificationVerdict {
  const text = String(raw ?? "").trim();
  if (!text) return { clarification: false, explicitReschedule: false };
  const explicit = RESCHEDULE_VERB_RE.test(text);
  if (explicit) return { clarification: false, explicitReschedule: true };
  const clarification = ENUMERATION_RE.test(text) || STATEMENT_RE.test(text);
  return { clarification, explicitReschedule: false };
}

/** Atalho: esta frase pode disparar uma escrita de remarcação? */
export function isScheduleClarification(raw: string): boolean {
  return readRescheduleIntent(raw).clarification;
}

/**
 * Resposta quando se travou a escrita: o Afonso não inventa nem escreve —
 * diz o que percebeu e devolve a decisão ao consultor.
 */
export function clarificationHoldReply(): string {
  return "Percebi — estavas a corrigir-me as horas, não a pedir mudança. Não mexi em nada. Se quiseres mesmo mudar algum, diz-me qual e para que hora.";
}
