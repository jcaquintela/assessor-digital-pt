// Arquivar vários ficheiros do Drive por conversa — parte pura (sem I/O).
//
// Guardrail que se mantém: por conversa NUNCA se elimina definitivamente.
// O lote só arquiva (reversível) e só depois de o consultor ver a lista dos
// N ficheiros e confirmar explicitamente.

export const CONFIRM_BULK_ARCHIVE_INTENT = "confirm_bulk_archive";

/** Máximo de ficheiros por lote — acima disto pede-se para afinar o pedido. */
export const BULK_ARCHIVE_MAX = 50;
/** Quantos nomes se mostram na lista antes de resumir o resto. */
export const BULK_ARCHIVE_PREVIEW = 10;

export type BulkKind = "audio" | "image" | "document" | "any";

/** Arquivar (reversível) ou apagar (vai para eliminados). */
export type BulkMode = "archive" | "delete";

export type BulkArchiveRequest = {
  kind: BulkKind;
  /** Palavra-chave opcional para filtrar pelo nome do ficheiro. */
  term: string | null;
};

const ARCHIVE_VERB =
  /\b(apaga|apagar|apaga-me|elimina|eliminar|remove|remover|arquiva|arquivar|limpa|limpar|deita\s+fora|tira|tirar)\b/i;

// Verbos que o consultor usa quando quer mesmo apagar, não arrumar.
const DELETE_VERB = /\b(apaga|apagar|apaga-me|elimina|eliminar|remove|remover|deita\s+fora)\b/i;

/** "apaga os áudios" → delete; "arquiva as fotos" → archive. */
export function bulkActionMode(text: string): BulkMode {
  return DELETE_VERB.test(String(text ?? "")) ? "delete" : "archive";
}

const PLURAL_ALL =
  /\b(todos|todas|tudo|os\s+meus|as\s+minhas|v[áa]rios|v[áa]rias)\b/i;

// Nota: "á" não é word char em JS, por isso \b antes de "áudios" nunca casa.
const KIND_PATTERNS: Array<{ kind: BulkKind; re: RegExp }> = [
  { kind: "audio", re: /(?:^|\W)([áa]udios|gravaç[õo]es|voice\s*notes?|mensagens\s+de\s+voz)(?:$|\W)/i },
  { kind: "image", re: /\b(fotos|fotografias|imagens|prints?|screenshots?)\b/i },
  { kind: "document", re: /\b(documentos|docs|pdfs?|ficheiros\s+pdf)\b/i },
  { kind: "any", re: /\b(ficheiros|anexos|uploads)\b/i },
];

const TERM_RE = /\b(?:de|do|da|com|sobre|chamados?)\s+(?:nome\s+)?["“']?([\p{L}\p{N}][\p{L}\p{N}\-_. ]{1,30})["”']?\s*$/iu;

const TERM_STOPWORDS = new Set([
  "teste", "testes", "hoje", "ontem", "sempre", "drive", "voz", "todos", "todas",
]);

// Singular com nome à mistura: "apaga o ficheiro caderneta Gaia".
const SINGLE_PATTERNS: Array<{ kind: BulkKind; re: RegExp }> = [
  { kind: "audio", re: /(?:^|\W)(?:o\s+)?([áa]udio|gravaç[ãa]o)\s+(.{2,60})$/i },
  { kind: "image", re: /\b(?:a\s+)?(foto|fotografia|imagem)\s+(.{2,60})$/i },
  { kind: "document", re: /\b(?:o\s+)?(documento|pdf)\s+(.{2,60})$/i },
  { kind: "any", re: /\b(?:o\s+)?(ficheiro|anexo)\s+(.{2,60})$/i },
];

function cleanTerm(raw: string): string | null {
  const t = raw
    .replace(/^(?:chamad[oa]|de\s+nome|com\s+o\s+nome|do|da|de)\s+/i, "")
    .replace(/["“”']/g, "")
    .replace(/[.?!]+$/, "")
    .trim()
    .toLowerCase();
  if (t.length < 3 || TERM_STOPWORDS.has(t)) return null;
  return t;
}

/**
 * Pedido sobre ficheiros do Drive, em lote ou sobre um ficheiro identificado
 * pelo nome, já com o modo (arquivar vs. apagar).
 */
export function detectDriveFileRequest(
  text: string,
): (BulkArchiveRequest & { mode: BulkMode }) | null {
  const t = String(text ?? "").trim();
  const bulk = detectBulkArchiveRequest(t);
  if (bulk) return { ...bulk, mode: bulkActionMode(t) };
  if (!t || t.length > 200 || !ARCHIVE_VERB.test(t)) return null;
  for (const p of SINGLE_PATTERNS) {
    const m = p.re.exec(t);
    const term = m?.[2] ? cleanTerm(m[2]) : null;
    if (term) return { kind: p.kind, term, mode: bulkActionMode(t) };
  }
  return null;
}

/**
 * Reconhece "apaga os áudios todos", "arquiva todas as fotos de teste".
 * Exige verbo + substantivo plural de ficheiros + marca de lote (plural
 * explícito com "todos" ou o próprio plural do substantivo).
 */
export function detectBulkArchiveRequest(text: string): BulkArchiveRequest | null {
  const t = String(text ?? "").trim();
  if (!t || t.length > 200) return null;
  if (!ARCHIVE_VERB.test(t)) return null;

  const hit = KIND_PATTERNS.find((k) => k.re.test(t));
  if (!hit) return null;
  // "apaga o áudio" (singular) não é lote; o plural já basta como sinal.
  if (hit.kind === "any" && !PLURAL_ALL.test(t)) return null;

  let term: string | null = null;
  const m = TERM_RE.exec(t);
  if (m?.[1]) {
    const cand = m[1].trim().toLowerCase();
    if (cand.length >= 3 && !TERM_STOPWORDS.has(cand) && !KIND_PATTERNS.some((k) => k.re.test(cand))) {
      term = cand;
    }
  }
  return { kind: hit.kind, term };
}

export function kindLabel(kind: BulkKind, count: number): string {
  const plural = count !== 1;
  if (kind === "audio") return plural ? "áudios" : "áudio";
  if (kind === "image") return plural ? "fotos" : "foto";
  if (kind === "document") return plural ? "documentos" : "documento";
  return plural ? "ficheiros" : "ficheiro";
}

export function noMatchesReply(req: BulkArchiveRequest): string {
  const alvo = kindLabel(req.kind, 2);
  return req.term
    ? `Não encontrei ${alvo} com "${req.term}" no Drive Inteligente.`
    : `Não encontrei ${alvo} por arquivar no Drive Inteligente.`;
}

export function tooManyReply(kind: BulkKind, count: number): string {
  return (
    `Encontrei ${count} ${kindLabel(kind, count)} — são demasiados para arquivar de uma vez. ` +
    `Diz-me um período ou uma palavra do nome para eu reduzir a lista.`
  );
}

/** Lista os ficheiros à vista + pergunta de confirmação (arquivar, não apagar). */
export function buildBulkArchiveQuestion(
  kind: BulkKind,
  names: string[],
): string {
  const n = names.length;
  const shown = names.slice(0, BULK_ARCHIVE_PREVIEW).map((name, i) => `${i + 1}. ${name}`);
  const rest = n - shown.length;
  const lista = rest > 0 ? [...shown, `… e mais ${rest}`].join("\n") : shown.join("\n");
  return (
    `Encontrei ${n} ${kindLabel(kind, n)}:\n${lista}\n\n` +
    `Confirmas arquivar estes ${n}? Arquivar é reversível — repões no Drive Inteligente quando quiseres. ` +
    `Eliminar definitivamente continua a ser só na área de documentos.`
  );
}

export function bulkArchivedReply(kind: BulkKind, count: number): string {
  return (
    `Arquivei ${count} ${kindLabel(kind, count)}. ` +
    `Saem das listas mas ficam em Arquivados no Drive Inteligente — repõe quando precisares.`
  );
}

export const BULK_ARCHIVE_CANCELLED_REPLY = "Certo, não arquivei nada.";