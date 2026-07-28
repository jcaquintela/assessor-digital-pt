// Assessor v2 — Lovable AI Gateway (chat completions com tool-calling).
//
// Camada única de contacto com a IA. NÃO transporta lógica de negócio: só
// serializa, chama o gateway e devolve a mensagem do assistente (com
// eventuais tool_calls). Idempotente do ponto de vista da BD: nunca escreve.
//
// O gateway é OpenAI-compatible; tool-calling segue o shape function-calling
// da OpenAI. Suporta Gemini (google/*) via OpenRouter, que aceita o mesmo
// formato.

export const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
export const V2_MODEL_DEFAULT = "google/gemini-3.6-flash";

export interface GatewayToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface GatewayMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: GatewayToolCall[];
}

export interface GatewayToolSpec {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface GatewayUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface GatewayCallResult {
  ok: boolean;
  message?: GatewayMessage;
  finishReason?: string | null;
  usage: GatewayUsage;
  latencyMs: number;
  error?: string;
  httpStatus?: number;
}

export interface GatewayCallInput {
  model?: string;
  messages: GatewayMessage[];
  tools?: GatewayToolSpec[];
  toolChoice?: "auto" | "none" | { type: "function"; function: { name: string } };
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: "json_object" };
}

export async function callGateway(input: GatewayCallInput): Promise<GatewayCallResult> {
  const started = Date.now();
  const model = input.model ?? V2_MODEL_DEFAULT;
  const empty: GatewayUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return { ok: false, usage: empty, latencyMs: 0, error: "LOVABLE_API_KEY missing" };

  const body: Record<string, unknown> = {
    model,
    messages: input.messages,
    temperature: input.temperature ?? 0.2,
    max_tokens: input.maxTokens ?? 800,
  };
  if (input.tools?.length) {
    body.tools = input.tools;
    body.tool_choice = input.toolChoice ?? "auto";
  }
  if (input.responseFormat) body.response_format = input.responseFormat;

  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify(body),
    });
    const latencyMs = Date.now() - started;
    const payload: any = await res.json().catch(() => ({}));
    const usage: GatewayUsage = {
      inputTokens: Number(payload?.usage?.prompt_tokens ?? 0),
      outputTokens: Number(payload?.usage?.completion_tokens ?? 0),
      totalTokens: Number(payload?.usage?.total_tokens ?? 0),
    };
    if (!res.ok) {
      return {
        ok: false,
        usage,
        latencyMs,
        httpStatus: res.status,
        error: payload?.error?.message || `HTTP ${res.status}`,
      };
    }
    const choice = payload?.choices?.[0];
    const message = choice?.message as GatewayMessage | undefined;
    if (!message) {
      return { ok: false, usage, latencyMs, error: "empty gateway message" };
    }
    return {
      ok: true,
      message,
      finishReason: choice?.finish_reason ?? null,
      usage,
      latencyMs,
    };
  } catch (err) {
    return {
      ok: false,
      usage: empty,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// Helper que serializa um resultado de ferramenta para uma `role: "tool"`
// mensagem compatível com o gateway.
export function toolResultMessage(
  toolCallId: string,
  toolName: string,
  result: unknown,
): GatewayMessage {
  const payload = typeof result === "string" ? result : JSON.stringify(result);
  return {
    role: "tool",
    tool_call_id: toolCallId,
    name: toolName,
    content: payload,
  };
}
