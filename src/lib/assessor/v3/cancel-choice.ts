// Escolha e confirmação de desmarcações múltiplas — módulo puro (sem I/O).
//
// Caso real (13/08): o Afonso perguntou qual de dois compromissos desmarcar,
// a consultora respondeu "As duas" e só um foi cancelado — a confirmação
// final mencionava um único item. Quando o pedido cobre vários itens, a
// resposta TEM de listar cada um com o respectivo resultado.

import { displayTitle } from "../titles";
import { normalizeForMatch, matchByHint, type CancellableItem } from "./cancel-agenda";

export type CancelCandidate = CancellableItem;

// normalizeForMatch já tira acentos e pontuação.
const ALL_RE =
  /^(sim\s+)?(as|os|a|o)?\s*(duas|dois|tres|ambas|ambos|todas|todos|tudo)(\s+(as\s+)?(duas|coisas|opcoes|marcacoes))?$/;

/** "As duas", "ambos", "todas", "sim, as duas" — o consultor quer o conjunto. */
export function isAllChoice(text: string | null | undefined): boolean {
  return ALL_RE.test(normalizeForMatch(String(text ?? "")));
}

const ORDINALS: Array<{ re: RegExp; index: number }> = [
  { re: /\b(primeir[ao]|1\.?[ºªo]?|n[úu]mero\s+1)\b/i, index: 0 },
  { re: /\b(segund[ao]|2\.?[ºªo]?|n[úu]mero\s+2)\b/i, index: 1 },
  { re: /\b(terceir[ao]|3\.?[ºªo]?|n[úu]mero\s+3)\b/i, index: 2 },
];

function byTime(cands: CancelCandidate[], text: string): CancelCandidate[] {
  const m = String(text).match(/\b(\d{1,2})\s*(?:h|:)\s*(\d{2})?\b/i);
  if (!m) return [];
  const hh = String(m[1]).padStart(2, "0");
  const mm = m[2] ?? "00";
  return cands.filter((c) => String(c.due_time ?? "").slice(0, 5) === `${hh}:${mm}`);
}

/**
 * Traduz a resposta do consultor à pergunta de desambiguação numa lista de
 * itens. Devolve [] quando a resposta não resolve nada (o motor volta a
 * perguntar em vez de adivinhar).
 */
export function pickCancelChoice(
  candidates: CancelCandidate[],
  text: string | null | undefined,
): CancelCandidate[] {
  const raw = String(text ?? "").trim();
  if (!raw || !candidates.length) return [];
  if (isAllChoice(raw)) return [...candidates];
  for (const o of ORDINALS) {
    if (o.re.test(raw) && candidates[o.index]) return [candidates[o.index]!];
  }
  const timed = byTime(candidates, raw);
  if (timed.length === 1) return timed;
  const hinted = matchByHint(candidates, raw);
  if (hinted.length === 1) return hinted;
  return [];
}

export interface CancelOutcome {
  item: CancelCandidate;
  ok: boolean;
}

function label(item: CancelCandidate): string {
  const t = item.due_time
    ? String(item.due_time).slice(0, 5).replace(":", "h").replace(/h00$/, "h")
    : "";
  const title = displayTitle(item.title);
  return t ? `${title} (${t})` : title;
}

/**
 * Confirmação de desmarcação. Com mais do que um item lista SEMPRE cada um,
 * numerado, com o resultado — nunca "feito" a falar só de parte do pedido.
 */
export function formatMultiCancelReply(outcomes: CancelOutcome[]): string {
  const done = outcomes.filter((o) => o.ok);
  const failed = outcomes.filter((o) => !o.ok);
  if (!outcomes.length) return "Não desmarquei nada.";
  if (outcomes.length === 1) {
    const only = outcomes[0]!;
    return only.ok
      ? `Desmarquei ${label(only.item)}. Não reagendei nada.`
      : `Não consegui desmarcar ${label(only.item)}. Podes tentar outra vez?`;
  }
  const parts: string[] = [];
  if (done.length) {
    const list = done.map((o, i) => `${i + 1}) ${label(o.item)}.`).join(" ");
    parts.push(`Desmarquei: ${list}`);
    parts.push(done.length === 2 ? "Não reagendei nada em nenhum dos dois." : "Não reagendei nada.");
  }
  if (failed.length) {
    const list = failed.map((o) => label(o.item)).join("; ");
    parts.push(`Não consegui desmarcar: ${list}.`);
  }
  return parts.join(" ");
}

export { normalizeForMatch };

// ── Rajadas ("burst") ────────────────────────────────────────────────────
//
// Caso real (24/08): à pergunta "qual delas queres desmarcar?" a consultora
// enviou três mensagens em ~2 segundos — "15h00 — Lembrete: Marcação das
// unhas", "10h00 — Marcação das unhas" e "Ambas". Lida como um bloco único,
// a leitura antiga só apanhava a primeira hora e respondia por um item, o que
// contradizia a mensagem seguinte. Aqui cada linha da rajada é lida por si e
// o resultado é a união (com "ambas" a valer pelo conjunto todo).

/** Separa o texto da rajada em respostas individuais (linhas / frases curtas). */
export function splitChoiceSegments(text: string | null | undefined): string[] {
  return String(text ?? "")
    .split(/[\n\r]+|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Lê a escolha em várias mensagens/linhas: união dos itens indicados em cada
 * uma. Uma só linha comporta-se exactamente como `pickCancelChoice`.
 */
export function pickCancelChoiceMulti(
  candidates: CancelCandidate[],
  text: string | null | undefined,
): CancelCandidate[] {
  if (!candidates.length) return [];
  const segments = splitChoiceSegments(text);
  if (segments.length <= 1) return pickCancelChoice(candidates, text);
  const picked = new Map<string, CancelCandidate>();
  for (const seg of segments) {
    if (isAllChoice(seg)) return [...candidates];
    for (const item of pickCancelChoice(candidates, seg)) {
      picked.set(String(item.id), item);
    }
  }
  if (picked.size) {
    // Mantém a ordem original dos candidatos na confirmação.
    return candidates.filter((c) => picked.has(String(c.id)));
  }
  return pickCancelChoice(candidates, text);
}
