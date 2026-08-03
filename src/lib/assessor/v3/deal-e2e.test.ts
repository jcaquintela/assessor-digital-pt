// E2E do fluxo de Negócio no motor v3:
// proposta (memory_write propose_deal) → "sim" → negócio criado, sem duplicar.

import { beforeEach, describe, expect, it, vi } from "vitest";

const decideMock = vi.fn();
const createDealExec = vi.fn();

vi.mock("./think.server", () => ({
  think: vi.fn(async () => ({ ok: true, output: { hypotheses: [], recommended_searches: [] }, usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: 0 })),
}));
vi.mock("./search.server", () => ({ search: vi.fn(async () => ({})) }));
vi.mock("./decide.server", () => ({ decide: (...a: any[]) => decideMock(...a) }));
vi.mock("./act.server", () => ({
  executeToolCalls: vi.fn(async () => []),
  // Só interessa aqui o efeito real: propose_deal deixa um pendente por confirmar.
  applyMemoryWrites: vi.fn(async (_ctx: any, writes: any[]) => {
    for (const w of writes ?? []) {
      if (w.key === "propose_deal") {
        pendings.push({
          id: String(pendings.length + 1),
          intent: "create_deal",
          status: "pending_confirmation",
          structured_payload: w.value,
          original_content: "",
          created_at: new Date().toISOString(),
        });
      }
    }
  }),
}));
vi.mock("./safety-net.server", () => ({
  applySafetyNet: vi.fn(async (_ctx: any, o: any) => o.reply),
  buildArchiveContent: vi.fn((o: any) => o.trimmed),
}));
vi.mock("./quality.server", () => ({ computeQualitySignals: vi.fn(() => ({ aqs: 100 })), persistQualityScore: vi.fn(async () => undefined) }));
vi.mock("./trust.server", () => ({
  computeATS: vi.fn(() => 100), computeContextPreservation: vi.fn(() => 100),
  computeSafeDecisions: vi.fn(() => 100), computeTaskSuccess: vi.fn(() => 100),
  persistTrustScore: vi.fn(async () => undefined),
}));
vi.mock("./shadow.server", () => ({ shouldRunShadow: () => false, runShadow: vi.fn() }));
vi.mock("./corrections.server", () => ({ looksLikeCorrection: () => false, captureCorrection: vi.fn(async () => null) }));
vi.mock("./reflection.server", () => ({ reflect: vi.fn(async () => undefined) }));
vi.mock("../v2/domain.server", () => ({ TOOL_REGISTRY: { create_deal: (...a: any[]) => createDealExec(...a) } }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({ insert: async () => ({ error: null }) }) },
}));

const pendings: any[] = [];
vi.mock("../memory.server", () => ({
  findActivePendingAction: vi.fn(async () =>
    [...pendings].reverse().find((p) => ["pending_confirmation", "collecting_information"].includes(p.status)) ?? null,
  ),
  markPendingActionStatus: vi.fn(async (_s: any, id: string, status: string) => {
    const row = pendings.find((p) => p.id === id);
    if (row) row.status = status;
  }),
  createPendingAction: vi.fn(async (_s: any, input: any) => {
    const row = {
      id: String(pendings.length + 1),
      intent: input.intent,
      status: "pending_confirmation",
      structured_payload: input.payload,
      original_content: input.originalContent,
      created_at: new Date().toISOString(),
    };
    pendings.push(row);
    return row;
  }),
}));

import { runReasoningEngine } from "./reasoning-engine.server";

const USER = "00000000-0000-4000-8000-000000000011";
const CHANNEL = "whatsapp";

function makeDb() {
  const profile: Record<string, any> = { id: USER, name: "Júlio", assessor_name: "Afonso", onboarding_stage: "done" };
  const messages: any[] = [];
  const table = (name: string) => {
    const q: any = {
      _rows: name === "profiles" ? [profile] : name === "assessor_messages" ? messages : [],
      select() { return q; }, eq() { return q; }, is() { return q; }, not() { return q; }, in() { return q; },
      order() { q._rows = [...q._rows].reverse(); return q; },
      limit(n: number) { return Promise.resolve({ data: q._rows.slice(0, n), error: null }); },
      maybeSingle() { return Promise.resolve({ data: q._rows[0] ?? null, error: null }); },
      update() { return { eq: async () => ({ error: null }) }; },
      insert: async () => ({ data: null, error: null }),
      upsert: async () => ({ error: null }),
    };
    return q;
  };
  return {
    say(role: string, content: string) { messages.push({ role, content, created_at: new Date().toISOString(), id: String(messages.length + 1) }); },
    supabase: { from: (n: string) => table(n) } as any,
  };
}

async function turn(db: ReturnType<typeof makeDb>, content: string) {
  db.say("user", content);
  const out = await runReasoningEngine({ supabase: db.supabase, userId: USER, channel: CHANNEL, content } as any);
  db.say("assistant", out.reply);
  return out.reply as string;
}

describe("E2E — negócio proposto e só criado depois do sim", () => {
  beforeEach(() => {
    pendings.length = 0;
    decideMock.mockReset();
    createDealExec.mockReset();
    createDealExec.mockResolvedValue({
      ok: true,
      data: { id: "deal-1", title: "Venda da moradia em Canelas", duplicate: false, linkedMovements: 1 },
    });
  });

  it("propõe primeiro, cria só na confirmação e liga a comissão", async () => {
    const db = makeDb();
    decideMock.mockResolvedValue({
      ok: true,
      decision: {
        confidence: 0.9, action: "ask", tool_calls: [],
        memory_writes: [{ scope: "operational", key: "propose_deal", value: { title: "Venda da moradia em Canelas", kind: "venda", person_id: "p1", property_id: "im1" } }],
        natural_reply: "Vou abrir o negócio \"Venda da moradia em Canelas\". Confirmas?",
      },
      usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: 0,
    });

    const r1 = await turn(db, "fiquei com a angariação da moradia da Ana em Canelas");
    expect(r1).toMatch(/Confirmas/i);
    expect(createDealExec).not.toHaveBeenCalled();
    expect(pendings[0].intent).toBe("create_deal");

    const r2 = await turn(db, "sim");
    expect(createDealExec).toHaveBeenCalledTimes(1);
    expect(r2).toMatch(/negócio/i);
    expect(r2).toMatch(/comiss/i);
    expect(pendings[0].status).toBe("executed");
  });

  it("não cria nada se o consultor disser que não", async () => {
    const db = makeDb();
    decideMock.mockResolvedValue({
      ok: true,
      decision: {
        confidence: 0.9, action: "ask", tool_calls: [],
        memory_writes: [{ scope: "operational", key: "propose_deal", value: { title: "Venda do T3", kind: "venda", property_id: "im2" } }],
        natural_reply: "Abro o negócio \"Venda do T3\"?",
      },
      usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: 0,
    });
    const db2 = db;
    await turn(db2, "vou tratar do T3 do Sr. Costa");
    const r = await turn(db2, "não");
    expect(createDealExec).not.toHaveBeenCalled();
    expect(r).toMatch(/não abri/i);
    expect(pendings[0].status).toBe("cancelled");
  });

  it("avisa quando o negócio já existia em vez de duplicar", async () => {
    createDealExec.mockResolvedValue({
      ok: true,
      data: { id: "deal-1", title: "Venda da moradia em Canelas", duplicate: true, linkedMovements: 0 },
    });
    const db = makeDb();
    decideMock.mockResolvedValue({
      ok: true,
      decision: {
        confidence: 0.9, action: "ask", tool_calls: [],
        memory_writes: [{ scope: "operational", key: "propose_deal", value: { title: "Venda da moradia em Canelas", kind: "venda", property_id: "im1" } }],
        natural_reply: "Abro o negócio?",
      },
      usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: 0,
    });
    const db3 = db;
    await turn(db3, "a moradia da Ana");
    const r = await turn(db3, "sim");
    expect(r).toMatch(/já tinhas/i);
  });
});
