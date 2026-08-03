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

export function feedbackConfirmQuestion(kind: FeedbackKind): string {
  return `Queres que registe isto como ${feedbackLabel(kind)} para a equipa? Diz-me em poucas palavras o que aconteceu.`;
}

export const FEEDBACK_SAVED_REPLY = "Obrigado, registei. A equipa vai olhar para isto.";
export const FEEDBACK_CANCELLED_REPLY = "Sem problema, não registei nada.";
export const FEEDBACK_FAILED_REPLY = "Tentei registar isso para a equipa e não consegui. Podes repetir?";

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
