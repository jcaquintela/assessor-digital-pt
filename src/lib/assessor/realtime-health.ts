/**
 * Saúde do canal em tempo real do painel.
 *
 * O websocket falha em redes com proxies/firewalls. Em vez de deixar a conversa
 * "morta" sem aviso, medimos o estado da ligação e caímos para consulta
 * periódica — dizendo-o ao consultor em português simples.
 */

export type RealtimeHealth = "connecting" | "live" | "degraded";

/** Estado bruto devolvido pelo `.subscribe(status)` do cliente. */
export type RealtimeSubscribeStatus =
  | "SUBSCRIBED"
  | "TIMED_OUT"
  | "CHANNEL_ERROR"
  | "CLOSED"
  | string;

export function mapSubscribeStatus(status: RealtimeSubscribeStatus): RealtimeHealth {
  if (status === "SUBSCRIBED") return "live";
  if (status === "TIMED_OUT" || status === "CHANNEL_ERROR" || status === "CLOSED") return "degraded";
  return "connecting";
}

/** Se não ligar dentro deste tempo, assumimos indisponível e passamos a consultar. */
export const CONNECT_TIMEOUT_MS = 8_000;

/** Ritmos de consulta (ms). Sem websocket consultamos mais vezes. */
export const POLL_DEGRADED_MS = 4_000;
export const POLL_PENDING_MS = 3_000;
export const POLL_LIVE_IDLE_MS = 30_000;

/**
 * Ritmo de consulta a usar. `null` = não é preciso consultar
 * (nunca devolvemos null: mesmo com websocket vivo há uma rede de segurança lenta).
 */
export function pollIntervalMs(health: RealtimeHealth, hasPending: boolean): number {
  if (hasPending) return POLL_PENDING_MS;
  if (health === "live") return POLL_LIVE_IDLE_MS;
  return POLL_DEGRADED_MS;
}

export const HEALTH_LABEL: Record<RealtimeHealth, string> = {
  connecting: "A ligar…",
  live: "Ligado em tempo real",
  degraded: "Sem ligação directa — a consultar de X em X segundos",
};

export function healthLabel(health: RealtimeHealth, hasPending = false): string {
  if (health !== "degraded") return HEALTH_LABEL[health];
  const segundos = Math.round(pollIntervalMs(health, hasPending) / 1000);
  return `Sem ligação directa — a actualizar de ${segundos} em ${segundos} segundos`;
}
