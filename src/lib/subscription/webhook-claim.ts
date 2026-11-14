// Regras puras de reprocessamento dos eventos de pagamento.
//
// Cada evento fica registado em `stripe_webhook_events` (event_id único).
// Antes só a primeira entrega contava: se ela falhasse a meio, todos os
// reenvios do Stripe eram ignorados como "repetidos" e o estado ficava errado.
// Agora:
//   processed / skipped  → já aplicado: reenvio ignorado (200)
//   failed               → volta a tentar
//   pending recente      → outra entrega está a tratar: pedir reenvio (409)
//   pending antigo       → a entrega anterior morreu: volta a tentar

export const WEBHOOK_PENDING_STALE_MS = 5 * 60_000;

export type WebhookEventRow = { id: string; outcome: string; processed_at: string | null };
export type ClaimVerdict = "done" | "in_flight" | "retry";

export function claimVerdict(row: WebhookEventRow, nowMs: number = Date.now()): ClaimVerdict {
  if (row.outcome === "processed" || row.outcome === "skipped") return "done";
  if (row.outcome === "failed") return "retry";
  const at = row.processed_at ? new Date(row.processed_at).getTime() : 0;
  if (!Number.isFinite(at) || nowMs - at > WEBHOOK_PENDING_STALE_MS) return "retry";
  return "in_flight";
}

export function isUniqueViolation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "23505" || /duplicate key|unique constraint/i.test(error.message ?? "");
}

export class WebhookInFlightError extends Error {
  constructor(eventId: string) {
    super(`event ${eventId} is being processed by another delivery`);
    this.name = "WebhookInFlightError";
  }
}
