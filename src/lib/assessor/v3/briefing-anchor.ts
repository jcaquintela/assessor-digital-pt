// Âncora de confirmações elípticas ao item do último briefing.
//
// Casos reais (Iolanda, 21 e 22/08): o "Bom dia" mostrou UM item
// ("Lembrete: Marcação das unhas") e a resposta foi elíptica — "Já está
// concluída, já te tinha avisado", "Podes dar como concluída". O extractor
// de assunto agarrou cola gramatical da frase ("tinha avisado", "podes dar
// como") e o Afonso respondeu "não encontrei nada por fechar".
//
// Regra: quando a frase confirma conclusão mas não nomeia assunto, e a
// última mensagem do Afonso foi um briefing com EXACTAMENTE UM item, esse
// item é o assunto. Com zero ou vários itens não se adivinha nada.
//
// Módulo puro — quem chama é que lê a base de dados.

import { normalizeForMatch } from "./cancel-agenda";

/** Títulos dos itens listados num briefing ("- Lembrete: Marcação das unhas"). */
export function parseBriefingItems(content: string | null | undefined): string[] {
  const lines = String(content ?? "").split(/\n+/);
  const out: string[] = [];
  for (const line of lines) {
    const m = line.match(/^\s*(?:[-–•*]|\d+[).])\s+(.{3,160})$/);
    if (!m) continue;
    const title = m[1]!.replace(/\s+/g, " ").trim().replace(/[.;]$/, "");
    if (title) out.push(title);
  }
  return out;
}

/** "Lembrete: Marcação das unhas" → pista de assunto pesquisável. */
export function hintFromBriefingItem(title: string): string {
  const clean = String(title ?? "")
    .replace(/^\s*(lembrete|seguimento|tarefa|nota)\s*:\s*/i, "")
    .replace(/\s+[—–-]\s+.*$/, "")
    .split(/\s+\(/)[0]!;
  const words = normalizeForMatch(clean).split(" ").filter((w) => w.length >= 3);
  return words.slice(0, 6).join(" ");
}

// "já está concluída", "podes dar como concluída", "dá como tratada",
// "está feito", "já tratei disso".
const DONE_MARK_RE =
  /\b(conclui\w*|tratad\w*|feit[oa]s?|resolvid\w*|despachad\w*|fechad\w*|tratei|resolvi|fiz)\b/;
const CANCEL_RE = /\b(cancel\w*|desmarc\w*|anul\w*|adia\w*|remarc\w*)\b/;
const FUTURE_RE = /\b(amanha|logo|depois|preciso|tenho de|tenho que|quero|falta|faltam|vou|vamos|quando)\b/;

/**
 * A frase confirma uma conclusão sem nomear o assunto? Curta, sem pergunta,
 * sem cancelamento e sem plano — só a marca de "está feito".
 */
export function isEllipticCompletion(text: string | null | undefined): boolean {
  const raw = String(text ?? "").trim();
  if (!raw || raw.length > 160) return false;
  if (/\?\s*$/.test(raw)) return false;
  const norm = normalizeForMatch(raw);
  if (!DONE_MARK_RE.test(norm)) return false;
  if (CANCEL_RE.test(norm) || FUTURE_RE.test(norm)) return false;
  return true;
}

export interface BriefingAnchor {
  title: string;
  subjectHint: string;
}

/**
 * Assunto candidato vindo do último briefing, quando ele mostrou um único
 * item. Devolve null em qualquer outra situação — nunca se fecha às cegas.
 */
export function anchorFromBriefing(
  lastAssistant: { content?: string | null; message_type?: string | null } | null | undefined,
): BriefingAnchor | null {
  const type = String(lastAssistant?.message_type ?? "");
  if (!/briefing|proactive|morning|digest/i.test(type)) return null;
  const items = parseBriefingItems(lastAssistant?.content);
  if (items.length !== 1) return null;
  const subjectHint = hintFromBriefingItem(items[0]!);
  if (!subjectHint) return null;
  return { title: items[0]!, subjectHint };
}
