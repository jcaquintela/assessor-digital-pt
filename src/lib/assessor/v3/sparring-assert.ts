// Assert defensivo do modo treino (lógica pura).
//
// A fonte única de verdade do estado de treino é `readSparringState` no
// arranque de `runReasoningEngineInner`: se o turno for treino, o motor
// devolve logo ali e nada mais corre. Por isso, chegar ao meio do turno com
// `active_topic = "sparring"` é uma anomalia (ex.: `stopSparring` falhou em
// silêncio, ou alguém escreveu o estado a meio do turno).
//
// Aqui não há máquina de estados nenhuma: só se detecta a anomalia, se regista
// e se continua a suprimir escritas — falha segura, nunca sub-bloqueio.

import { SPARRING_TOPIC } from "./sparring";

export interface SparringLeak {
  /** Estado de treino visível num ponto onde já não deveria existir. */
  anomaly: boolean;
  topic: string | null;
}

export function detectSparringLeak(conversationState: unknown): SparringLeak {
  const topic = (conversationState as { active_topic?: string | null } | null)?.active_topic ?? null;
  const t = topic == null ? null : String(topic);
  return { anomaly: t === SPARRING_TOPIC, topic: t };
}

export function buildSparringLeakLog(input: {
  userId: string;
  channel: string;
  message: string;
  topic: string | null;
}): Record<string, unknown> {
  return {
    admin_user_id: null,
    action: "sparring_leak_detected",
    target_user_id: input.userId,
    resource_type: "conversation",
    resource_id: input.channel,
    reason:
      "Anomalia: estado de treino visível a meio do turno — escritas suprimidas por precaução.",
    metadata: {
      channel: input.channel,
      topic: input.topic,
      message_preview: input.message.slice(0, 200),
      source: "reasoning-engine-v3",
    },
  };
}
