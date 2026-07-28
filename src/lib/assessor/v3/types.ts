// Reasoning Engine v3 — tipos partilhados pelas 5 fases.
//
// Contrato interno: OBSERVE devolve Observations; THINK devolve Hypotheses +
// pedidos de pesquisa; SEARCH devolve SearchResults; DECIDE devolve Decision;
// ACT devolve o resultado das tool_calls + memory writes aplicadas.

export type ObservationType =
  | "phone"
  | "email"
  | "address"
  | "amount"
  | "date"
  | "time"
  | "name"
  | "typology"
  | "document_hint"
  | "verb"
  | "reference" // "o Paulo", "aquele imóvel", pronomes
  | "short_answer" // sim / não / ok
  | "greeting"
  | "tone" // "difícil", "frustrado"
  | "url";

export interface Observation {
  type: ObservationType;
  value: string;
  raw?: string;
}

export type MemoryValue = "none" | "temporary" | "permanent" | "strategic" | "emotional";

export interface Hypothesis {
  label: string;
  confidence: number; // 0..1
  reasoning?: string;
}

export type SearchName =
  | "people_by_phone"
  | "people_by_name"
  | "properties_by_location"
  | "properties_by_title"
  | "agenda_today"
  | "agenda_tomorrow"
  | "agenda_week"
  | "conversation_state"
  | "pending_action";

export interface SearchResults {
  people?: unknown[];
  properties?: unknown[];
  agenda?: unknown;
  conversation_state?: unknown | null;
  pending_action?: unknown | null;
}

export type DecisionAction = "act" | "ask" | "search_more" | "acknowledge" | "do_nothing";

export interface DecisionToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export type MemoryScope = "immediate" | "operational" | "strategic" | "permanent";

export interface MemoryWrite {
  scope: MemoryScope;
  key: string;
  value: unknown;
  // opcional: pistas para o memory writer
  target_person_id?: string | null;
  target_property_id?: string | null;
}

export interface Decision {
  confidence: number;
  action: DecisionAction;
  tool_calls: DecisionToolCall[];
  memory_writes: MemoryWrite[];
  natural_reply: string;
  needs_confirmation?: boolean;
}

export interface ThinkOutput {
  observations: Observation[];
  hypotheses: Hypothesis[];
  memory_value: MemoryValue;
  recommended_searches: SearchName[];
}

export interface ReasoningTrace {
  observations: Observation[];
  hypotheses: Hypothesis[];
  searches: SearchResults;
  decision: Decision;
  toolResults: Array<{ name: string; ok: boolean; error?: string; data?: unknown; latencyMs: number }>;
  memoryWrites: MemoryWrite[];
  reply: string;
  thinkLatencyMs: number;
  decideLatencyMs: number;
  totalLatencyMs: number;
  inputTokens: number;
  outputTokens: number;
  success: boolean;
  error?: string;
}