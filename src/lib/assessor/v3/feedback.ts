// Feedback do consultor sobre o próprio produto (erro ou sugestão).
// Módulo puro: deteção + textos. Nunca escreve na base de dados.

export type FeedbackKind = "bug" | "suggestion";

// Só apanha quando o alvo é claramente o produto/Afonso, para não confundir
// uma queixa sobre um proprietário ou cliente com feedback do produto.
const PRODUCT_RE = /\b(afonso|assessor|aplica[çc][ãa]o|app|dashboard|sistema|plataforma)\b/i;

// Marcadores fracos: podem ser o produto ou a situação com uma pessoa.
const VAGUE_RE = /\b(isto|isso|aquilo)\b/i;

// Sinais de que a frase fala de uma pessoa (proprietário, cliente, etc.).
const PERSON_RE =
  /\b(propriet[áa]ri[oa]s?|dono|dona|client[ea]s?|comprador(?:es|a)?|vendedor(?:es|a)?|inquilin[oa]s?|senhor(?:a)?|visita|angaria[çc][ãa]o|neg[óo]cio)\b/i;

const BUG_RE =
  /\b(bug|erro|falha|avaria|rebentou|partiu|deixou\s+de\s+funcionar|n[ãa]o\s+funciona|est[áa]\s+mal|apareceu\s+mal|problema\s+t[ée]cnico)\b/i;

const SUGGESTION_RE =
  /\b(sugest[ãa]o|sugiro|sugerir|seria\s+bom|era\s+bom|devias|podias\s+passar\s+a|melhoria|ideia\s+para|gostava\s+que\s+(?:o\s+)?(?:afonso|tu)|proposta\s+de\s+melhoria)\b/i;

/**
 * Classifica o alvo de uma queixa/sugestão:
 * - "product": é claramente sobre o Afonso/aplicação;
 * - "ambiguous": pode ser o produto ou uma pessoa (proprietário/cliente);
 * - null: não é feedback do produto.
 */
export function detectFeedbackTarget(text: string): {
  kind: FeedbackKind;
  target: "product" | "ambiguous";
} | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  const bug = BUG_RE.test(t);
  const suggestion = SUGGESTION_RE.test(t);
  if (!bug && !suggestion) return null;
  const kind: FeedbackKind = bug ? "bug" : "suggestion";
  const product = PRODUCT_RE.test(t);
  const person = PERSON_RE.test(t);
  if (product && !person) return { kind, target: "product" };
  if (product && person) return { kind, target: "ambiguous" };
  if (!product && VAGUE_RE.test(t)) return { kind, target: "ambiguous" };
  return null;
}

/** Devolve o tipo de feedback quando a mensagem é claramente sobre o produto. */
export function detectFeedbackIntent(text: string): FeedbackKind | null {
  const hit = detectFeedbackTarget(text);
  return hit && hit.target === "product" ? hit.kind : null;
}

export function feedbackLabel(kind: FeedbackKind): string {
  return kind === "bug" ? "erro" : "sugestão";
}

// ---- Abertura de feedback em vários turnos ----
// "Posso dar uma sugestão?" / "queria reportar um erro" → anuncia a intenção
// sem trazer ainda o corpo. Abrimos um pending a aguardar o conteúdo.
const ANNOUNCE_BUG_RE =
  /\b(erro|bug|falha|problema\s+t[ée]cnico)\b/i;
const ANNOUNCE_SUGGESTION_RE =
  /\b(sugest[ãa]o|sugest[õo]es|ideia|melhoria|feedback)\b/i;
const ANNOUNCE_LEAD_RE =
  /\b(posso|podia|queria|quero|gostava|gostaria|tenho|deixo|deixar|dar[-\s]?te|reportar|reportar[-\s]?te|comunicar|registar|apontar|partilhar)\b/i;

/**
 * Deteta uma abertura de feedback (ainda sem corpo). Só dispara em frases
 * curtas de anúncio — o corpo real vem na mensagem seguinte.
 */
export function detectFeedbackAnnouncement(text: string): FeedbackKind | null {
  const t = (text ?? "").trim();
  if (!t || t.length > 140) return null;
  if (PERSON_RE.test(t)) return null;
  if (!ANNOUNCE_LEAD_RE.test(t)) return null;
  const bug = ANNOUNCE_BUG_RE.test(t);
  const suggestion = ANNOUNCE_SUGGESTION_RE.test(t);
  if (!bug && !suggestion) return null;
  return bug ? "bug" : "suggestion";
}

/** Resposta ao anúncio: convida o corpo do feedback. */
export function feedbackAskBody(kind: FeedbackKind): string {
  return kind === "bug"
    ? "Claro. Diz-me o que aconteceu — se tiveres um screenshot, envia também."
    : "Claro, diz. Conta-me a ideia em poucas palavras — se tiveres uma imagem que ajude, envia também.";
}

// Mensagens que não trazem corpo nenhum ("sim", "diz", "ok", "claro").
const FILLER_RE =
  /^(sim|ok|okay|claro|certo|pois|est[áa]\s+bem|diz|diz[-\s]?me|ent[ãa]o\s+diz|vai|for[çc]a|obrigad[oa])[\s.!,]*$/i;

/** true quando a mensagem ainda não contém o corpo do feedback. */
export function isEmptyFeedbackBody(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t) return true;
  if (FILLER_RE.test(t)) return true;
  return t.length < 12;
}

export const FEEDBACK_BODY_RETRY =
  "Diz-me só o que queres que fique guardado.";

/** Onde o registo fica — destino verificável, nunca um destinatário. */
export function feedbackDestination(kind: FeedbackKind): string {
  return kind === "bug" ? "Erros, no dashboard" : "Sugestões, no dashboard";
}

export function feedbackConfirmQuestion(kind: FeedbackKind): string {
  return kind === "bug"
    ? "Guardo isto como erro em Erros, no dashboard? Diz-me em poucas palavras o que aconteceu — se tiveres um screenshot, envia-o agora que junto ao registo."
    : "Guardo isto como sugestão em Sugestões, no dashboard? Diz-me em poucas palavras a ideia — se tiveres uma imagem ou ficheiro que ajude, envia agora que junto ao registo.";
}

/**
 * Confirmação: o quê + onde. Nunca promete envio a terceiros (clientes,
 * proprietários). Para sugestões, dizer que a equipa do Afonso as vê no
 * painel passou a ser verdade — existe /admin/sugestoes.
 */
export function feedbackSavedReply(
  kind: FeedbackKind,
  opts: { title?: string | null; withAttachment?: boolean } = {},
): string {
  const object = kind === "bug" ? "o erro" : "a sugestão";
  const title = String(opts.title ?? "").replace(/\s+/g, " ").trim();
  const short = title.length > 80 ? `${title.slice(0, 79)}…` : title;
  const what = short ? `${object} "${short}"` : object;
  const extra = opts.withAttachment ? " Anexo incluído." : "";
  if (kind === "suggestion") {
    return `Guardei ${what} em ${feedbackDestination(kind)}.${extra} A equipa do Afonso vê-a no painel interno — não enviei nada a clientes nem a terceiros.`;
  }
  return `Guardei ${what} em ${feedbackDestination(kind)}.${extra} Não enviei nada a ninguém.`;
}

export const FEEDBACK_ATTACHMENT_ADDED_REPLY =
  "Guardei o anexo no rascunho. Confirmas que guardo o registo no dashboard?";
export const FEEDBACK_CANCELLED_REPLY = "Sem problema, não guardei nada.";
export const FEEDBACK_FAILED_REPLY =
  "Tentei guardar isso no dashboard e não consegui. Podes repetir?";

/** Pergunta de clarificação quando não é claro se falas de mim ou de uma pessoa. */
export function feedbackClarifyQuestion(kind: FeedbackKind): string {
  return kind === "bug"
    ? "Só para não me enganar: isso é uma falha minha, ou é algo que se passou com uma pessoa (proprietário, cliente)?"
    : "Só para não me enganar: essa ideia é para mim melhorar, ou é uma nota sobre uma pessoa (proprietário, cliente)?";
}

const ABOUT_PRODUCT_RE =
  /\b(afonso|assessor|aplica[çc][ãa]o|app|dashboard|sistema|plataforma|tu|teu|tua|contigo|produto|falha\s+tua|minha\s+sugest[ãa]o\s+para\s+ti)\b/i;

/** Interpreta a resposta à clarificação. */
export function readClarifyAnswer(text: string): "product" | "person" | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  const product = ABOUT_PRODUCT_RE.test(t);
  const person = PERSON_RE.test(t) || /\b(pessoa|ele|ela)\b/i.test(t);
  if (product && !person) return "product";
  if (person && !product) return "person";
  return null;
}

export const FEEDBACK_CLARIFY_RETRY =
  "Desculpa, não percebi. É sobre mim (a aplicação) ou sobre uma pessoa?";
export const FEEDBACK_NOT_PRODUCT_REPLY =
  "Percebido, não é sobre mim. Diz-me o que queres que fique registado sobre essa pessoa.";
