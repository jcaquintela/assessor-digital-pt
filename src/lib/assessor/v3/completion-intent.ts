// Conclusão de tarefas ditada em linguagem natural — módulo puro (sem I/O).
//
// Caso real (13/08): "O estudo de mercado está tratado, faz uma semana. A
// visita de hoje ao apartamento de Consortes às 18h foi cancelada." O motor
// prendeu-se à ambiguidade da segunda instrução e nunca fechou a primeira —
// dias depois o mesmo estudo de mercado voltou no briefing.
//
// Cada instrução vive por si: "está tratado" sobre um assunto nomeado é um
// comando de conclusão, mesmo que a instrução ao lado precise de pergunta.

import { normalizeForMatch } from "./cancel-agenda";
import { displayTitle } from "../titles";

/** Estado e resultado canónicos de um seguimento dado como feito. */
export const COMPLETED_STATUS = "Concluído";
export const COMPLETED_OUTCOME = "concluido";

// "está tratado", "já tratei", "já fiz", "está feito", "já foi resolvido",
// "já está concluído", "isso já está despachado".
const DONE_RE =
  /\b(?:j[áa]\s+)?(?:est[áa]|estao|est[ãa]o|foi|fica(?:ram)?|ficou|fiz|tratei|resolvi|conclu[íi]|despachei)?\s*(tratad[oa]s?|feit[oa]s?|resolvid[oa]s?|conclu[íi]d[oa]s?|despachad[oa]s?|fechad[oa]s?)\b/i;
const DONE_STRICT_RE = /\b(j[áa]|est[áa]|est[ãa]o|foi|fiz|tratei|resolvi|conclu[íi]|despachei|fica|ficou)\b/i;
// "cancelada"/"desmarcada" NÃO é conclusão: isso é o caminho do cancelamento.
const CANCEL_RE = /\b(cancel\w*|desmarc\w*|anul\w*|adia\w*|remarc\w*)\b/i;

const SPLIT_RE = /\n+|;|\s+e\s+(?:tamb[ée]m\s+)?|\.\s+|,\s+(?=[ao]\s)/i;

const HINT_STOP = new Set([
  "a", "o", "as", "os", "de", "do", "da", "dos", "das", "um", "uma", "que",
  "ja", "foi", "esta", "estao", "sao", "com", "para", "por", "no", "na",
  "nos", "nas", "ao", "aos", "em", "meu", "minha", "e", "isso", "isto",
  "faz", "semana", "dias", "dia", "ontem", "hoje", "atualiza", "actualiza",
  "favor", "por favor", "tudo",
]);

export interface CompletionInstruction {
  /** frase original da instrução. */
  part: string;
  /** pista de assunto para procurar o seguimento ("estudo de mercado"). */
  subjectHint: string;
}

function hintFrom(part: string): string {
  const words = normalizeForMatch(part)
    .split(" ")
    .filter((w) => w.length >= 3 && !HINT_STOP.has(w) && !DONE_RE.test(w) && !DONE_STRICT_RE.test(w));
  return words.slice(0, 6).join(" ");
}

/**
 * Devolve as instruções de conclusão presentes na mensagem. Uma instrução só
 * conta quando nomeia um assunto: "está tratado" sozinho é ambíguo demais
 * para fechar seja o que for.
 */
export function detectCompletionInstructions(
  text: string | null | undefined,
): CompletionInstruction[] {
  const raw = String(text ?? "").trim();
  if (!raw) return [];
  const parts = raw
    .split(SPLIT_RE)
    .map((p) => p.replace(/^[\s,.-]+|[\s,.]+$/g, ""))
    .filter(Boolean);
  const out: CompletionInstruction[] = [];
  for (const part of parts) {
    if (!DONE_RE.test(part) || !DONE_STRICT_RE.test(part)) continue;
    if (CANCEL_RE.test(part)) continue;
    if (/\?\s*$/.test(part)) continue;
    const subjectHint = hintFrom(part);
    if (subjectHint.split(" ").filter(Boolean).length < 2) continue;
    out.push({ part, subjectHint });
  }
  return out.slice(0, 3);
}

/** A mensagem, tirando as instruções de conclusão já tratadas. */
export function remainingRequest(
  text: string | null | undefined,
  handled: CompletionInstruction[],
): string {
  let rest = String(text ?? "");
  for (const h of handled) rest = rest.split(h.part).join(" ");
  return rest.replace(/^[\s,.;-]+|[\s,.;-]+$/g, "").replace(/\s+/g, " ").trim();
}

/** A sobra ainda pede alguma coisa, ou é só cola ("Atualiza por favor.")? */
export function remainderNeedsWork(rest: string): boolean {
  const t = normalizeForMatch(rest);
  if (!t) return false;
  const words = t.split(" ").filter((w) => !HINT_STOP.has(w) && w.length >= 3);
  return words.length >= 2;
}

export interface CompletedItem {
  id?: string;
  title?: string | null;
}

/** "Marquei o estudo de mercado como concluído." — nunca um "Feito." mudo. */
export function formatCompletionReply(
  items: CompletedItem[],
  fallbackTopic?: string | null,
): string {
  if (!items.length) {
    const topic = String(fallbackTopic ?? "").trim();
    return topic
      ? `Sobre ${topic}: não encontrei nada por fechar — já não estava pendente.`
      : "Não encontrei nada por fechar.";
  }
  if (items.length === 1) {
    return `Marquei ${displayTitle(items[0]!.title)} como concluído.`;
  }
  const list = items.map((i, n) => `${n + 1}) ${displayTitle(i.title)}`).join(" ");
  return `Marquei como concluídos: ${list}`;
}

/** Pergunta sobre recorrência: fechar hoje não decide o futuro. */
export function recurrenceQuestion(routineTitle: string): string {
  return `Isto repete-se automaticamente (${displayTitle(routineTitle)}) — queres que continue a repetir?`;
}
