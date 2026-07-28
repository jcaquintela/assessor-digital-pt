// Assessor v2 — loop de interpretação com tool-calling.
//
// Recebe o histórico + system prompt, chama o gateway. Se a resposta trouxer
// tool_calls, executa cada ferramenta em série, adiciona o resultado como
// `role: "tool"` e repete. Termina quando a IA devolve texto ou ao atingir
// `maxIterations` (guarda contra loops infinitos).

import {
  callGateway,
  toolResultMessage,
  V2_MODEL_DEFAULT,
  type GatewayMessage,
  type GatewayToolSpec,
  type GatewayUsage,
} from "./gateway.server";
import { TOOL_SPECS } from "./tools";
import { dispatchToolCall, type DomainContext, type DomainResult } from "./domain.server";

export interface ToolCallRecord {
  name: string;
  args: string;
  result: DomainResult;
  latencyMs: number;
}

export interface InterpretResult {
  reply: string;
  toolCalls: ToolCallRecord[];
  usage: GatewayUsage;
  totalLatencyMs: number;
  iterations: number;
  finishReason: string | null;
  error?: string;
}

export interface InterpretInput {
  domainCtx: DomainContext;
  systemPrompt: string;
  history: GatewayMessage[];
  model?: string;
  tools?: GatewayToolSpec[];
  maxIterations?: number;
}

const FALLBACK_REPLY = "Desculpa, não consegui processar isto agora. Tenta reformular?";

export async function runInterpretationLoop(input: InterpretInput): Promise<InterpretResult> {
  const started = Date.now();
  const model = input.model ?? V2_MODEL_DEFAULT;
  const tools = input.tools ?? TOOL_SPECS;
  const maxIterations = input.maxIterations ?? 4;

  const messages: GatewayMessage[] = [
    { role: "system", content: input.systemPrompt },
    ...input.history,
  ];
  const usage: GatewayUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  const toolCalls: ToolCallRecord[] = [];
  let finishReason: string | null = null;
  let lastError: string | undefined;

  for (let iter = 1; iter <= maxIterations; iter++) {
    const call = await callGateway({ model, messages, tools });
    usage.inputTokens += call.usage.inputTokens;
    usage.outputTokens += call.usage.outputTokens;
    usage.totalTokens += call.usage.totalTokens;
    finishReason = call.finishReason ?? null;

    if (!call.ok || !call.message) {
      lastError = call.error ?? "gateway_failed";
      break;
    }
    const asst = call.message;
    messages.push(asst);

    const callsList = asst.tool_calls ?? [];
    if (!callsList.length) {
      // Resposta final em texto.
      return {
        reply: (asst.content ?? "").trim() || FALLBACK_REPLY,
        toolCalls,
        usage,
        totalLatencyMs: Date.now() - started,
        iterations: iter,
        finishReason,
      };
    }

    for (const tc of callsList) {
      const t0 = Date.now();
      const result = await dispatchToolCall(input.domainCtx, tc.function.name, tc.function.arguments);
      const latencyMs = Date.now() - t0;
      toolCalls.push({ name: tc.function.name, args: tc.function.arguments, result, latencyMs });
      messages.push(toolResultMessage(tc.id, tc.function.name, result));
    }
    // continua o loop para a IA sintetizar a resposta final
  }

  return {
    reply: FALLBACK_REPLY,
    toolCalls,
    usage,
    totalLatencyMs: Date.now() - started,
    iterations: maxIterations,
    finishReason,
    error: lastError ?? "max_iterations_reached",
  };
}
