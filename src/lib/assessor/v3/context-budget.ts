// Orçamento de contexto do Reasoning Engine v3.
//
// Porquê: as falhas de motor com recurso (fallback) desde 1/08 acontecem
// sempre com 6.500–7.900 tokens de entrada e latências de 9–24s. O histórico
// já estava limitado a 6 mensagens, por isso o peso NÃO vem do número de
// turnos: vem (a) do prompt de sistema estático do DECIDE (~5.3k tokens) e
// (b) da carga dinâmica — transcrições de áudio longas reenviadas no
// histórico e listas de pesquisa inteiras.
//
// Este módulo controla apenas a parte dinâmica (a única reversível sem tocar
// na cultura do Assessor). Regras invioláveis:
//   - `conversation_state` e `pending_action` NUNCA são cortados: são a
//     memória estruturada que permite recuperar "aquele imóvel que falámos
//     há bocado" sem reenviar texto bruto.
//   - o turno mais recente do histórico nunca é descartado.

export const CHARS_PER_TOKEN = 3.6;

/** Orçamento total para a carga dinâmica (histórico + pesquisas). */
export const DYNAMIC_BUDGET_TOKENS = 1200;
/** Orçamento só para o histórico recente. */
export const HISTORY_BUDGET_TOKENS = 700;
/** Nenhuma mensagem isolada ocupa mais do que isto no histórico. */
export const MAX_MESSAGE_CHARS = 600;
/** Máximo de itens por lista de pesquisa. */
export const MAX_SEARCH_ITEMS = 5;
/** Máximo de caracteres por campo de texto dentro de um resultado. */
export const MAX_FIELD_CHARS = 240;

export function estimateTokens(input: unknown): number {
  const s = typeof input === "string" ? input : JSON.stringify(input ?? "");
  return Math.ceil((s?.length ?? 0) / CHARS_PER_TOKEN);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max).trimEnd()}… [truncado]`;
}

/**
 * Corta o histórico recente para caber no orçamento: primeiro encurta
 * mensagens muito longas (transcrições de áudio, extrações de documentos),
 * depois descarta as linhas mais antigas. A última linha fica sempre.
 */
export function budgetHistoryPreview(
  preview: string | null | undefined,
  budgetTokens: number = HISTORY_BUDGET_TOKENS,
): string {
  const raw = String(preview ?? "").trim();
  if (!raw) return "";
  const lines = raw.split("\n").map((l) => truncate(l, MAX_MESSAGE_CHARS));
  while (lines.length > 1 && estimateTokens(lines.join("\n")) > budgetTokens) {
    lines.shift();
  }
  // Se ainda assim a última linha for enorme, corta-a com força.
  if (estimateTokens(lines.join("\n")) > budgetTokens) {
    const max = Math.floor(budgetTokens * CHARS_PER_TOKEN);
    return truncate(lines.join("\n"), max);
  }
  return lines.join("\n");
}

function compactValue(v: unknown, depth = 0): unknown {
  if (v === null || v === undefined) return v;
  if (typeof v === "string") return truncate(v, MAX_FIELD_CHARS);
  if (Array.isArray(v)) {
    if (depth > 2) return `[${v.length} itens]`;
    return v.slice(0, MAX_SEARCH_ITEMS).map((x) => compactValue(x, depth + 1));
  }
  if (typeof v === "object") {
    if (depth > 3) return "[objeto]";
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (val === null || val === undefined || val === "") continue;
      out[k] = compactValue(val, depth + 1);
    }
    return out;
  }
  return v;
}

/**
 * Comprime os resultados de pesquisa mantendo intactas as chaves de memória
 * estruturada (`conversation_state`, `pending_action`).
 */
export function budgetSearchResults<T extends Record<string, unknown>>(searches: T | null | undefined): T {
  if (!searches || typeof searches !== "object") return (searches ?? {}) as T;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(searches)) {
    if (val === null || val === undefined) continue;
    if (key === "conversation_state" || key === "pending_action") {
      out[key] = val; // memória estruturada — nunca comprimida
      continue;
    }
    if (Array.isArray(val) && val.length === 0) continue;
    out[key] = compactValue(val);
  }
  return out as T;
}

export interface BudgetedContext<S> {
  historyPreview: string;
  searches: S;
  estimatedTokens: number;
}

/** Aplica o orçamento completo à carga dinâmica enviada ao modelo. */
export function budgetDynamicContext<S extends Record<string, unknown>>(input: {
  historyPreview?: string | null;
  searches?: S | null;
  budgetTokens?: number;
}): BudgetedContext<S> {
  const budget = input.budgetTokens ?? DYNAMIC_BUDGET_TOKENS;
  let searches = budgetSearchResults(input.searches);
  let history = budgetHistoryPreview(input.historyPreview, HISTORY_BUDGET_TOKENS);

  // Se ainda excede o orçamento conjunto, encolhe primeiro o histórico
  // (recuperável via conversation_state) e só depois volta a cortar.
  let total = estimateTokens(history) + estimateTokens(searches);
  if (total > budget) {
    const room = Math.max(200, budget - estimateTokens(searches));
    history = budgetHistoryPreview(history, room);
    total = estimateTokens(history) + estimateTokens(searches);
  }
  return { historyPreview: history, searches: searches as S, estimatedTokens: total };
}
