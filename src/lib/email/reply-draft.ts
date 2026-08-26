// Rascunho de resposta a email — regras puras (sem I/O).
//
// Princípio não negociável: o Afonso NUNCA envia email por decisão própria.
// Prepara o rascunho, mostra-o, e o envio só acontece com uma frase de
// autorização inequívoca do consultor. "Sim", "ok", "boa" NÃO chegam: são
// respostas de cortesia que aparecem em conversa normal e não podem valer
// como autorização para uma mensagem que sai para fora.
//
// Este módulo é puro para poder ser coberto por Golden Tests sem BD, sem
// provedor de email e sem LLM.

/** Validade de um rascunho: 6 horas (decisão registada na memória). */
export const DRAFT_TTL_MS = 6 * 60 * 60 * 1000;

/** Máximo de iterações ao mesmo rascunho; a 4ª vai para o dashboard. */
export const MAX_REVISIONS = 3;

export type DraftReplyIntent =
  /** Autorização inequívoca de envio. */
  | "send"
  /** Quer mudar algo antes de enviar (vence sempre o padrão de envio). */
  | "edit"
  /** Desiste do envio. */
  | "reject"
  /** Concordância vaga — pedimos reformulação, nunca enviamos. */
  | "ambiguous"
  | "unknown";

function fold(text: string | null | undefined): string {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Frases inequívocas: "enviar", "envia", "envia o email", "podes enviar",
// "manda", "manda isso", "aprovado".
const SEND_RE =
  /\b(enviar|envia|envie|enviem|manda|mandar|mande|expede|aprovado|aprova|autorizo|autorizado)\b/;

// Concordância vaga — nunca autoriza.
const AMBIGUOUS_RE =
  /^(sim|ok|okay|oka|claro|boa|boas|certo|exato|exacto|perfeito|otimo|excelente|isso|pode ser|de acordo|combinado|top|fixe|sim boa|boa sim|sim ok|ok boa|sim claro|👍|👌|✅)$/;

// Pedido de alteração — vence sempre o padrão de envio na mesma frase.
const EDIT_RE =
  /\b(mas|muda|mudar|altera|alterar|corrige|corrigir|troca|trocar|acrescenta|acrescentar|adiciona|adicionar|retira|retirar|tira|remove|remover|reescreve|reescrever|refaz|refazer|antes|primeiro|em vez|substitui|substituir|mais curto|mais formal|mais simpatico)\b/;

// Recusa explícita.
const REJECT_RE =
  /\b(nao envies|nao enviar|nao mandes|nao mandar|nao envie|deixa estar|esquece|cancela|cancelar|descarta|descartar|nao quero|para|espera)\b/;

const NEGATION_BEFORE_SEND_RE = /\bnao\b/;

/**
 * Como interpretar a resposta do consultor a um rascunho apresentado.
 *
 * Ordem de precedência deliberada:
 * 1. recusa explícita
 * 2. pedido de alteração (mesmo quando a frase contém "envia")
 * 3. autorização inequívoca
 * 4. concordância vaga → reformulação
 */
/** Reacções de cortesia sem letras ("👍", "✅") — nunca autorizam envio. */
const EMOJI_ACK_RE = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+$/u;

export function classifyDraftReply(text: string | null | undefined): DraftReplyIntent {
  const raw = String(text ?? "").trim();
  const norm = fold(text);
  if (!norm) return raw && EMOJI_ACK_RE.test(raw) ? "ambiguous" : "unknown";

  if (REJECT_RE.test(norm)) return "reject";

  const wantsSend = SEND_RE.test(norm);

  // "não envies ainda", "não mandes assim" — negação vence sempre.
  if (wantsSend && NEGATION_BEFORE_SEND_RE.test(norm)) return "reject";

  // "envia mas muda a data" → itera, não envia.
  if (EDIT_RE.test(norm)) return "edit";

  if (wantsSend) return "send";

  if (AMBIGUOUS_RE.test(norm)) return "ambiguous";

  // Frase curta de cortesia com ruído ("sim, boa", "ok perfeito").
  const words = norm.split(" ");
  if (words.length <= 4 && words.every((w) => AMBIGUOUS_RE.test(w))) return "ambiguous";

  return "unknown";
}

export function isDraftExpired(
  expiresAt: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!expiresAt) return false;
  const t = expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(String(expiresAt));
  if (!Number.isFinite(t)) return false;
  return t < now.getTime();
}

/** Já foi enviado? Segunda confirmação nunca duplica o envio. */
export function isAlreadySent(row: { status?: string | null; sent_at?: string | null }): boolean {
  return row.status === "sent" || Boolean(row.sent_at);
}

/** Cancelado pelo consultor: nenhuma confirmação posterior vale. */
export function isDraftCancelled(row: { status?: string | null; cancelled_at?: string | null }): boolean {
  return row.status === "cancelled" || Boolean(row.cancelled_at);
}

/** A 4ª tentativa de iteração deixa de adivinhar e vai para o dashboard. */
export function iterationExhausted(revisions: number | null | undefined): boolean {
  return Number(revisions ?? 0) >= MAX_REVISIONS;
}

export function draftEditorPath(draftId: string): string {
  return `/comunicacao/rascunho/${draftId}`;
}

// ---------------------------------------------------------------------------
// Textos do canal. O corpo do rascunho sai SEMPRE numa mensagem isolada
// (padrão "mensagem sugerida" com botão Copiar) e a pergunta de confirmação
// vem numa bolha separada — nunca no mesmo balão.
// ---------------------------------------------------------------------------

export function draftPresentationIntro(args: {
  toLabel: string;
  subject: string | null;
  manualSend: boolean;
}): string {
  const alvo = args.toLabel || "o remetente";
  const assunto = args.subject ? ` sobre "${args.subject}"` : "";
  return `Preparei a resposta para ${alvo}${assunto}. Lê antes de seguir:`;
}

export function draftConfirmationQuestion(args: {
  draftId: string;
  manualSend: boolean;
}): string {
  const link = draftEditorPath(args.draftId);
  return args.manualSend
    ? `Se estiver bem, diz "enviar" e deixo-a pronta na tua caixa para dares o clique final. Queres mexer no texto? ${link}`
    : `Se estiver bem, diz "enviar" e eu envio. Queres mexer no texto? ${link}`;
}

export const AMBIGUOUS_REPLY =
  'Para um email que sai para fora não me basta um "sim". Confirmas com a palavra "enviar"?';

export function expiredReply(draftId: string): string {
  return `Esse rascunho já passou das 6 horas, por isso não o envio às cegas. Diz-me se queres que prepare de novo — ou abre-o em ${draftEditorPath(draftId)}.`;
}

export function alreadySentReply(): string {
  return "Esse email já tinha seguido — não volto a enviar o mesmo.";
}

export function exhaustedReply(draftId: string): string {
  return `Já reescrevi este email três vezes e continuo a não acertar. Abre-o em ${draftEditorPath(draftId)} e escreve como queres — assim não fico a adivinhar.`;
}

export function sentReply(toLabel: string): string {
  return `Enviado para ${toLabel}. Fica no histórico em /comunicacao.`;
}

export function manualSendReply(toLabel: string): string {
  return `Guardei o rascunho para ${toLabel} na pasta Rascunhos do Outlook — abre-o e carrega em Enviar para a mensagem seguir. Registei a tua autorização no histórico em /comunicacao.`;
}

export function cancelledReply(): string {
  return "Esse rascunho está cancelado — não o envio mesmo que digas \u201cenviar\u201d. Se quiseres, preparo outro de novo.";
}

export function cancelConfirmationReply(toLabel: string): string {
  return `Cancelei o rascunho para ${toLabel}. Não segue nada e deixei o cancelamento registado.`;
}

export function rejectedReply(): string {
  return "Certo, não envio nada. O rascunho fica guardado se quiseres voltar a ele.";
}

/** Cartão de escolha quando há mais de um email candidato. */
export function emailChoiceQuestion(
  candidates: Array<{ from: string | null; subject: string | null }>,
): string {
  const lines = candidates
    .slice(0, 4)
    .map((c, i) => `${i + 1}. ${c.from ?? "sem remetente"} — ${c.subject ?? "sem assunto"}`);
  return ["A qual destes queres responder?", ...lines].join("\n");
}
