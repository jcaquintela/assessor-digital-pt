// MEMÓRIA DE DECISÕES DO MENTOR
// Módulo puro. Recebe as decisões já lidas da BD e diz o que fazer com a
// próxima sugestão do MESMO sinal. Nada aqui lê ou escreve na base de dados.
//
// Regra de convivência (o que um bom assessor faria):
//   confirmar → já estás a tratar disso: cala-se 7 dias e, ao voltar, retoma
//               o assunto em vez de o apresentar como novidade.
//   editar    → a sugestão é útil mas não como está: cala-se 14 dias e passa a
//               levar em conta o ajuste que escreveste.
//   cancelar  → não é para ti: cala-se 90 dias nesse sinal.

export type MentorDecisionKind = "confirmar" | "editar" | "cancelar";

export interface MentorDecision {
  tipKey: string;
  decision: MentorDecisionKind;
  note?: string | null;
  createdAt: string;
}

export const SILENCE_DAYS: Record<MentorDecisionKind, number> = {
  confirmar: 7,
  editar: 14,
  cancelar: 90,
};

export interface DecisionEffect {
  /** Não mostrar a sugestão desta volta. */
  silenced: boolean;
  /** Dias que faltam até o sinal voltar. */
  daysLeft: number;
  /** Linha a acrescentar ao texto quando a sugestão volta depois de uma decisão. */
  memoryLine: string | null;
  last: MentorDecision | null;
}

function daysBetween(a: string, now: number): number {
  const t = new Date(a).getTime();
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return (now - t) / 864e5;
}

/** Decisão mais recente para um sinal. */
export function lastDecision(
  decisions: MentorDecision[],
  tipKey: string,
): MentorDecision | null {
  const mine = decisions
    .filter((d) => d.tipKey === tipKey)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return mine[0] ?? null;
}

export function decisionEffect(
  decisions: MentorDecision[],
  tipKey: string,
  now: number = Date.now(),
): DecisionEffect {
  const last = lastDecision(decisions, tipKey);
  if (!last) return { silenced: false, daysLeft: 0, memoryLine: null, last: null };

  const idade = daysBetween(last.createdAt, now);
  const janela = SILENCE_DAYS[last.decision];
  const daysLeft = Math.max(0, Math.ceil(janela - idade));
  if (idade < janela) return { silenced: true, daysLeft, memoryLine: null, last };

  const nota = (last.note ?? "").trim();
  const memoryLine =
    last.decision === "confirmar"
      ? "Da última vez disseste que ias tratar disto — continua por resolver."
      : last.decision === "editar"
        ? nota
          ? `Da última vez ajustaste esta sugestão: "${nota}".`
          : "Da última vez pediste para ajustar esta sugestão."
        : "Já tinhas dispensado este sinal há uns meses — voltou a aparecer.";

  return { silenced: false, daysLeft: 0, memoryLine, last };
}

export interface TipLike {
  key: string;
  text: string;
}

/**
 * Aplica a memória de decisões a uma sugestão já composta.
 * Devolve `null` quando o sinal ainda está em silêncio.
 */
export function applyDecisions<T extends TipLike>(
  tip: T | null,
  decisions: MentorDecision[],
  now: number = Date.now(),
): T | null {
  if (!tip) return null;
  const eff = decisionEffect(decisions, tip.key, now);
  if (eff.silenced) return null;
  if (!eff.memoryLine) return tip;
  return { ...tip, text: `${eff.memoryLine} ${tip.text}` };
}
