// Regressão end-to-end (07/08): "Visita com Sr. Almeida" foi desmarcada no
// Afonso mas continuou no Google Calendar — voltou ao briefing do dia seguinte
// e disparou o lembrete das 11h. Estes testes percorrem a cadeia completa:
// desmarcar/arquivar -> avisos internos -> evento externo -> prioridades do dia
// seguinte -> ronda de sincronização de entrada.
import { describe, it, expect, beforeEach, vi } from "vitest";

/* ---------------- BD em memória (chainable, estilo supabase-js) ---------------- */

type Row = Record<string, any>;
const db: Record<string, Row[]> = {};
let idSeq = 0;

function applyFilters(rows: Row[], filters: Array<(r: Row) => boolean>) {
  return rows.filter((r) => filters.every((f) => f(r)));
}

function parseInList(val: string): string[] {
  return val.replace(/^\(|\)$/g, "").split(",").map((s) => s.trim());
}

function makeDb() {
  const from = (table: string) => {
    db[table] ??= [];
    const filters: Array<(r: Row) => boolean> = [];
    let op: "select" | "update" | "insert" | "upsert" | "delete" = "select";
    let payload: any = null;

    const valueOf = (r: Row, c: string) => {
      if (table === "calendar_event_links" && c.startsWith("follow_ups.")) {
        const field = c.split(".")[1];
        const fu = (db.follow_ups ?? []).find((f) => f.id === r.follow_up_id && f.user_id === r.user_id);
        return field ? fu?.[field] : undefined;
      }
      return r[c];
    };

    const run = () => {
      if (op === "select") return applyFilters(db[table], filters);
      if (op === "update") {
        const hit = applyFilters(db[table], filters);
        for (const r of hit) Object.assign(r, payload);
        return hit;
      }
      if (op === "delete") {
        const hit = applyFilters(db[table], filters);
        db[table] = db[table].filter((r) => !hit.includes(r));
        return hit;
      }
      const rows = Array.isArray(payload) ? payload : [payload];
      const out: Row[] = [];
      for (const r of rows) {
        const row = { id: r.id ?? `gen-${++idSeq}`, ...r };
        if (op === "upsert") {
          const existing = db[table].find((e) =>
            e.user_id === row.user_id && e.provider === row.provider && e.follow_up_id === row.follow_up_id);
          if (existing) { Object.assign(existing, row); out.push(existing); continue; }
        }
        db[table].push(row);
        out.push(row);
      }
      return out;
    };

    const api: any = {
      select: () => api,
      eq: (c: string, v: any) => { filters.push((r) => valueOf(r, c) === v); return api; },
      neq: (c: string, v: any) => { filters.push((r) => valueOf(r, c) !== v); return api; },
      is: (c: string, v: any) => { filters.push((r) => (valueOf(r, c) ?? null) === v); return api; },
      in: (c: string, v: any[]) => { filters.push((r) => v.includes(valueOf(r, c))); return api; },
      not: (c: string, o: string, v: any) => {
        if (o === "in") { const list = parseInList(String(v)); filters.push((r) => !list.includes(valueOf(r, c))); }
        else filters.push((r) => valueOf(r, c) !== v);
        return api;
      },
      gte: (c: string, v: any) => { filters.push((r) => new Date(valueOf(r, c)) >= new Date(v)); return api; },
      lte: (c: string, v: any) => { filters.push((r) => new Date(valueOf(r, c)) <= new Date(v)); return api; },
      lt: (c: string, v: any) => { filters.push((r) => new Date(valueOf(r, c)) < new Date(v)); return api; },
      ilike: () => api,
      or: () => api,
      order: () => api,
      limit: () => api,
      range: () => api,
      update: (p: Row) => { op = "update"; payload = p; return api; },
      insert: (p: Row) => { op = "insert"; payload = p; return api; },
      upsert: (p: Row) => { op = "upsert"; payload = p; return api; },
      delete: () => { op = "delete"; return api; },
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      single: async () => { const r = run()[0] ?? null; return { data: r, error: r ? null : { message: "no_rows" } }; },
      then: (res: any, rej: any) => Promise.resolve({ data: run(), error: null }).then(res, rej),
    };
    return api;
  };
  return { from };
}

const supabase: any = makeDb();

/* ---------------------------- Mocks de fronteira ---------------------------- */

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: supabase }));
vi.mock("./connections.server", () => ({ getConnectionKeyForUser: async () => "lovack_test" }));
vi.mock("@/lib/calendar/connections.server", () => ({ getConnectionKeyForUser: async () => "lovack_test" }));

const gatewayCalls: Array<{ method: string; path: string }> = [];
vi.mock("@/integrations/lovable/appUserConnector", () => ({
  callAsAppUser: async ({ path, init }: any) => {
    gatewayCalls.push({ method: String(init?.method ?? "GET"), path });
    if (init?.method === "DELETE") return new Response("", { status: 200 });
    if (path.includes("events?")) return new Response(JSON.stringify({ items: externalItems, nextSyncToken: "tok" }), { status: 200 });
    if (missingExternalIds.has(String(path).split("/").pop() ?? "")) {
      return new Response(JSON.stringify({ error: { code: 410, message: "Resource has been deleted" } }), { status: 410 });
    }
    return new Response(JSON.stringify({ id: "gcal-almeida", updated: new Date().toISOString() }), { status: 200 });
  },
}));

let externalItems: any[] = [];
let missingExternalIds = new Set<string>();

import { dispatchToolCall } from "@/lib/assessor/v2/domain.server";
import { computePriorities } from "@/lib/assessor/supreme/priorities.server";
import { pullFromProvider } from "./sync.server";
import { VERIFY_SLICES, sliceOf } from "./verify-slice";

const USER = "11111111-1111-4111-8111-111111111111";
const FU = "f85a5c00-0000-4000-8000-000000000001";

function isoTodayAt(hhmm: string, dayOffset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  const [h, m] = hhmm.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function seed() {
  for (const k of Object.keys(db)) delete db[k];
  gatewayCalls.length = 0;
  externalItems = [];
  missingExternalIds = new Set<string>();
  db.follow_ups = [{
    id: FU, user_id: USER, title: "Visita com Sr. Almeida", type: "visita",
    due_date: isoTodayAt("11:00"), due_time: "11:00", status: "agendado",
    priority: "alta", outcome: null, archived_at: null, notes: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }];
  db.reminders = [{
    id: "r1", user_id: USER, related_resource_type: "follow_up",
    related_resource_id: FU, status: "scheduled", scheduled_for: isoTodayAt("10:45"),
  }];
  db.calendar_event_links = [{
    id: "l1", user_id: USER, provider: "google_calendar", follow_up_id: FU,
    external_event_id: "gcal-almeida", external_calendar_id: "primary",
    external_updated_at: new Date(Date.now() - 3600_000).toISOString(),
    deleted: false, last_origin: "afonso",
  }];
  db.opportunities = [];
  db.people = [];
  db.calendar_sync_log = [];
  db.calendar_sync_state = [];
}

const ctx = () => ({ supabase, userId: USER, channel: "whatsapp" as const });

describe("regressão: cancelar evento do Google Calendar", () => {
  beforeEach(seed);

  it("desmarcar por conversa fecha o seguimento, cancela avisos e apaga no Google", async () => {
    const r = await dispatchToolCall(ctx() as any, "cancel_follow_up", JSON.stringify({ follow_up_ids: [FU] }));
    expect(r.ok).toBe(true);

    expect(["cancelado", "cancelada", "arquivado"]).toContain(String(db.follow_ups[0].status).toLowerCase());
    expect(db.reminders[0].status).toBe("cancelled");
    expect(gatewayCalls.some((c) => c.method === "DELETE" && c.path.includes("gcal-almeida"))).toBe(true);
    expect(db.calendar_event_links[0].deleted).toBe(true);
  });

  it("arquivar por conversa tem o mesmo efeito em ambos os lados", async () => {
    const r = await dispatchToolCall(ctx() as any, "archive_record", JSON.stringify({ entity: "follow_up", id: FU }));
    expect(r.ok).toBe(true);
    expect(db.follow_ups[0].archived_at).toBeTruthy();
    expect(db.reminders[0].status).toBe("cancelled");
    expect(gatewayCalls.some((c) => c.method === "DELETE")).toBe(true);
  });

  it("no dia seguinte não volta às prioridades nem gera novo aviso", async () => {
    await dispatchToolCall(ctx() as any, "cancel_follow_up", JSON.stringify({ follow_up_ids: [FU] }));

    const amanha = new Date(Date.now() + 86_400_000);
    const items = await computePriorities(supabase, USER, { now: amanha });
    expect(items.find((i) => i.subject_id === FU)).toBeUndefined();

    const activos = db.reminders.filter((r) => r.status === "scheduled");
    expect(activos).toHaveLength(0);
  });

  it("a ronda de sincronização não ressuscita o evento desmarcado", async () => {
    await dispatchToolCall(ctx() as any, "cancel_follow_up", JSON.stringify({ follow_up_ids: [FU] }));
    gatewayCalls.length = 0;
    // O evento ainda existe no Google e vem com timestamp mais recente.
    externalItems = [{
      id: "gcal-almeida", summary: "Visita com Sr. Almeida", status: "confirmed",
      start: { dateTime: isoTodayAt("11:00", 1) }, updated: new Date().toISOString(),
    }];

    await pullFromProvider(supabase, USER, "google_calendar");

    expect(["cancelado", "cancelada", "arquivado"]).toContain(String(db.follow_ups[0].status).toLowerCase());
    expect(gatewayCalls.some((c) => c.method === "DELETE" && c.path.includes("gcal-almeida"))).toBe(true);

    const items = await computePriorities(supabase, USER, { now: new Date(Date.now() + 86_400_000) });
    expect(items.find((i) => i.subject_id === FU)).toBeUndefined();
  });

  it("cancelar do lado do Google arquiva cá e mata os avisos internos", async () => {
    db.calendar_event_links[0].external_updated_at = new Date().toISOString();
    externalItems = [{
      id: "gcal-almeida", summary: "Visita com Sr. Almeida", status: "cancelled",
      start: { dateTime: isoTodayAt("11:00") }, updated: db.calendar_event_links[0].external_updated_at,
    }];

    await pullFromProvider(supabase, USER, "google_calendar");

    expect(db.follow_ups[0].status).toBe("cancelado");
    expect(db.follow_ups[0].archived_at).toBeTruthy();
    expect(db.reminders[0].status).toBe("cancelled");
    expect(db.calendar_event_links[0].deleted).toBe(true);

    const items = await computePriorities(supabase, USER, { now: new Date(Date.now() + 86_400_000) });
    expect(items.find((i) => i.subject_id === FU)).toBeUndefined();
  });

  it("quando o delta omite a remoção, confirma o evento ligado e cancela o fantasma", async () => {
    externalItems = [];
    missingExternalIds.add("gcal-almeida");

    await pullFromProvider(supabase, USER, "google_calendar");

    expect(db.follow_ups[0].status).toBe("cancelado");
    expect(db.follow_ups[0].archived_at).toBeTruthy();
    expect(db.reminders[0].status).toBe("cancelled");
    expect(db.calendar_event_links[0].deleted).toBe(true);
    expect(gatewayCalls.some((c) => c.method === "GET" && c.path.includes("gcal-almeida"))).toBe(true);
  });

  it("a ronda rápida (2 min) faz o delta sem esperar pela verificação", async () => {
    db.calendar_event_links[0].external_updated_at = new Date().toISOString();
    externalItems = [{
      id: "gcal-almeida", summary: "Visita com Sr. Almeida", status: "cancelled",
      start: { dateTime: isoTodayAt("11:00") }, updated: db.calendar_event_links[0].external_updated_at,
    }];
    gatewayCalls.length = 0;
    missingExternalIds.add("gcal-almeida");

    await pullFromProvider(supabase, USER, "google_calendar", { verify: false });

    // Cancelamento aplicado pelo delta, sem um único GET de verificação.
    expect(db.follow_ups[0].status).toBe("cancelado");
    expect(gatewayCalls.some((c) => c.method === "GET" && c.path.includes("events/gcal-almeida"))).toBe(false);
  });

  it("com rotação por fatias, apagar no Google continua a ser detectado numa volta", async () => {
    externalItems = [];
    missingExternalIds.add("gcal-almeida");
    const minha = sliceOf("gcal-almeida");

    // Fatia diferente: nada acontece nesta ronda.
    const outra = (minha + 1) % VERIFY_SLICES;
    await pullFromProvider(supabase, USER, "google_calendar", { verify: { slices: VERIFY_SLICES, index: outra } });
    expect(db.follow_ups[0].status).not.toBe("cancelado");

    // Ronda da fatia certa (dentro da volta de ~30 min): fantasma cancelado.
    await pullFromProvider(supabase, USER, "google_calendar", { verify: { slices: VERIFY_SLICES, index: minha } });
    expect(db.follow_ups[0].status).toBe("cancelado");
    expect(db.calendar_event_links[0].deleted).toBe(true);
  });
});
