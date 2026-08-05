// Cancelamento de compromissos/seguimentos — parte pura (sem I/O).
//
// Caso real (05/08): "Limpa a minha agenda de hoje" e depois "Desmarca tudo.
// Não reagendes nada." O motor não tinha ferramenta nenhuma que escrevesse em
// `follow_ups`, chamou `cancel_reminder` (outra tabela), recebeu ok=true de um
// UPDATE que não tocou em linha nenhuma e respondeu "Feito.". Uma hora depois
// as mesmas três coisas voltaram a aparecer nas prioridades.
//
// Aqui vive a lógica testável: normalização, correspondência por assunto e a
// frase de resposta. A escrita em si está em `v2/domain.server.ts`.

import { displayTitle } from "../titles";

export interface CancellableItem {
  id: string;
  title?: string | null;
  due_time?: string | null;
}

/** Estado e resultado canónicos de um seguimento desmarcado pelo consultor. */
export const CANCELLED_STATUS = "Arquivado";
export const CANCELLED_OUTCOME = "cancelado";

export function normalizeForMatch(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP_WORDS = new Set([
  "a", "o", "as", "os", "de", "do", "da", "dos", "das", "e", "com", "para",
  "no", "na", "nos", "nas", "um", "uma", "ao", "aos", "em", "the", "sr", "sra",
  "dr", "dra", "meu", "minha", "que", "por",
]);

/**
 * Correspondência por assunto ("cancela a visita ao Sr. Duarte"). Devolve os
 * itens cujo título partilha pelo menos uma palavra significativa com a pista.
 * Conservador de propósito: desmarcar por engano é pior do que perguntar.
 */
export function matchByHint<T extends CancellableItem>(items: T[], hint: string): T[] {
  const words = normalizeForMatch(hint)
    .split(" ")
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  if (!words.length) return [];
  const scored = items
    .map((it) => {
      const hay = normalizeForMatch(String(it.title ?? ""));
      const hits = words.filter((w) => hay.includes(w)).length;
      return { it, hits };
    })
    .filter((s) => s.hits > 0);
  if (!scored.length) return [];
  const best = Math.max(...scored.map((s) => s.hits));
  return scored.filter((s) => s.hits === best).map((s) => s.it);
}

function label(item: CancellableItem): string {
  const t = item.due_time ? String(item.due_time).slice(0, 5).replace(":", "h") : "";
  const title = displayTitle(item.title);
  return t ? `${t} — ${title}` : title;
}

/**
 * Frase de resposta. Só afirma cancelamento quando houve escrita real: com
 * zero itens diz exactamente isso, nunca "Feito.".
 */
export function formatCancelReply(
  items: CancellableItem[],
  periodLabel?: string | null,
): string {
  if (!items.length) {
    return periodLabel
      ? `Não tinhas nada por desmarcar ${periodLabel}.`
      : "Não encontrei nada por desmarcar.";
  }
  if (items.length === 1) {
    return `Desmarquei ${displayTitle(items[0]!.title)}. Não reagendei nada.`;
  }
  const lines = items.slice(0, 10).map((it) => `- ${label(it)}`);
  const head = periodLabel
    ? `Desmarquei ${items.length} coisas ${periodLabel}:`
    : `Desmarquei ${items.length} coisas:`;
  return `${head}\n${lines.join("\n")}`;
}

/** Pergunta de desambiguação quando o assunto casa com vários compromissos. */
export function ambiguousCancelReply(items: CancellableItem[]): string {
  const lines = items.slice(0, 5).map((it) => `- ${label(it)}`);
  return `Tenho mais do que uma coisa que pode ser essa. Qual delas queres desmarcar?\n${lines.join("\n")}`;
}