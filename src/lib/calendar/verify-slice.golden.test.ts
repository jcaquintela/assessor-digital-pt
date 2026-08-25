import { describe, it, expect } from "vitest";
import {
  ROUND_MS,
  VERIFY_SLICES,
  inVerifyPlan,
  sliceIndexForNow,
  sliceOf,
  verifyPlanForNow,
} from "./verify-slice";
import { acquireRoundLock } from "./round-lock.server";

describe("rotação da verificação", () => {
  it("uma volta completa cabe na janela de ~30 min (15 rondas de 2 min)", () => {
    expect(VERIFY_SLICES * ROUND_MS).toBe(30 * 60_000);
    const start = Date.parse("2026-08-25T10:00:00Z");
    const seen = new Set<number>();
    for (let i = 0; i < VERIFY_SLICES; i += 1) {
      seen.add(sliceIndexForNow(start + i * ROUND_MS));
    }
    expect(seen.size).toBe(VERIFY_SLICES);
  });

  it("cada evento é verificado exactamente uma vez por volta", () => {
    const ids = Array.from({ length: 300 }, (_, i) => `evt-${i}`);
    const counts = ids.map((id) =>
      Array.from({ length: VERIFY_SLICES }, (_, index) => inVerifyPlan(id, { slices: VERIFY_SLICES, index }))
        .filter(Boolean).length);
    expect(new Set(counts)).toEqual(new Set([1]));
  });

  it("distribui a carga sem sobrecarregar uma ronda", () => {
    const ids = Array.from({ length: 1500 }, (_, i) => `google-event-${i}`);
    const perSlice = new Array(VERIFY_SLICES).fill(0);
    for (const id of ids) perSlice[sliceOf(id)] += 1;
    const media = ids.length / VERIFY_SLICES;
    for (const n of perSlice) expect(n).toBeLessThan(media * 1.6);
  });

  it("sem plano (sincronização manual) verifica tudo", () => {
    expect(inVerifyPlan("qualquer", null)).toBe(true);
    expect(verifyPlanForNow(Date.parse("2026-08-25T10:00:00Z")).slices).toBe(VERIFY_SLICES);
  });
});

// Fake mínimo do app_settings com semântica de update condicional.
function makeSettings() {
  const rows = new Map<string, number>();
  const api: any = {
    from() { return api; },
    upsert(row: any, opts: any) {
      if (!rows.has(row.key) || !opts?.ignoreDuplicates) {
        if (!rows.has(row.key)) rows.set(row.key, row.value_int);
      }
      return Promise.resolve({ data: null, error: null });
    },
    update(patch: any) {
      const state: any = { patch, key: null as string | null, lt: null as number | null };
      const chain: any = {
        eq(_c: string, v: string) { state.key = v; return chain; },
        lt(_c: string, v: number) { state.lt = v; return chain; },
        select() {
          const current = rows.get(state.key!) ?? 0;
          if (state.lt !== null && !(current < state.lt)) return Promise.resolve({ data: [], error: null });
          rows.set(state.key!, state.patch.value_int);
          return Promise.resolve({ data: [{ key: state.key }], error: null });
        },
        then(res: any) { return chain.select().then(res); },
      };
      return chain;
    },
  };
  return api;
}

describe("lock da ronda", () => {
  it("uma segunda ronda salta enquanto a primeira ainda corre", async () => {
    const supabase = makeSettings();
    const first = await acquireRoundLock(supabase, 110);
    expect(first).not.toBeNull();
    expect(await acquireRoundLock(supabase, 110)).toBeNull();
    await first!.release();
    expect(await acquireRoundLock(supabase, 110)).not.toBeNull();
  });
});
