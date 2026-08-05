// Cenário real de 05/08: "Limpa a minha agenda de hoje. Bom dia" + "Estou em
// viagem para Lisboa" + "Só volto 16:09" em 15 segundos, seguido de "Desmarca
// tudo. Não reagendes nada.".

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ambiguousCancelReply,
  formatCancelReply,
  matchByHint,
  CANCELLED_OUTCOME,
  CANCELLED_STATUS,
} from "./cancel-agenda";
import { selectBurst, mergeBurstContent } from "../channel-gateway/coalesce";
import { coalesceInboundText } from "../channel-gateway/coalesce.server";

const decideMock = vi.fn();

vi.mock("./think.server", () => ({
  think: vi.fn(async () => ({ ok: true, output: { hypotheses: [], recommended_searches: [] }, usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: 0 })),
}));
vi.mock("./search.server", () => ({ search: vi.fn(async () => ({})) }));
vi.mock("./decide.server", () => ({ decide: (...a: any[]) => decideMock(...a) }));
vi.mock("./safety-net.server", () => ({
  applySafetyNet: vi.fn(async (_ctx: any, o: any) => o.reply),
  buildArchiveContent: vi.fn((o: any) => o.trimmed),
  archiveToMiscellaneous: vi.fn(async () => undefined),
}));
vi.mock("./quality.server", () => ({
  computeQualitySignals: vi.fn(() => ({ aqs: 100 })),
  persistQualityScore: vi.fn(async () => undefined),
}));
vi.mock("./trust.server", () => ({
  computeATS: vi.fn(() => 100),
  computeContextPreservation: vi.fn(() => 100),
  computeSafeDecisions: vi.fn(() => 100),
  computeTaskSuccess: vi.fn(() => 100),
  persistTrustScore: vi.fn(async () => undefined),
}));
vi.mock("./shadow.server", () => ({ shouldRunShadow: () => false, runShadow: vi.fn() }));
vi.mock("./corrections.server", () => ({ looksLikeCorrection: () => false, captureCorrection: vi.fn(async () => null) }));
vi.mock("./reflection.server", () => ({ reflect: vi.fn(async () => undefined) }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({ insert: async () => ({ error: null }) }) },
}));
vi.mock("../memory.server", () => ({
  findActivePendingAction: vi.fn(async () => null),
  markPendingActionStatus: vi.fn(async () => undefined),
  createPendingAction: vi.fn(async () => ({ id: "p1" })),
}));

import { runReasoningEngine } from "./reasoning-engine.server";

const USER = "00000000-0000-4000-8000-000000000010";
const CHANNEL = "whatsapp";

// ---------- Base de dados falsa com follow_ups escrevíveis ----------

function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon" }).format(new Date());
}

function makeDb() {
  const messages: any[] = [];
  const follow_ups: any[] = [
    { id: "fu-1", user_id: USER, title: "Visita na Alameda da República - Sr. Duarte", due_date: today(), due_time: "11:00", status: "agendado", outcome: null },
    { id: "fu-2", user_id: USER, title: "Ligar a 5 contactos da esfera", due_date: today(), due_time: null, status: "agendado", outcome: null },
    { id: "fu-3", user_id: USER, title: "Reunião de angariação", due_date: today(), due_time: "16:30", status: "agendado", outcome: null },
    { id: "fu-4", user_id: USER, title: "Visita futura", due_date: "2099-01-01", due_time: "10:00", status: "agendado", outcome: null },
  ];
  const state: Record<string, any[]> = {
    follow_ups,
    assessor_messages: messages,
    profiles: [{ id: USER, name: "Júlio", assessor_name: "Afonso", onboarding_stage: "done" }],
  };

  function table(name: string) {
    const rows = state[name] ?? [];
    const filters: Array<(r: any) => boolean> = [];
    let mode: "select" | "update" | "insert" = "select";
    let payload: any = null;
    let orderKey: string | null = null;
    let asc = true;

    const run = () => {
      let out = rows.filter((r) => filters.every((f) => f(r)));
      if (mode === "update") {
        for (const r of out) Object.assign(r, payload);
        return out;
      }
      if (orderKey) {
        out = [...out].sort((a, b) => String(a[orderKey!] ?? "").localeCompare(String(b[orderKey!] ?? "")) * (asc ? 1 : -1));
      }
      return out;
    };

    const q: any = {
      select() { return q; },
      eq(c: string, v: any) { filters.push((r) => r[c] === v); return q; },
      neq(c: string, v: any) { filters.push((r) => r[c] !== v); return q; },
      in(c: string, v: any[]) { filters.push((r) => v.includes(r[c])); return q; },
      is(c: string, v: any) { filters.push((r) => (r[c] ?? null) === v); return q; },
      not() { return q; },
      gte(c: string, v: any) { filters.push((r) => String(r[c]) >= String(v)); return q; },
      lte(c: string, v: any) { filters.push((r) => String(r[c]) <= String(v)); return q; },
      order(c: string, o?: any) { orderKey = c; asc = !(o?.ascending === false); return q; },
      limit(n: number) { return Promise.resolve({ data: run().slice(0, n), error: null }); },
      maybeSingle() { return Promise.resolve({ data: run()[0] ?? null, error: null }); },
      single() { return Promise.resolve({ data: run()[0] ?? null, error: null }); },
      update(p: any) { mode = "update"; payload = p; return q; },
      insert: async (row: any) => { rows.push(row); return { data: null, error: null }; },
      upsert: async () => ({ error: null }),
      then(ok: any, err: any) { return Promise.resolve({ data: run(), error: null }).then(ok, err); },
    };
    return q;
  }

  return {
    follow_ups,
    messages,
    say(role: string, content: string, createdAt?: string) {
      messages.push({
        id: String(messages.length + 1), role, content,
        message_type: "whatsapp_text", channel: CHANNEL, user_id: USER,
        created_at: createdAt ?? new Date().toISOString(),
      });
      return messages[messages.length - 1];
    },
    supabase: { from: (n: string) => table(n) } as any,
  };
}

describe("1. capacidade de desmarcar (cancel_follow_up)", () => {
  it("desmarca os 3 itens de hoje e não toca no futuro", async () => {
    const db = makeDb();
    const { TOOL_REGISTRY } = await import("../v2/domain.server");
    const r = await TOOL_REGISTRY["cancel_follow_up"]!(
      { supabase: db.supabase, userId: USER, channel: CHANNEL },
      { period: "today", all_in_period: true, reason: "Desmarca tudo. Não reagendes nada." },
    );
    expect(r.ok).toBe(true);
    expect((r.data as any).cancelled).toBe(3);
    const byId = Object.fromEntries(db.follow_ups.map((f) => [f.id, f]));
    for (const id of ["fu-1", "fu-2", "fu-3"]) {
      expect(byId[id].status).toBe(CANCELLED_STATUS);
      expect(byId[id].outcome).toBe(CANCELLED_OUTCOME);
    }
    expect(byId["fu-4"].status).toBe("agendado");
  });

  it("pedido por assunto desmarca só esse", async () => {
    const db = makeDb();
    const { TOOL_REGISTRY } = await import("../v2/domain.server");
    const r = await TOOL_REGISTRY["cancel_follow_up"]!(
      { supabase: db.supabase, userId: USER, channel: CHANNEL },
      { period: "today", subject_hint: "visita ao Sr. Duarte" },
    );
    expect((r.data as any).cancelled).toBe(1);
    expect(db.follow_ups.find((f) => f.id === "fu-1")!.status).toBe(CANCELLED_STATUS);
    expect(db.follow_ups.find((f) => f.id === "fu-2")!.status).toBe("agendado");
  });

  it("sem indicação nenhuma não desmarca nada", async () => {
    const db = makeDb();
    const { TOOL_REGISTRY } = await import("../v2/domain.server");
    const r = await TOOL_REGISTRY["cancel_follow_up"]!(
      { supabase: db.supabase, userId: USER, channel: CHANNEL }, {},
    );
    expect(r.ok).toBe(false);
    expect(db.follow_ups.every((f) => f.status === "agendado")).toBe(true);
  });

  it("frase só afirma o que foi escrito", () => {
    expect(formatCancelReply([], "hoje")).toMatch(/não tinhas nada/i);
    expect(formatCancelReply([{ id: "a", title: "Visita ao Sr. Duarte" }])).toMatch(/desmarquei/i);
    const many = formatCancelReply(
      [{ id: "a", title: "Visita", due_time: "11:00" }, { id: "b", title: "Reunião" }], "hoje",
    );
    expect(many).toContain("Desmarquei 2 coisas hoje:");
    expect(matchByHint([{ id: "a", title: "Visita ao Sr. Duarte" }], "duarte")).toHaveLength(1);
    expect(ambiguousCancelReply([{ id: "a", title: "Visita" }, { id: "b", title: "Visita 2" }])).toMatch(/qual delas/i);
  });
});

describe("2. guarda: act sem ferramenta nunca diz 'Feito'", () => {
  beforeEach(() => decideMock.mockReset());

  it("substitui a confirmação vazia por um pedido de esclarecimento", async () => {
    const db = makeDb();
    decideMock.mockResolvedValue({
      ok: true,
      decision: { confidence: 0.9, action: "act", tool_calls: [], memory_writes: [], natural_reply: "Feito." },
      usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: 0,
    });
    const out = await runReasoningEngine({
      supabase: db.supabase, userId: USER, channel: CHANNEL,
      content: "Desmarca tudo. Não reagendes nada.",
    } as any);
    expect(out.reply).not.toMatch(/^feito/i);
    expect(out.reply).toMatch(/não cheguei a mexer|o que queres/i);
    expect(db.follow_ups.every((f) => f.status === "agendado")).toBe(true);
  });
});

describe("3. coalescência de mensagens rápidas", () => {
  it("junta a rajada por ordem de chegada e pára na resposta anterior", () => {
    const t = (s: number) => new Date(Date.UTC(2026, 7, 5, 7, 3, s)).toISOString();
    const rows = [
      { id: "a0", role: "assistant", content: "Bom dia.", created_at: t(0), message_type: "whatsapp_text" },
      { id: "m1", role: "user", content: "Limpa a minha agenda de hoje. Bom dia", created_at: t(45), message_type: "whatsapp_text" },
      { id: "m2", role: "user", content: "Estou em viagem para Lisboa", created_at: t(52), message_type: "whatsapp_text" },
      { id: "m3", role: "user", content: "Só volto 16:09", created_at: t(59), message_type: "whatsapp_text" },
    ];
    const burst = selectBurst(rows, "m3");
    expect(burst.map((b) => b.id)).toEqual(["m1", "m2", "m3"]);
    expect(mergeBurstContent(burst, "")).toBe(
      "Limpa a minha agenda de hoje. Bom dia\nEstou em viagem para Lisboa\nSó volto 16:09",
    );
    // A primeira mensagem sozinha não arrasta o passado do assessor.
    expect(selectBurst(rows, "m1").map((b) => b.id)).toEqual(["m1"]);
  });

  it("mensagem intermédia cala-se em favor da mais recente", async () => {
    const db = makeDb();
    const base = Date.now();
    db.say("user", "Limpa a minha agenda de hoje. Bom dia", new Date(base).toISOString());
    db.say("user", "Estou em viagem para Lisboa", new Date(base + 7000).toISOString());

    const yielded = await coalesceInboundText(db.supabase, {
      userId: USER, channel: CHANNEL, currentMessageId: "1",
      fallbackContent: "Limpa a minha agenda de hoje. Bom dia",
      settleMs: 0, sleep: async () => undefined,
    });
    expect(yielded.yield).toBe(true);

    const last = await coalesceInboundText(db.supabase, {
      userId: USER, channel: CHANNEL, currentMessageId: "2",
      fallbackContent: "Estou em viagem para Lisboa",
      settleMs: 0, sleep: async () => undefined,
    });
    expect(last.yield).toBe(false);
    if (!last.yield) {
      expect(last.merged).toBe(2);
      expect(last.content).toContain("Limpa a minha agenda");
      expect(last.content).toContain("viagem para Lisboa");
    }
  });
});