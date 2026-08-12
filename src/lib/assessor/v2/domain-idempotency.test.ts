import { describe, it, expect } from "vitest";
import { dispatchToolCall, type DomainContext } from "./domain.server";

// Fake mínimo do supabase-js focado nas chamadas usadas por
// execCreateFollowUp / execCreateEvent: insert().select().single() e
// select().eq().eq().maybeSingle(). Faz respeitar o índice único parcial
// em follow_ups.source_pending_action_id devolvendo o erro 23505 quando
// já existe uma linha com o mesmo pending id.
function makeFakeSupabase() {
  const rows: any[] = [];
  // Tabelas primárias contadas por `_rows`. Auxiliares (reminders, etc.)
  // são simuladas em silêncio para não interferir com os testes de
  // idempotência de follow_ups/events.
  const PRIMARY = new Set(["follow_ups", "events"]);
  const auxRows: any[] = [];
  const client: any = {
    _rows: rows,
    _aux: auxRows,
    from(table: string) {
      const primary = PRIMARY.has(table);
      const target = primary ? rows : auxRows;
      const state = {
        filters: [] as [string, any][],
        op: null as null | "insert" | "update",
        payload: null as any,
      };
      const chain: any = {
        select(_cols?: string) { return chain; },
        eq(col: string, v: any) { state.filters.push([col, v]); return chain; },
        neq() { return chain; },
        in() { return chain; },
        is() { return chain; },
        not() { return chain; },
        ilike() { return chain; },
        gte() { return chain; },
        lte() { return chain; },
        lt() { return chain; },
        order() { return chain; },
        limit() { return chain; },
        insert(row: any) { state.op = "insert"; state.payload = row; return chain; },
        update(row: any) { state.op = "update"; state.payload = row; return chain; },
        async single() {
          if (state.op === "insert") {
            if (!primary) {
              const stub = { id: `aux-${auxRows.length + 1}`, ...state.payload };
              auxRows.push(stub);
              return { data: stub, error: null };
            }
            const pid = state.payload.source_pending_action_id;
            if (pid && target.some((r) => r.source_pending_action_id === pid)) {
              return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
            }
            const inserted = { id: `id-${target.length + 1}`, ...state.payload };
            target.push(inserted);
            return { data: inserted, error: null };
          }
          return { data: null, error: null };
        },
        async maybeSingle() {
          const match = target.find((r) => state.filters.every(([c, v]) => r[c] === v));
          return { data: match ?? null, error: null };
        },
      };
      return chain;
    },
  };
  return client;
}

const baseCtx = (sb: any, pendingActionId?: string | null): DomainContext => ({
  supabase: sb,
  userId: "u1",
  channel: "web",
  sourceMessageId: null,
  pendingActionId: pendingActionId ?? null,
});

const followUpArgs = {
  title: "Ligar ao João",
  type: "chamada",
  due_date: "2026-07-30",
  due_time: "10:00",
  priority: "media",
  person_id: "11111111-1111-4111-8111-111111111111",
};

const eventArgs = {
  title: "Visita apartamento",
  event_type: "visita",
  date: "2026-07-30",
  start_time: "15:00",
  person_id: "11111111-1111-4111-8111-111111111111",
};

describe("idempotência — follow_ups por source_pending_action_id", () => {
  it("dois 'sim' sequenciais criam um único follow_up e marcam idempotent", async () => {
    const sb = makeFakeSupabase();
    const ctx = baseCtx(sb, "pa-seq");
    const r1 = await dispatchToolCall(ctx, "create_follow_up", JSON.stringify(followUpArgs));
    const r2 = await dispatchToolCall(ctx, "create_follow_up", JSON.stringify(followUpArgs));
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect((r1.data as any).idempotent).toBeUndefined();
    expect((r2.data as any).idempotent).toBe(true);
    expect((r1.data as any).follow_up.id).toBe((r2.data as any).follow_up.id);
    expect(sb._rows.length).toBe(1);
  });

  it("dois 'sim' sequenciais em create_event também são idempotentes", async () => {
    const sb = makeFakeSupabase();
    const ctx = baseCtx(sb, "pa-evt");
    const r1 = await dispatchToolCall(ctx, "create_event", JSON.stringify(eventArgs));
    const r2 = await dispatchToolCall(ctx, "create_event", JSON.stringify(eventArgs));
    expect(r1.ok && r2.ok).toBe(true);
    expect((r2.data as any).idempotent).toBe(true);
    expect(sb._rows.length).toBe(1);
  });

  it("sem pendingActionId não há idempotência dura (criações independentes)", async () => {
    const sb = makeFakeSupabase();
    const ctx = baseCtx(sb, null);
    await dispatchToolCall(ctx, "create_follow_up", JSON.stringify(followUpArgs));
    await dispatchToolCall(ctx, "create_follow_up", JSON.stringify(followUpArgs));
    expect(sb._rows.length).toBe(2);
  });

  it("retry técnico após 23505 (race) reutiliza o recurso existente", async () => {
    const sb = makeFakeSupabase();
    // Simula que o pre-check falhou em ver a linha (janela de corrida):
    // pré-populamos a linha e mandamos o primeiro maybeSingle devolver null.
    sb._rows.push({
      id: "pre-1", user_id: "u1", source_pending_action_id: "pa-race",
      title: "Existente", due_date: "2026-07-30", due_time: null,
    });
    let bypass = 1;
    const origFrom = sb.from.bind(sb);
    sb.from = (table: string) => {
      const chain = origFrom(table);
      const orig = chain.maybeSingle.bind(chain);
      chain.maybeSingle = async () => {
        if (bypass > 0) { bypass--; return { data: null, error: null }; }
        return orig();
      };
      return chain;
    };
    const ctx = baseCtx(sb, "pa-race");
    const r = await dispatchToolCall(ctx, "create_follow_up", JSON.stringify(followUpArgs));
    expect(r.ok).toBe(true);
    expect((r.data as any).idempotent).toBe(true);
    expect((r.data as any).follow_up.id).toBe("pre-1");
    expect(sb._rows.length).toBe(1);
  });

  it("concorrência: dois dispatchs em paralelo com mesma pending → 1 linha, 2 sucessos", async () => {
    const sb = makeFakeSupabase();
    // Força ambos os pre-checks a devolver null (janela de corrida real).
    let bypass = 2;
    const origFrom = sb.from.bind(sb);
    sb.from = (table: string) => {
      const chain = origFrom(table);
      const orig = chain.maybeSingle.bind(chain);
      chain.maybeSingle = async () => {
        if (bypass > 0) { bypass--; return { data: null, error: null }; }
        return orig();
      };
      return chain;
    };
    const ctx = baseCtx(sb, "pa-concurrent");
    const [a, b] = await Promise.all([
      dispatchToolCall(ctx, "create_follow_up", JSON.stringify(followUpArgs)),
      dispatchToolCall(ctx, "create_follow_up", JSON.stringify(followUpArgs)),
    ]);
    expect(a.ok && b.ok).toBe(true);
    // Exactly one insert survived, o outro foi tratado como idempotente.
    expect(sb._rows.length).toBe(1);
    const idempotents = [a, b].filter((r) => (r.data as any)?.idempotent === true);
    expect(idempotents.length).toBe(1);
  });
});

describe("stress — 'sim' em sequência rápida", () => {
  it("N confirmações sequenciais rápidas de follow_up criam apenas 1 linha", async () => {
    const sb = makeFakeSupabase();
    const ctx = baseCtx(sb, "pa-stress-seq-fu");
    const N = 15;
    const results = [];
    for (let i = 0; i < N; i++) {
      results.push(await dispatchToolCall(ctx, "create_follow_up", JSON.stringify(followUpArgs)));
    }
    expect(results.every((r) => r.ok)).toBe(true);
    expect(sb._rows.length).toBe(1);
    const firstId = (results[0].data as any).follow_up.id;
    for (let i = 1; i < N; i++) {
      expect((results[i].data as any).idempotent).toBe(true);
      expect((results[i].data as any).follow_up.id).toBe(firstId);
    }
  });

  it("N confirmações sequenciais rápidas de event criam apenas 1 linha", async () => {
    const sb = makeFakeSupabase();
    const ctx = baseCtx(sb, "pa-stress-seq-evt");
    const N = 15;
    const results = [];
    for (let i = 0; i < N; i++) {
      results.push(await dispatchToolCall(ctx, "create_event", JSON.stringify(eventArgs)));
    }
    expect(results.every((r) => r.ok)).toBe(true);
    expect(sb._rows.length).toBe(1);
    const firstId = (results[0].data as any).event.id;
    for (let i = 1; i < N; i++) {
      expect((results[i].data as any).idempotent).toBe(true);
      expect((results[i].data as any).event.id).toBe(firstId);
    }
  });

  it("N dispatchs paralelos de follow_up com pre-check a falhar → 1 linha, N sucessos", async () => {
    const sb = makeFakeSupabase();
    const N = 10;
    // Força todos os pre-checks a devolver null para simular a pior race.
    let bypass = N;
    const origFrom = sb.from.bind(sb);
    sb.from = (table: string) => {
      const chain = origFrom(table);
      const orig = chain.maybeSingle.bind(chain);
      chain.maybeSingle = async () => {
        if (bypass > 0) { bypass--; return { data: null, error: null }; }
        return orig();
      };
      return chain;
    };
    const ctx = baseCtx(sb, "pa-stress-par-fu");
    const results = await Promise.all(
      Array.from({ length: N }, () => dispatchToolCall(ctx, "create_follow_up", JSON.stringify(followUpArgs))),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    expect(sb._rows.length).toBe(1);
    const winnerId = sb._rows[0].id;
    for (const r of results) {
      expect((r.data as any).follow_up.id).toBe(winnerId);
    }
    const idempotents = results.filter((r) => (r.data as any)?.idempotent === true);
    expect(idempotents.length).toBe(N - 1);
  });

  it("N dispatchs paralelos de event com pre-check a falhar → 1 linha, N sucessos", async () => {
    const sb = makeFakeSupabase();
    const N = 10;
    let bypass = N;
    const origFrom = sb.from.bind(sb);
    sb.from = (table: string) => {
      const chain = origFrom(table);
      const orig = chain.maybeSingle.bind(chain);
      chain.maybeSingle = async () => {
        if (bypass > 0) { bypass--; return { data: null, error: null }; }
        return orig();
      };
      return chain;
    };
    const ctx = baseCtx(sb, "pa-stress-par-evt");
    const results = await Promise.all(
      Array.from({ length: N }, () => dispatchToolCall(ctx, "create_event", JSON.stringify(eventArgs))),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    expect(sb._rows.length).toBe(1);
    const winnerId = sb._rows[0].id;
    for (const r of results) {
      expect((r.data as any).event.id).toBe(winnerId);
    }
    const idempotents = results.filter((r) => (r.data as any)?.idempotent === true);
    expect(idempotents.length).toBe(N - 1);
  });

  it("retry técnico repetido após 23505 reutiliza sempre o mesmo follow_up", async () => {
    const sb = makeFakeSupabase();
    sb._rows.push({
      id: "canonical-fu", user_id: "u1", source_pending_action_id: "pa-stress-retry-fu",
      title: "Existente", due_date: "2026-07-30", due_time: null,
    });
    // Cada iteração: apenas o pre-check devolve null (força INSERT → 23505);
    // a lookup pós-conflito devolve a linha canónica.
    let bypass = 0;
    const origFrom = sb.from.bind(sb);
    sb.from = (table: string) => {
      const chain = origFrom(table);
      const orig = chain.maybeSingle.bind(chain);
      chain.maybeSingle = async () => {
        if (bypass > 0) { bypass--; return { data: null, error: null }; }
        return orig();
      };
      return chain;
    };
    const ctx = baseCtx(sb, "pa-stress-retry-fu");
    for (let i = 0; i < 8; i++) {
      bypass = 1;
      const r = await dispatchToolCall(ctx, "create_follow_up", JSON.stringify(followUpArgs));
      expect(r.ok).toBe(true);
      expect((r.data as any).idempotent).toBe(true);
      expect((r.data as any).follow_up.id).toBe("canonical-fu");
    }
    expect(sb._rows.length).toBe(1);
  });

  it("retry técnico repetido após 23505 reutiliza sempre o mesmo event", async () => {
    const sb = makeFakeSupabase();
    sb._rows.push({
      id: "canonical-evt", user_id: "u1", source_pending_action_id: "pa-stress-retry-evt",
      title: "Existente",
    });
    let bypass = 0;
    const origFrom = sb.from.bind(sb);
    sb.from = (table: string) => {
      const chain = origFrom(table);
      const orig = chain.maybeSingle.bind(chain);
      chain.maybeSingle = async () => {
        if (bypass > 0) { bypass--; return { data: null, error: null }; }
        return orig();
      };
      return chain;
    };
    const ctx = baseCtx(sb, "pa-stress-retry-evt");
    for (let i = 0; i < 8; i++) {
      bypass = 1;
      const r = await dispatchToolCall(ctx, "create_event", JSON.stringify(eventArgs));
      expect(r.ok).toBe(true);
      expect((r.data as any).idempotent).toBe(true);
      expect((r.data as any).event.id).toBe("canonical-evt");
    }
    expect(sb._rows.length).toBe(1);
  });
});