// Interpretação da resposta do consultor a uma pergunta de associação de
// pessoa ("qual deles é?"), venha ela do painel (botões) ou de texto no
// WhatsApp/Telegram. A escolha é determinística: a IA não decide aqui.

import { foldText } from "@/lib/search/normalize";
import { nameMatchQuality } from "./name-match";
import type { PersonCandidate } from "./resolve-person.server";

export type PersonChoice =
  | { kind: "candidate"; id: string; name: string }
  /** "cria contacto novo" */
  | { kind: "new" }
  /** "não é nenhum destes" */
  | { kind: "none" }
  /** "avança sem associar" */
  | { kind: "skip" }
  | { kind: "unknown" };

const NEW_RE = /\b(cria(r)?|novo|nova)\b.*\b(contacto|pessoa|ficha)\b|\bcontacto novo\b|\bpessoa nova\b/i;
const SKIP_RE = /\b(sem associar|sem contacto|sem pessoa|avan[cç]a|deixa assim|fica sem)\b/i;
const NONE_RE = /\b(nenhum|nenhuma|nao e nenhum|n[aã]o [ée] nenhum|outro|outra pessoa)\b/i;

/** Só dígitos, para comparar telefones escritos de formas diferentes. */
function digits(s: string | null | undefined): string {
  return String(s ?? "").replace(/\D/g, "").slice(-9);
}

export function matchPersonChoice(reply: string, candidates: PersonCandidate[]): PersonChoice {
  const raw = String(reply ?? "").trim();
  if (!raw) return { kind: "unknown" };
  const folded = foldText(raw);

  if (SKIP_RE.test(folded)) return { kind: "skip" };
  if (NEW_RE.test(folded)) return { kind: "new" };

  // Índice: "1", "o 2", "a segunda".
  const ordinals = ["primeir", "segund", "terceir", "quart"];
  let idx = -1;
  const num = folded.match(/(?:^|\D)([1-4])(?:\D|$)/);
  if (num) idx = Number(num[1]) - 1;
  if (idx < 0) idx = ordinals.findIndex((o) => folded.includes(o));
  if (idx >= 0 && candidates[idx]) {
    const c = candidates[idx]!;
    return { kind: "candidate", id: c.id, name: c.name };
  }

  // Telefone escrito na resposta.
  const d = digits(raw);
  if (d.length >= 9) {
    const byPhone = candidates.find((c) => digits(c.phone) === d);
    if (byPhone) return { kind: "candidate", id: byPhone.id, name: byPhone.name };
  }

  // Nome: preferimos a correspondência mais forte (nome completo antes de
  // primeiro nome), para "Manuel Silva" não cair no "Manuel".
  let best: { c: PersonCandidate; score: number } | null = null;
  for (const c of candidates) {
    const q = nameMatchQuality(c.name, raw);
    const score = q === "exact" ? 3 : q === "word" ? 2 : folded.includes(foldText(c.name)) ? 1 : 0;
    if (score > 0 && (!best || score > best.score)) best = { c, score };
  }
  if (best) return { kind: "candidate", id: best.c.id, name: best.c.name };

  if (NONE_RE.test(folded)) return { kind: "none" };
  return { kind: "unknown" };
}

/** Confirmação explícita de a quem ficou ligado o registo. */
export function personLinkedFeedback(
  name: string,
  what: "compromisso" | "seguimento" | "imóvel" = "seguimento",
): string {
  return `Feito — ${what} ligado ao contacto ${name}. Fica no histórico dele.`;
}
