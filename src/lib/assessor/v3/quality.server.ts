// Assistant Quality Score (AQS) — 4 sinais 0/1 por turno v3.
// Aplica-se depois de OBSERVE→THINK→SEARCH→DECIDE→ACT terminarem.

import { hasHumanTone } from "../culture/sanitize";
import type { Decision } from "./types";
import type { ToolExecResult } from "./act.server";

// Palavras de correção explícita (mesma família usada em corrections.server.ts).
const CORRECTION_WORDS_RE =
  /(?:^|\W)(n[ãa]o\s+[eé]|n[ãa]o\s+era|errado|erraste|quis\s+dizer|queria\s+dizer|afinal|ali[áa]s|corrige|troca|substitui|esse\s+n[ãa]o|essa\s+n[ãa]o)(?:$|\W)/i;

const STOP = new Set([
  "de","da","do","das","dos","a","o","as","os","um","uma","e","que","para","por","com","no","na",
  "nos","nas","em","ao","à","às","aos","se","é","ou","the","of",
]);

function tokens(text: string): Set<string> {
  return new Set(
    String(text ?? "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOP.has(w)),
  );
}

/** Semelhança de Jaccard entre duas mensagens (0–1). */
export function messageSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / (ta.size + tb.size - inter);
}

export interface ReformulationInput {
  /** Mensagem actual do consultor. */
  message: string;
  /** Mensagem ANTERIOR do consultor (nunca a actual). */
  previousUserMessage: string | null;
  previousUserAt: Date | null;
  /** Última resposta do Assessor antes desta mensagem. */
  lastAssistantReply?: string | null;
  now?: Date;
}

/**
 * Reformulação genuína = o consultor teve de reescrever o mesmo pedido.
 * NÃO conta: responder a uma pergunta do Assessor, nem continuar a conversa
 * com outro assunto. Só o tempo (< 60 s) é sinal fraco demais.
 */
export function detectReformulation(input: ReformulationInput): boolean {
  const { message, previousUserMessage, previousUserAt } = input;
  if (!previousUserMessage || !previousUserAt) return false;
  const now = input.now ?? new Date();
  const dt = now.getTime() - previousUserAt.getTime();
  if (dt < 0 || dt > 10 * 60_000) return false;

  const sim = messageSimilarity(message, previousUserMessage);

  // Repetição quase idêntica: repetir o mesmo texto nunca é "responder".
  if (sim >= 0.9) return true;

  // O Assessor tinha feito uma pergunta → responder é o fluxo esperado.
  const assistantAsked = /\?\s*$/.test(String(input.lastAssistantReply ?? "").trim());
  if (assistantAsked) return false;

  if (dt > 60_000) return false;

  // Sem pergunta prévia e < 60 s: só conta se for o mesmo assunto
  // ou se houver correção explícita.
  return sim >= 0.6 || CORRECTION_WORDS_RE.test(message);
}

export interface QualitySignals {
  understood_first_try: boolean | null;
  reformulated: boolean | null;
  executed_successfully: boolean | null;
  human_tone: boolean | null;
  score: number | null;
  notes?: string;
}

// `previousUserTurnAt` = timestamp da mensagem imediatamente anterior do
// consultor no mesmo canal (undefined se não houver).
export function computeQualitySignals(input: {
  decision: Decision;
  toolResults: ToolExecResult[];
  reply: string;
  previousUserTurnAt?: Date | null;
  /** Mensagem actual e anterior do consultor + última resposta do Assessor. */
  message?: string;
  previousUserMessage?: string | null;
  lastAssistantReply?: string | null;
  now?: Date;
}): QualitySignals {
  const now = input.now ?? new Date();
  const { decision, toolResults, reply } = input;

  // Compreendeu à primeira: decisão diferente de "ask" no primeiro turno.
  // Se a última mensagem do consultor foi há < 60s, este turno é
  // provavelmente uma reformulação — o "primeiro turno" foi antes.
  const understood_first_try = decision.action === "ask" ? false : true;

  const reformulated = detectReformulation({
    message: input.message ?? "",
    previousUserMessage: input.previousUserMessage ?? null,
    previousUserAt: input.previousUserTurnAt ?? null,
    lastAssistantReply: input.lastAssistantReply ?? null,
    now,
  });

  let executed_successfully: boolean | null;
  if (decision.action === "act") {
    executed_successfully = toolResults.length > 0 && toolResults.every((t) => t.ok);
  } else if (decision.action === "acknowledge" || decision.action === "do_nothing" || decision.action === "ask") {
    executed_successfully = true; // N/A — não devia executar nada.
  } else {
    executed_successfully = null;
  }

  const human_tone = hasHumanTone(reply);

  const signals = [understood_first_try, reformulated === true ? false : true, executed_successfully, human_tone]
    .filter((v): v is boolean => typeof v === "boolean");
  const score = signals.length
    ? Number((signals.filter(Boolean).length / signals.length).toFixed(3))
    : null;

  return {
    understood_first_try,
    reformulated,
    executed_successfully,
    human_tone,
    score,
  };
}

export async function persistQualityScore(
  supabase: any,
  input: {
    userId: string;
    channel: string;
    traceId: string | null;
    signals: QualitySignals;
  },
): Promise<void> {
  try {
    await supabase.from("assessor_quality_scores").insert({
      user_id: input.userId,
      channel: input.channel,
      trace_id: input.traceId,
      understood_first_try: input.signals.understood_first_try,
      reformulated: input.signals.reformulated,
      executed_successfully: input.signals.executed_successfully,
      human_tone: input.signals.human_tone,
      score: input.signals.score,
      notes: input.signals.notes ?? null,
    } as never);
  } catch { /* noop */ }
}