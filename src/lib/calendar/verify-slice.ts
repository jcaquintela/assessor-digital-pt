// Rotação da verificação de eventos ligados.
//
// O delta sync passa a correr a cada 2 minutos. A verificação evento-a-evento
// (1 GET por compromisso ligado) não pode correr em todas as rondas: com 10
// consultores davam ~450 mil chamadas/dia. Em vez de um pico a cada 30 min,
// dividimos os eventos em fatias estáveis: cada ronda de 2 min verifica 1/15
// dos eventos, completando a volta em ~30 min com carga uniforme.

export const VERIFY_SLICES = 15;
export const ROUND_MS = 120_000;

export interface VerifyPlan {
  slices: number;
  index: number;
}

/** Fatia a verificar nesta ronda (roda com o relógio, sem estado guardado). */
export function sliceIndexForNow(nowMs: number, roundMs = ROUND_MS, slices = VERIFY_SLICES): number {
  return Math.floor(nowMs / roundMs) % slices;
}

export function verifyPlanForNow(nowMs: number, roundMs = ROUND_MS, slices = VERIFY_SLICES): VerifyPlan {
  return { slices, index: sliceIndexForNow(nowMs, roundMs, slices) };
}

/** Hash estável (FNV-1a) para distribuir os eventos pelas fatias. */
export function sliceOf(externalEventId: string, slices = VERIFY_SLICES): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < externalEventId.length; i += 1) {
    h ^= externalEventId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % slices;
}

/** `true` quando o evento pertence à fatia desta ronda (ou quando não há fatia). */
export function inVerifyPlan(externalEventId: string, plan: VerifyPlan | null): boolean {
  if (!plan) return true; // verificação completa (sincronização manual)
  return sliceOf(externalEventId, plan.slices) === plan.index;
}
