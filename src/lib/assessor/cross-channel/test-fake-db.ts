// Base de dados em memória para testes de integração simulada da conversa
// partilhada. Reproduz o subconjunto do cliente usado pelo código
// (select/insert/update/upsert + eq/in/gte/gt/is/order/limit) e os RPCs de
// lock e de reserva de confirmação com a mesma semântica do SQL.
// Cada operação aplica-se de forma atómica (síncrona) quando é aguardada —
// os turnos concorrentes intercalam-se nos `await`, como na base real.
// Só para testes: nunca importado pela aplicação.

type Row = Record<string, any>;

let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
const nowIso = () => new Date().toISOString();

const ACTIVE = ["pending_confirmation", "collecting_information", "correction_pending"];

export interface FakeDb {
  tables: Record<string, Row[]>;
  calls: Array<{ table: string; op: string }>;
  from(table: string): any;
  rpc(fn: string, args: any): Promise<{ data: any; error: any }>;
}

function defaultsFor(table: string): Row {
  const t = nowIso();
  if (table === "pending_actions") {
    return {
      id: uuid(), structured_payload: {}, missing_fields: [], status: "pending_confirmation",
      presented_channels: [], confirm_token: null, confirm_token_at: null, resolved_channel: null,
      created_at: t, updated_at: t, expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    };
  }
  if (table === "conversation_states") {
    return { id: uuid(), external_conversation_id: "default", created_at: t, updated_at: t };
  }
  return { id: uuid(), created_at: t };
}

function touch(table: string, row: Row) {
  if (table === "pending_actions" || table === "conversation_states") {
    // Trigger BEFORE UPDATE: updated_at = now(), estritamente crescente.
    const prev = Date.parse(row.updated_at ?? 0) || 0;
    row.updated_at = new Date(Math.max(Date.now(), prev + 1)).toISOString();
  }
}

export function createFakeDb(
  seed: Record<string, Row[]> = {},
  opts: { rpc?: Record<string, (args: any) => any> } = {},
): FakeDb {
  const tables: Record<string, Row[]> = {};
  for (const [k, rows] of Object.entries(seed)) {
    tables[k] = rows.map((r) => ({ ...defaultsFor(k), ...r }));
  }
  const calls: FakeDb["calls"] = [];
  const tbl = (name: string) => (tables[name] ??= []);

  function from(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
    let payload: any = null;
    let upsertOpts: any = null;
    let orderBy: { col: string; asc: boolean } | null = null;
    let lim: number | null = null;
    let returning = false;

    const run = (): Row[] => {
      calls.push({ table, op });
      const rows = tbl(table);
      if (op === "insert") {
        const list = Array.isArray(payload) ? payload : [payload];
        const out = list.map((r: Row) => ({ ...defaultsFor(table), ...r }));
        rows.push(...out);
        return out;
      }
      if (op === "upsert") {
        const keys = String(upsertOpts?.onConflict ?? "id").split(",").map((s) => s.trim());
        const list = Array.isArray(payload) ? payload : [payload];
        const out: Row[] = [];
        for (const r of list) {
          const full = { ...defaultsFor(table), ...r };
          const hit = rows.find((x) => keys.every((k) => x[k] === full[k]));
          if (hit) {
            if (upsertOpts?.ignoreDuplicates) continue;
            Object.assign(hit, r);
            touch(table, hit);
            out.push(hit);
          } else {
            rows.push(full);
            out.push(full);
          }
        }
        return out;
      }
      let matched = rows.filter((r) => filters.every((f) => f(r)));
      if (op === "update") {
        for (const r of matched) { Object.assign(r, payload); touch(table, r); }
        return matched;
      }
      if (op === "delete") {
        tables[table] = rows.filter((r) => !matched.includes(r));
        return matched;
      }
      if (orderBy) {
        const { col, asc } = orderBy;
        matched = [...matched].sort((a, b) => {
          const av = a[col] ?? ""; const bv = b[col] ?? "";
          return (av < bv ? -1 : av > bv ? 1 : 0) * (asc ? 1 : -1);
        });
      }
      if (lim !== null) matched = matched.slice(0, lim);
      return matched.map((r) => ({ ...r }));
    };

    const q: any = {
      select: () => { if (op !== "select") returning = true; return q; },
      insert: (p: any) => { op = "insert"; payload = p; return q; },
      update: (p: any) => { op = "update"; payload = p; return q; },
      upsert: (p: any, o: any) => { op = "upsert"; payload = p; upsertOpts = o; return q; },
      delete: () => { op = "delete"; return q; },
      eq: (c: string, v: any) => { filters.push((r) => r[c] === v); return q; },
      neq: (c: string, v: any) => { filters.push((r) => r[c] !== v); return q; },
      in: (c: string, vs: any[]) => { filters.push((r) => vs.includes(r[c])); return q; },
      gte: (c: string, v: any) => { filters.push((r) => r[c] != null && r[c] >= v); return q; },
      gt: (c: string, v: any) => { filters.push((r) => r[c] != null && r[c] > v); return q; },
      lt: (c: string, v: any) => { filters.push((r) => r[c] != null && r[c] < v); return q; },
      lte: (c: string, v: any) => { filters.push((r) => r[c] != null && r[c] <= v); return q; },
      like: (c: string, pat: string) => {
        const re = new RegExp("^" + String(pat).split("%").map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$");
        filters.push((r) => re.test(String(r[c] ?? "")));
        return q;
      },
      is: (c: string, v: any) => { filters.push((r) => (r[c] ?? null) === v); return q; },
      order: (c: string, o?: { ascending?: boolean }) => { orderBy = { col: c, asc: o?.ascending !== false }; return q; },
      limit: (n: number) => { lim = n; return q; },
      maybeSingle: async () => {
        const rows = run();
        if (rows.length > 1 && op === "select") return { data: null, error: { message: "multiple rows" } };
        return { data: rows[0] ?? null, error: null };
      },
      single: async () => {
        const rows = run();
        return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: "not single" } };
      },
      then: (res: any, rej: any) => {
        try {
          const rows = run();
          const data = op === "select" || returning ? rows : null;
          return Promise.resolve({ data, error: null }).then(res, rej);
        } catch (e) {
          return Promise.reject(e).then(res, rej);
        }
      },
    };
    return q;
  }

  async function rpc(fn: string, a: any) {
    calls.push({ table: `rpc:${fn}`, op: "rpc" });
    const now = Date.now();
    if (opts.rpc?.[fn]) {
      try { return { data: await opts.rpc[fn](a), error: null }; }
      catch (e: any) { return { data: null, error: { message: String(e?.message ?? e) } }; }
    }
    if (fn === "reserve_unsolicited_slot") {
      const led = tbl("proactive_daily_ledger");
      if (led.some((r) => r.user_id === a._user_id && r.day === a._day && r.ref_key === a._ref_key)) return { data: true, error: null };
      const n = led.filter((r) => r.user_id === a._user_id && r.day === a._day).length;
      if (n >= Math.max(a._cap ?? 1, 0)) return { data: false, error: null };
      led.push({ id: uuid(), user_id: a._user_id, day: a._day, source: a._source, ref_key: a._ref_key, created_at: nowIso() });
      return { data: true, error: null };
    }
    if (fn === "release_unsolicited_slot") {
      tables.proactive_daily_ledger = tbl("proactive_daily_ledger").filter(
        (r) => !(r.user_id === a._user_id && r.day === a._day && r.ref_key === a._ref_key),
      );
      return { data: null, error: null };
    }
    if (fn === "try_acquire_conversation_lock") {
      const locks = tbl("conversation_locks");
      const cur = locks.find((l) => l.user_id === a._user_id && l.channel === a._channel);
      if (cur && Date.parse(cur.locked_until) > now) return { data: false, error: null };
      const until = new Date(now + a._ttl_seconds * 1000).toISOString();
      if (cur) Object.assign(cur, { locked_until: until, holder: a._holder });
      else locks.push({ user_id: a._user_id, channel: a._channel, locked_until: until, holder: a._holder });
      return { data: true, error: null };
    }
    if (fn === "release_conversation_lock") {
      for (const l of tbl("conversation_locks")) {
        if (l.user_id === a._user_id && l.channel === a._channel && (!a._holder || l.holder === a._holder)) {
          l.locked_until = new Date(now - 1000).toISOString();
        }
      }
      return { data: null, error: null };
    }
    if (fn === "claim_pending_confirmation") {
      let n = 0;
      for (const r of tbl("pending_actions")) {
        if (r.user_id !== a._user_id || !a._ids.includes(r.id) || !ACTIVE.includes(r.status)) continue;
        const stale = r.confirm_token_at && Date.parse(r.confirm_token_at) < now - (a._ttl_seconds ?? 120) * 1000;
        if (r.confirm_token == null || r.confirm_token === a._token || stale) {
          r.confirm_token = a._token; r.confirm_token_at = new Date(now).toISOString(); touch("pending_actions", r); n++;
        }
      }
      return { data: n, error: null };
    }
    if (fn === "release_pending_confirmation") {
      let n = 0;
      for (const r of tbl("pending_actions")) {
        if (r.user_id !== a._user_id || r.confirm_token !== a._token) continue;
        r.confirm_token = null; r.confirm_token_at = null;
        if (["executed", "cancelled", "corrected", "failed"].includes(r.status)) r.resolved_channel ??= a._channel;
        touch("pending_actions", r); n++;
      }
      return { data: n, error: null };
    }
    if (fn === "mark_pending_presented") {
      let n = 0;
      for (const r of tbl("pending_actions")) {
        if (r.user_id !== a._user_id || !a._ids.includes(r.id)) continue;
        const cur = r.presented_channels?.length ? r.presented_channels : [r.channel];
        if (cur.includes(a._channel)) continue;
        r.presented_channels = [...cur, a._channel]; touch("pending_actions", r); n++;
      }
      return { data: n, error: null };
    }
    return { data: null, error: { message: `rpc desconhecido: ${fn}` } };
  }

  return { tables, calls, from, rpc };
}
