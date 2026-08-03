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

/* ---------- Selectors por origem ----------
 * Cada origem de "Isto merece atenção" passa por aqui e devolve sempre o mesmo
 * formato { titulo, frase }: título = assunto, ação sugerida dentro da frase.
 * Assim, Hoje, Pessoas e Imóveis nunca divergem. */

export type AssuntoView = { titulo: string; frase: string };

/** Seguimentos: mesma fonte para as listas (Atrasados/Esta semana) e para a ficha. */
export function assuntoDeSeguimento(s: {
  titulo: string;
  tipo: "Evento" | "Tarefa" | string;
  data: string;
  estado?: string;
}): AssuntoView & { acao: string } {
  const titulo = assuntoDe({ subject_type: "follow_up", titulo: s.titulo });
  if (s.estado === "Concluído") return { titulo, frase: "Já está tratado.", acao: "" };
  const acao = s.tipo === "Evento" ? "Preparar o compromisso" : "Tratar este seguimento";
  const atrasado = new Date(s.data) < new Date();
  const explicacao = atrasado
    ? "Está em atraso."
    : s.tipo === "Evento" ? "Está agendado." : "Está por fazer.";
  return {
    titulo,
    frase: fraseComAcao({ subject_type: "follow_up", titulo: s.titulo, action: acao }, explicacao),
    acao,
  };
}

export function assuntoDePessoa(a: {
  name: string;
  days: number;
  everContacted: boolean;
}): AssuntoView {
  const subject: AssuntoSubject = {
    subject_type: "person",
    entity_label: a.name,
    action: "reativar o contacto antes que arrefeça de vez",
  };
  const nunca = a.everContacted
    ? ""
    : " — nunca registaste um contacto desde que criaste a ficha";
  return {
    titulo: assuntoDe(subject),
    frase: fraseComAcao(subject, `Sem contacto há ${a.days} dias${nunca}.`),
  };
}

export function assuntoDeImovel(a: {
  count: number;
  days: number;
  first: { id: string; title: string };
}): AssuntoView {
  const subject: AssuntoSubject = {
    subject_type: "property",
    entity_label: a.count === 1 ? a.first.title : `${a.count} imóveis por angariar`,
    action: "retomar antes que arrefeçam",
  };
  const explicacao = a.count === 1
    ? `Continua "Por angariar" há ${a.days} dias sem contacto real registado.`
    : `Continuam "Por angariar" há mais de 10 dias sem contacto real registado (o mais parado é ${a.first.title}, há ${a.days} dias).`;
  return { titulo: assuntoDe(subject), frase: fraseComAcao(subject, explicacao) };
}
