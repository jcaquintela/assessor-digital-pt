// Pedidos compostos — módulo puro (sem I/O).
//
// Caso real (13/08): a mensagem trazia duas instruções ("o estudo de mercado
// já está tratado" + "a visita das 18h foi cancelada"). O Afonso resolveu a
// parte ambígua e ficou calado sobre a outra. Nenhuma parte de um pedido
// pode ficar sem resposta — mesmo quando não exigiu acção nenhuma.

import { normalizeForMatch } from "./cancel-agenda";

const ACTION_RE =
  /\b(trat(?:ado|ada|ar|a)|cancel\w*|desmarc\w*|marca\w*|agenda\w*|adia\w*|liga\w*|envia\w*|guarda\w*|arquiva\w*|a?ctualiz\w*|resolvid\w*|conclui\w*|feit[ao]|fechad[ao]|paga\w*|remarca\w*)\b/i;

const SPLIT_RE = /\n+|;|\s+e\s+(?:tamb[ée]m\s+)?|\.\s+/i;

const STOP = new Set([
  "a", "o", "as", "os", "de", "do", "da", "dos", "das", "um", "uma", "que",
  "ja", "foi", "esta", "estao", "sao", "com", "para", "por", "no", "na",
  "nos", "nas", "ao", "aos", "em", "meu", "minha", "e",
]);

/** Divide a mensagem em instruções distintas (só as que pedem acção). */
export function splitRequestParts(text: string | null | undefined): string[] {
  const raw = String(text ?? "").trim();
  if (!raw) return [];
  const parts = raw
    .split(SPLIT_RE)
    .map((p) => p.replace(/^[\s,.-]+|[\s,.]+$/g, ""))
    .filter((p) => p.length >= 6 && ACTION_RE.test(p));
  return parts.length >= 2 ? parts : [];
}

/** Nome curto do assunto da instrução ("o estudo de mercado já está tratado" → "estudo de mercado"). */
export function topicLabel(part: string): string {
  let t = String(part ?? "").trim();
  t = t.replace(/^(?:e\s+)?(?:o|a|os|as)\s+/i, "");
  t = t.split(/\s+(?:j[áa]|foi|est[áa]|ficou|fica|est[ãa]o|que)\s+/i)[0] ?? t;
  t = t.replace(/[\s,.]+$/g, "");
  const words = t.split(/\s+/).slice(0, 6);
  return words.join(" ");
}

function significantWords(part: string): string[] {
  return normalizeForMatch(part)
    .split(" ")
    .filter((w) => w.length >= 4 && !STOP.has(w) && !ACTION_RE.test(w));
}

/** A resposta já fala desta instrução? */
export function isPartCovered(reply: string, part: string): boolean {
  const words = significantWords(part);
  if (!words.length) return true;
  const hay = normalizeForMatch(reply);
  const hits = words.filter((w) => hay.includes(w)).length;
  return hits / words.length >= 0.5;
}

/** Frase explícita para a parte do pedido que não exigiu acção nenhuma. */
export function noActionLine(part: string): string {
  const topic = topicLabel(part);
  return `Quanto a ${topic}: não encontrei nada pendente para tratar.`;
}

/**
 * Garante que a resposta final fala de TODAS as partes do pedido original.
 * Acrescenta uma linha explícita por cada parte que ficou sem resposta.
 */
export function ensureAllPartsAnswered(
  reply: string,
  originalRequest: string | null | undefined,
): string {
  const parts = splitRequestParts(originalRequest);
  if (!parts.length) return reply;
  const missing = parts.filter((p) => !isPartCovered(reply, p));
  if (!missing.length) return reply;
  const lines = missing.slice(0, 2).map(noActionLine);
  return [reply.trim(), ...lines].join(" ").trim();
}
