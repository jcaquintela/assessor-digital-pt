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
  /\b(propriet[áa]ri[oa]s?|dono|dona|client[ea]s?|comprador(?:es|a)?|vendedor(?:es|a)?|inquilin[oa]s?|senhor(?:a)?|s[ru]?a?\.?\s|visita|angaria[çc][ãa]o|neg[óo]cio|contacto)\b/i;

const BUG_RE =
  /\b(bug|erro|falha|avaria|rebentou|partiu|deixou\s+de\s+funcionar|n[ãa]o\s+funciona|est[áa]\s+mal|apareceu\s+mal|problema\s+t[ée]cnico)\b/i;

const SUGGESTION_RE =
  /\b(sugest[ãa]o|sugiro|sugerir|seria\s+bom|era\s+bom|devias|podias\s+passar\s+a|melhoria|ideia\s+para|gostava\s+que\s+(?:o\s+)?(?:afonso|tu)|proposta\s+de\s+melhoria)\b/i;

/** Devolve o tipo de feedback quando a mensagem é claramente sobre o produto. */
export function detectFeedbackIntent(text: string): FeedbackKind | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  const bug = BUG_RE.test(t);
  const suggestion = SUGGESTION_RE.test(t);
  if (!bug && !suggestion) return null;
  if (!PRODUCT_RE.test(t)) return null;
  return bug ? "bug" : "suggestion";
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
