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
