// Fake mínimo do supabase-js para testes de serviços server-side.
// Só suporta o subconjunto que os serviços usam (filtros simples, ordenação,
// limite, insert/update/delete e storage.remove).

export type Row = Record<string, any>;

export function makeFakeSupabase(seed: Record<string, Row[]> = {}) {
  const state: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(seed)) state[k] = v.map((r) => ({ ...r }));
  const removedPaths: string[] = [];

  function table(name: string): Row[] {
    if (!state[name]) state[name] = [];
    return state[name];
  }

  function from(name: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let mode: "select" | "insert" | "update" | "delete" = "select";
    let payload: any = null;
    let orderKey: string | null = null;
    let orderAsc = true;
    let limitN: number | null = null;

    const rows = () => {
      let out = table(name).filter((r) => filters.every((f) => f(r)));
      if (orderKey) {
        const k = orderKey;
        out = [...out].sort((a, b) =>
          String(a[k] ?? "") < String(b[k] ?? "") ? (orderAsc ? -1 : 1) : String(a[k] ?? "") > String(b[k] ?? "") ? (orderAsc ? 1 : -1) : 0,
        );
      }
      if (limitN != null) out = out.slice(0, limitN);
      return out;
    };

    const run = () => {
      if (mode === "insert") {
        const items = Array.isArray(payload) ? payload : [payload];
        const stored = items.map((it: Row) => {
          const row = { id: `${name}-${table(name).length + 1}`, ...it };
          table(name).push(row);
          return row;
        });
        return { data: stored, error: null, count: stored.length };
      }
      if (mode === "update") {
        const hit = rows();
        for (const r of hit) Object.assign(r, payload);
        return { data: hit, error: null, count: hit.length };
      }
      if (mode === "delete") {
        const hit = new Set(rows());
        state[name] = table(name).filter((r) => !hit.has(r));
        return { data: [...hit], error: null, count: hit.size };
      }
      const data = rows();
      return { data, error: null, count: data.length };
    };

    const api: any = {
      select() { if (mode === "select") mode = "select"; return api; },
      insert(p: any) { mode = "insert"; payload = p; return api; },
      update(p: any) { mode = "update"; payload = p; return api; },
      delete() { mode = "delete"; return api; },
      eq(c: string, v: any) { filters.push((r) => r[c] === v); return api; },
      neq(c: string, v: any) { filters.push((r) => r[c] !== v); return api; },
      in(c: string, vs: any[]) { filters.push((r) => vs.includes(r[c])); return api; },
      is(c: string, v: any) { filters.push((r) => (r[c] ?? null) === v); return api; },
      not(c: string, _op: string, v: any) { filters.push((r) => (r[c] ?? null) !== v); return api; },
      lt(c: string, v: any) { filters.push((r) => r[c] != null && String(r[c]) < String(v)); return api; },
      lte(c: string, v: any) { filters.push((r) => r[c] != null && String(r[c]) <= String(v)); return api; },
      gt(c: string, v: any) { filters.push((r) => r[c] != null && String(r[c]) > String(v)); return api; },
      gte(c: string, v: any) { filters.push((r) => r[c] != null && String(r[c]) >= String(v)); return api; },
      order(c: string, o?: { ascending?: boolean }) { orderKey = c; orderAsc = o?.ascending !== false; return api; },
      limit(n: number) { limitN = n; return api; },
      maybeSingle() { const r = run(); return Promise.resolve({ data: (r.data as Row[])[0] ?? null, error: null }); },
      single() { const r = run(); return Promise.resolve({ data: (r.data as Row[])[0] ?? null, error: null }); },
      then(res: any, rej: any) { return Promise.resolve(run()).then(res, rej); },
    };
    return api;
  }

  return {
    state,
    removedPaths,
    from,
    storage: {
      from() {
        return {
          async remove(paths: string[]) { removedPaths.push(...paths); return { data: null, error: null }; },
        };
      },
    },
  };
}