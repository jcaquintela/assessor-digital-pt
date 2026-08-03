// Regra única do produto: o título é sempre o ASSUNTO (negócio, pessoa, imóvel,
// seguimento) e a ação sugerida vive dentro da frase explicativa — nunca o
// contrário. Usado por Hoje, Atrasados e Esta semana através do AssuntoCard.

export type AssuntoSubject = {
  subject_type?: "follow_up" | "opportunity" | "property" | string;
  action?: string | null;
  entity_label?: string | null;
  deal_label?: string | null;
  titulo?: string | null;
};

export function assuntoDe(p: AssuntoSubject): string {
  const label = p.titulo
    ?? (p.subject_type === "opportunity"
      ? p.deal_label || p.entity_label
      : p.entity_label || p.deal_label);
  return (label && label.trim()) || (p.action ?? "").trim() || "Sem assunto";
}

/** Junta a explicação com a ação sugerida, sem repetir o título. */
export function fraseComAcao(p: AssuntoSubject, explicacao: string): string {
  const acao = (p.action ?? "").trim();
  if (!acao || assuntoDe(p) === acao) return explicacao;
  const sufixo = ` Vale a pena ${acao.charAt(0).toLowerCase()}${acao.slice(1)}.`;
  return `${explicacao}${sufixo}`;
}
