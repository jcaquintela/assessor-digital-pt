// Cultura conversacional do Assessor — camada de sanitização e frases naturais.
// Ver docs de cultura (secções 3, 22, 23): nunca deixar linguagem técnica
// escapar para o utilizador. Todas as respostas passam por `sanitizeReply`
// antes de sair, e há fallbacks naturais quando o texto está vazio ou
// contém termos proibidos.

// Prefixos técnicos que o modelo por vezes injeta.
const TECH_PREFIX_RE =
  /^\s*(proposta|intenç[ãa]o|resumo|registo\s+pendente|payload|a[cç][ãa]o(?:\s+estruturada)?|estado\s+pendente|registo\s+miscellaneous)\s*[:\-–—]\s*/i;

// Palavras/marcadores que nunca devem aparecer numa resposta ao consultor.
const FORBIDDEN_TOKENS: RegExp[] = [
  /\bInvalid\s*Date\b/gi,
  /\bundefined\b/gi,
  /\bnull\b/gi,
  /\bNaN\b/g,
  /\bpayload\b/gi,
  /\bintent[o]?\b/gi,
  /\bessa\s+tarefa\b/gi,
];

// Vocabulário técnico que nunca deve aparecer nas respostas ao consultor.
// Usado por `hasHumanTone` e `enforceHumanTone` para pontuar/limpar.
const TECH_VOCAB_RE =
  /\b(intent|payload|tool|backend|schema|endpoint|token|status\s+code|id\s*[:=]|uuid|json|api|database|tabela|coluna|policy|rls|migration)\b/gi;

// Aberturas que fingem execução antes do backend confirmar.
// Inclui verbos de reagendamento ("passo", "reagendei", "adiei", "mudei",
// "movi") — o Assessor não pode dizer que reagendou sem UPDATE verificado.
const PRECLAIM_RE = /^\s*(feito|pronto|registei|guardei|criei|marquei|apaguei|actualizei|atualizei|reagendei|reagendo|passo|passei|adiei|adio|mudei|mudo|movi|movo|remarquei|remarco)\b[^\n]*[.!?]?\s*/i;

// Confirmação em linguagem de formulário ("Confirmas os seguintes campos: …").
const FORM_CONFIRM_RE = /confirmas?\s+os?\s+seguintes?\s+(campos|dados|itens)\s*:/i;

// Frases-fallback naturais (secção 22).
export const NATURAL_FALLBACKS = {
  didNotUnderstand: "Não percebi bem essa parte. Podes explicar de outra forma?",
  askDate: "Não percebi bem a data. Para que dia é?",
  askTime: "A que horas queres?",
  aiDown: "Recebi a tua mensagem, mas estou com dificuldade em processá-la agora. Tenta novamente dentro de instantes.",
  cancelled: "Está bem, não registei nada.",
  done: "Feito.",
  registered: "Fica registado.",
  hereForYou: "Estou aqui. Diz-me o que precisares.",
  unassociated:
    "Olá. Este número ainda não está associado a uma conta do Assessor. Entra no dashboard e confirma o teu número de WhatsApp.",
} as const;

// Remove prefixos técnicos e apaga tokens proibidos. Se o resultado ficar
// vazio ou for uma frase banida, devolve string vazia — o chamador decide
// o fallback natural apropriado.
export function sanitizeReply(reply?: string | null): string {
  if (!reply) return "";
  let out = String(reply).replace(TECH_PREFIX_RE, "").trim();
  for (const re of FORBIDDEN_TOKENS) out = out.replace(re, "").trim();
  // Colapsar duplos espaços e pontuação pendurada.
  out = out.replace(/\s{2,}/g, " ").replace(/\s+([,.?!;:])/g, "$1").trim();
  // Frases genéricas proibidas — devolve vazio para o caller usar fallback.
  if (/^\s*(podes\s+reformular(\s+o\s+pedido)?[?.!]?)\s*$/i.test(out)) return "";
  if (/^\s*neste\s+momento\s+s[óo]\s+consigo/i.test(out)) return "";
  return out;
}

// Devolve uma resposta segura: aplica `sanitizeReply` e, se ficar vazia,
// usa o fallback natural indicado (por defeito "não percebi").
export function safeReply(
  reply?: string | null,
  fallback: string = NATURAL_FALLBACKS.didNotUnderstand,
): string {
  return sanitizeReply(reply) || fallback;
}

// Verifica se a resposta parece humana: sem vocabulário técnico, sem
// linguagem de formulário, ≤ 2 frases. Usado pelo AQS.
export function hasHumanTone(reply?: string | null): boolean {
  const s = String(reply ?? "").trim();
  if (!s) return false;
  if (TECH_VOCAB_RE.test(s)) return false;
  if (FORM_CONFIRM_RE.test(s)) return false;
  const sentences = s.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length > 3) return false;
  return true;
}

// Garante que a resposta é adequada para enviar ao consultor:
// remove aberturas de "Feito" antes de acção confirmada, corta para 2 frases
// e substitui pedidos de confirmação em formato de formulário por linguagem
// natural. Se `actionExecutedOk` é falso, o "Feito" pré-emptivo cai fora.
export function enforceHumanTone(
  reply: string,
  opts: { actionExecutedOk?: boolean } = {},
): string {
  let out = reply;
  if (!opts.actionExecutedOk) out = out.replace(PRECLAIM_RE, "").trim();
  out = out.replace(TECH_VOCAB_RE, "").replace(/\s{2,}/g, " ").trim();
  out = out.replace(FORM_CONFIRM_RE, "Confirmas?").trim();
  // Corta para no máximo 2 frases.
  const parts = out.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (parts.length > 2) out = parts.slice(0, 2).join(" ");
  return out.trim();
}

// Se a resposta tem mais do que uma pergunta, mantém só a primeira.
// Uma pergunta de cada vez é regra dura da cultura PT do assessor.
export function enforceSingleQuestion(reply: string): string {
  const s = reply.trim();
  const qCount = (s.match(/\?/g) ?? []).length;
  if (qCount <= 1) return s;
  const parts = s.split(/(?<=\?)\s+/);
  const first = parts.find((p) => p.includes("?")) ?? parts[0];
  return first.trim();
}
