// Cultura conversacional do Assessor — camada de sanitização e frases naturais.
// Ver docs de cultura (secções 3, 22, 23): nunca deixar linguagem técnica
// escapar para o utilizador. Todas as respostas passam por `sanitizeReply`
// antes de sair, e há fallbacks naturais quando o texto está vazio ou
// contém termos proibidos.

import { enforceNoDirectContact } from "./no-direct-contact";

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
  // "tens um null" → "tens um lembrete". Apagar o token deixaria a frase
  // truncada ("tens um."); aqui damos-lhe um nome genérico legível.
  out = out.replace(/\b(um|uma|o|a|este|esta|esse|essa)\s+(null|undefined)\b/gi, "$1 lembrete");
  for (const re of FORBIDDEN_TOKENS) out = out.replace(re, "").trim();
  // Colapsar duplos espaços e pontuação pendurada.
  out = out.replace(/\s{2,}/g, " ").replace(/\s+([,.?!;:])/g, "$1").trim();
  // Frases genéricas proibidas — devolve vazio para o caller usar fallback.
  if (/^\s*(podes\s+reformular(\s+o\s+pedido)?[?.!]?)\s*$/i.test(out)) return "";
  if (/^\s*neste\s+momento\s+s[óo]\s+consigo/i.test(out)) return "";
  // O Afonso nunca contacta terceiros — a linguagem tem de reflectir isso.
  out = enforceNoDirectContact(out);
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

// Abreviaturas PT-PT que terminam em ponto mas NÃO terminam a frase.
// Sem isto, "Queres ligar já ao *Sr. Nogueira*?" era cortado em "…ao *Sr."
const ABBREVIATIONS = [
  "sr", "sra", "srs", "sras", "dr", "dra", "drs", "dras", "eng", "enga", "arq",
  "d", "exmo", "exma", "prof", "profa", "av", "r", "n", "nº", "ex", "etc",
  "tel", "telem", "lda", "sa", "urb", "apt", "fig", "pág", "vs", "aprox",
];
const ABBREV_RE = new RegExp(
  `(?:^|[\\s(\\[*_"'])(?:${ABBREVIATIONS.join("|")})\\.$`,
  "i",
);

// Marcadores de ênfase abertos (negrito/itálico WhatsApp) por fechar.
function hasOpenEmphasis(s: string): boolean {
  return (s.match(/\*/g) ?? []).length % 2 === 1 || (s.match(/_/g) ?? []).length % 2 === 1;
}

/**
 * Divide em frases sem cortar abreviaturas ("Sr.", "Dr.", "Av.") nem dentro
 * de um par de *negrito* / _itálico_ ainda por fechar.
 */
export function splitSentences(s: string): string[] {
  const raw = s.split(/(?<=[.!?])(\s+)/);
  const out: string[] = [];
  let buf = "";
  for (let i = 0; i < raw.length; i += 2) {
    const chunk = raw[i] ?? "";
    const gap = raw[i + 1] ?? "";
    buf += chunk;
    const isLast = i + 2 >= raw.length;
    if (isLast) break;
    if (ABBREV_RE.test(buf) || hasOpenEmphasis(buf)) {
      buf += gap;
      continue;
    }
    out.push(buf);
    buf = "";
  }
  if (buf.trim()) out.push(buf);
  return out.filter((p) => p.trim().length > 0);
}

// Verifica se a resposta parece humana: sem vocabulário técnico, sem
// linguagem de formulário, ≤ 2 frases. Usado pelo AQS.
export function hasHumanTone(reply?: string | null): boolean {
  const s = String(reply ?? "").trim();
  if (!s) return false;
  if (TECH_VOCAB_RE.test(s)) return false;
  if (FORM_CONFIRM_RE.test(s)) return false;
  const sentences = splitSentences(maskQuoted(s).masked);
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
  // Listas ("- item" por linha) nunca são cortadas — o consultor pediu para ver.
  if (/^\s*-\s+/m.test(out)) return out;
  // Corta para no máximo 2 frases — mas texto entre aspas (ex.: um script
  // que o consultor pediu) conta como parte da frase que o introduz.
  const { masked, store } = maskQuoted(out);
  const parts = splitSentences(masked);
  const kept = parts.length > 2 ? parts.slice(0, 2).map((p) => p.trim()).join(" ") : masked;
  return unmaskQuoted(kept, store).trim();
}

// Texto entre aspas é conteúdo pedido pelo consultor (um script, uma
// mensagem para enviar). Não deve ser cortado nem contar como pergunta.
function maskQuoted(s: string): { masked: string; store: string[] } {
  const store: string[] = [];
  const masked = s.replace(/(['"“«])([^'"”»«]{3,}?)(['"”»])/g, (m) => {
    store.push(m);
    return `\u0000${store.length - 1}\u0000`;
  });
  return { masked, store };
}

function unmaskQuoted(s: string, store: string[]): string {
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i) => store[Number(i)] ?? "");
}

// Se a resposta tem mais do que uma pergunta, mantém só a primeira — mas
// preserva as frases afirmativas que a acompanham (ex.: a sugestão de
// script). Uma pergunta de cada vez, não uma frase de cada vez.
export function enforceSingleQuestion(reply: string): string {
  const { masked, store } = maskQuoted(reply.trim());
  const qCount = (masked.match(/\?/g) ?? []).length;
  if (qCount <= 1) return unmaskQuoted(masked, store).trim();
  const sentences = splitSentences(masked).map((p) => p.trim());
  let seenQuestion = false;
  const kept: string[] = [];
  for (const part of sentences) {
    if (part.includes("?")) {
      if (seenQuestion) continue;
      seenQuestion = true;
    }
    kept.push(part);
  }
  return unmaskQuoted(kept.join(" "), store).trim();
}
