// Auditoria do modo treino: sempre que o guard suprime ferramentas ou escritas,
// fica registo do que ia acontecer, porquê foi bloqueado e da mensagem original
// do consultor. Serve para revisões do incidente de 24/08 e para transformar
// casos reais em novos golden tests.

/** Limite defensivo: a mensagem vai para os logs, não precisa de ser inteira. */
const MAX_MESSAGE = 500;

export type SparringSuppressionReason =
  | "sparring_active"
  | "sparring_starting"
  | "sparring_ending"
  | "sparring_paused";

export type SparringSuppressionInput = {
  userId: string;
  channel: string;
  /** Mensagem original do consultor, tal como chegou. */
  message: string;
  /** Ferramentas que o modelo queria executar e foram descartadas. */
  toolCalls?: Array<{ name?: string; args?: unknown }> | null;
  /** Nº de escritas de memória descartadas. */
  memoryWrites?: number;
  action?: string | null;
  reason: SparringSuppressionReason;
  turns?: number;
  route?: string;
};

export type SparringSuppressionLog = {
  admin_user_id: null;
  action: "sparring_blocked_tools";
  target_user_id: string;
  resource_type: "conversation";
  resource_id: string;
  reason: string;
  metadata: Record<string, unknown>;
};

const REASON_PT: Record<SparringSuppressionReason, string> = {
  sparring_active: "Modo treino activo",
  sparring_starting: "Modo treino a começar neste turno",
  sparring_ending: "Modo treino a terminar neste turno",
  sparring_paused: "Modo treino em pausa",
};

/**
 * Constrói a linha de auditoria. Devolve null quando não houve nada suprimido
 * — só registamos bloqueios reais, para os logs continuarem legíveis.
 */
export function buildSparringSuppressionLog(
  input: SparringSuppressionInput,
): SparringSuppressionLog | null {
  const tools = (input.toolCalls ?? [])
    .map((t) => String(t?.name ?? "").trim())
    .filter(Boolean);
  const memoryWrites = Math.max(0, input.memoryWrites ?? 0);
  if (tools.length === 0 && memoryWrites === 0) return null;

  const message = String(input.message ?? "").trim().slice(0, MAX_MESSAGE);

  return {
    admin_user_id: null,
    action: "sparring_blocked_tools",
    target_user_id: input.userId,
    resource_type: "conversation",
    resource_id: input.channel,
    reason: `${REASON_PT[input.reason]}: ${
      tools.length ? `ferramentas bloqueadas (${tools.join(", ")})` : "escritas bloqueadas"
    }.`,
    metadata: {
      source: "reasoning-engine-v3",
      route: input.route ?? "v3",
      guard: "sparring",
      guard_reason: input.reason,
      blocked_tools: tools,
      blocked_tool_calls: (input.toolCalls ?? []).map((t) => ({
        name: String(t?.name ?? ""),
        args: t?.args ?? null,
      })),
      blocked_memory_writes: memoryWrites,
      decided_action: input.action ?? null,
      sparring_turns: input.turns ?? null,
      channel: input.channel,
      original_message: message,
      original_message_truncated: String(input.message ?? "").trim().length > MAX_MESSAGE,
    },
  };
}
