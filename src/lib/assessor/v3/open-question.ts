// Âncora das perguntas de esclarecimento do Afonso ("A que te referes?").
//
// Caso real (30/07, "Casa Final B"): rajada de placas, o Afonso pergunta se
// quer lembrete, chega "Ainda não" (19:55:29) e "sim" (19:55:31). O "não"
// consome o pendente; o "sim" fica órfão e recebe "Claro. A que te referes?"
// SEM deixar rastro nenhum. A resposta seguinte — "Casa Final B", título
// exacto de um imóvel existente — já não tinha pendente vivo, nem detetor,
// e acabou em Diversos ("não percebi").
//
// Regra: uma pergunta de esclarecimento é um compromisso conversacional. Fica
// gravada como pergunta em aberto, com expiração curta, e a resposta seguinte
// é lida contra ela pelos caminhos de resolução que já existem.
//
// Módulo puro — quem lê e escreve na base de dados é o .server.

/** Igual à ordem de grandeza da janela de contexto conversacional aberto. */
export const OPEN_QUESTION_TTL_MS = 10 * 60_000;

/** Intenção (e ranhura própria) da pergunta em aberto. */
export const OPEN_QUESTION_INTENT = "open_question";

/** Janela de rajada: mesma da correção de escolhas, com margem de execução. */
export const ORPHAN_BURST_MS = 5_000;

function norm(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * A resposta do Afonso é uma pergunta de esclarecimento? Termina em "?" e não
 * veio acompanhada de nenhuma ferramenta executada — ou seja, ele não fez
 * nada, só perguntou. É exactamente aí que a âncora falta.
 */
export function shouldRecordOpenQuestion(args: {
  reply: string | null | undefined;
  toolsExecuted?: number;
}): boolean {
  const reply = String(args.reply ?? "").trim();
  if (!reply || reply.length > 300) return false;
  if ((args.toolsExecuted ?? 0) > 0) return false;
  return /\?\s*$/.test(reply);
}

const YES_NO_RE =
  /^(sim|nao|ok|okay|claro|certo|exacto|exato|talvez|ainda\s+nao|pode\s+ser|obrigad\w*)\b/;

const WRITE_RE =
  /\b(marca|marcar|agenda|agendar|regista|registar|cria|criar|apaga|apagar|cancela|cancelar|desmarca|desmarcar|envia|enviar|manda|mandar|lembra)\b/;

/**
 * O texto parece nomear uma entidade (imóvel, pessoa, negócio) em resposta à
 * pergunta em aberto? Curto, sem pergunta, sem verbo de acção e sem ser um
 * simples sim/não — nada mais é adivinhado aqui.
 */
export function looksLikeEntityAnswer(raw: string | null | undefined): boolean {
  const text = String(raw ?? "").trim();
  if (!text || text.length > 60) return false;
  if (/[?]/.test(text)) return false;
  const t = norm(text);
  if (YES_NO_RE.test(t)) return false;
  if (WRITE_RE.test(t)) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 6) return false;
  return /^\p{L}/u.test(text);
}

/** A pergunta em aberto já caducou? (limpeza automática, como no modo treino.) */
export function isOpenQuestionExpired(
  row: { expires_at?: string | null } | null | undefined,
  now: number = Date.now(),
): boolean {
  const at = row?.expires_at ? new Date(row.expires_at).getTime() : NaN;
  if (!Number.isFinite(at)) return true;
  return at < now;
}

/**
 * Pergunta órfã com contexto: em vez de "A que te referes?" às cegas, nomeia
 * o assunto do pendente que a mesma rajada acabou de fechar.
 */
export function orphanBurstReply(subject: string | null | undefined): string {
  const s = String(subject ?? "").trim();
  if (!s) return "";
  return `Recebi um "não" e um "sim" quase ao mesmo tempo sobre ${s}. Fico com qual?`;
}
