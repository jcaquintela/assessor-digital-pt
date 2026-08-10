// E2E do fluxo real de feedback em vários turnos:
// "Posso dar uma sugestão de melhoria?" → "sim, diz" → corpo → confirmação → gravado.

import { beforeEach, describe, expect, it, vi } from "vitest";

const decideMock = vi.fn();
const execToolsMock = vi.fn();

vi.mock("./think.server", () => ({
  think: vi.fn(async () => ({ ok: true, output: { hypotheses: [], recommended_searches: [] }, usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: 0 })),
}));
vi.mock("./search.server", () => ({ search: vi.fn(async () => ({})) }));
vi.mock("./decide.server", () => ({ decide: (...a: any[]) => decideMock(...a) }));
vi.mock("./act.server", () => ({
  executeToolCalls: (...a: any[]) => execToolsMock(...a),
  applyMemoryWrites: vi.fn(async () => undefined),
}));
vi.mock("./safety-net.server", () => ({
  applySafetyNet: vi.fn(async (_ctx: any, o: any) => o.reply),
  buildArchiveContent: vi.fn((o: any) => o.trimmed),
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
vi.mock("../v2/domain.server", () => ({ TOOL_REGISTRY: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({ insert: async () => ({ error: null }) }) },
}));

// pending_actions em memória, partilhado entre o motor e este teste.
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
    for (const p of pendings) if (p.status === "pending_confirmation" || p.status === "collecting_information") p.status = "cancelled";
    const row = {
      id: String(pendings.length + 1),
      intent: input.intent,
      status: "pending_confirmation",
      structured_payload: input.payload,
      original_content: input.originalContent,
    };
    pendings.push(row);
    return row;
  }),
}));

import { runReasoningEngine } from "./reasoning-engine.server";
import { fetchProductFeedbackList } from "@/lib/admin/feedback-list.server";

const USER = "00000000-0000-4000-8000-000000000009";
const CHANNEL = "whatsapp";

const saved: any[] = [];

function makeDb() {
  const profile: Record<string, any> = { id: USER, name: "Júlio", assessor_name: "Afonso", onboarding_stage: "done" };
  const messages: any[] = [];
  const table = (name: string) => {
    const q: any = {
      _rows: name === "profiles" ? [profile] : name === "assessor_messages" ? messages : [],
      select() { return q; },
      eq() { return q; },
      is() { return q; },
      not() { return q; },
      in() { return q; },
      order() { q._rows = [...q._rows].reverse(); return q; },
      limit(n: number) { return Promise.resolve({ data: q._rows.slice(0, n), error: null }); },
      maybeSingle() { return Promise.resolve({ data: q._rows[0] ?? null, error: null }); },
      update() { return { eq: async () => ({ error: null }) }; },
      insert: async (row: any) => { if (name === "product_feedback") saved.push(row); return { data: null, error: null }; },
      upsert: async () => ({ error: null }),
    };
    return q;
  };
  return {
    messages,
    say(role: string, content: string) { messages.push({ role, content, created_at: new Date().toISOString(), id: String(messages.length + 1) }); },
    supabase: { from: (n: string) => table(n) } as any,
  };
}


// Fake supabaseAdmin que devolve exatamente o que ficou gravado no fluxo acima,
// para verificar que o registo chega à listagem de /admin/feedback.
function makeAdmin() {
  const rows = saved.map((r, i) => ({
    id: `feedback-${i + 1}`,
    status: "novo",
    channel: CHANNEL,
    internal_note: null,
    handled_at: null,
    attachment_file_id: null,
    created_at: new Date().toISOString(),
    ...r,
  }));
  return {
    from(name: string) {
      if (name === "product_feedback") {
        return {
          select: () => ({ order: () => ({ limit: async () => ({ data: rows, error: null }) }) }),
        };
      }
      if (name === "profiles") {
        return {
          select: () => ({
            in: async () => ({ data: [{ id: USER, name: "Júlio", email: "julio@example.com" }] }),
          }),
        };
      }
      return { select: () => ({ in: async () => ({ data: [] }) }) };
    },
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null }) }) },
  };
}

async function turn(db: ReturnType<typeof makeDb>, content: string) {
  db.say("user", content);
  const out = await runReasoningEngine({ supabase: db.supabase, userId: USER, channel: CHANNEL, content } as any);
  db.say("assistant", out.reply);
  return out.reply as string;
}

describe("E2E — sugestão anunciada num turno e escrita no seguinte", () => {
  beforeEach(() => {
    pendings.length = 0;
    saved.length = 0;
    decideMock.mockReset();
    execToolsMock.mockReset();
    execToolsMock.mockResolvedValue([]);
    decideMock.mockResolvedValue({
      ok: true,
      decision: { confidence: 0.9, action: "acknowledge", tool_calls: [], memory_writes: [], natural_reply: "Certo." },
      usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: 0,
    });
  });

  it("padrão real: anúncio → 'sim, diz' → corpo → confirmação → gravado", async () => {
    const db = makeDb();

    const r1 = await turn(db, "Posso dar uma sugestão de melhoria?");
    expect(r1).toMatch(/diz/i);
    expect(pendings[0].intent).toBe("collecting_feedback");

    const r2 = await turn(db, "sim, diz");
    expect(r2).toMatch(/guardado/i);

    const r3 = await turn(db, "no Drive os ficheiros deviam ficar agrupados por imóvel automaticamente");
    expect(r3).toMatch(/Guardo isto como sugest/i);

    const r4 = await turn(db, "sim");
    expect(r4).toMatch(/Guardei a sugest/i);
    expect(saved).toHaveLength(1);
    expect(saved[0].kind).toBe("suggestion");
    expect(saved[0].body).toContain("Drive");
    expect(saved[0].user_id).toBe(USER);

    // O que o admin (/admin/feedback) vê a seguir.
    const admin = makeAdmin();
    const list = await fetchProductFeedbackList(admin);
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({
      kind: "suggestion",
      status: "novo",
      user_id: USER,
      consultant_name: "Júlio",
    });
    expect(list.items[0].body).toContain("Drive");
  });
});
