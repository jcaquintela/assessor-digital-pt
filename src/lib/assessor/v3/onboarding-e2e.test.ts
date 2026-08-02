// E2E do arranque leve: conta nova a falar com o Afonso, turno a turno.
// Verifica a regra que interessa ao consultor — o pedido real é sempre
// tratado primeiro; as 2 perguntas só aparecem numa pausa natural.

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Dobros dos passos caros do motor (IA, ferramentas, telemetria) ──────
const decideMock = vi.fn();
const execToolsMock = vi.fn();

vi.mock("./think.server", () => ({
  think: vi.fn(async () => ({
    ok: true,
    output: { hypotheses: [], recommended_searches: [] },
    usage: { inputTokens: 0, outputTokens: 0 },
    latencyMs: 0,
  })),
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
vi.mock("./corrections.server", () => ({
  looksLikeCorrection: () => false,
  captureCorrection: vi.fn(async () => null),
}));
vi.mock("./reflection.server", () => ({ reflect: vi.fn(async () => undefined) }));
vi.mock("../memory.server", () => ({
  findActivePendingAction: vi.fn(async () => null),
  markPendingActionStatus: vi.fn(async () => undefined),
}));
vi.mock("../v2/domain.server", () => ({ TOOL_REGISTRY: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({ insert: async () => ({ error: null }) }) },
}));

import { runReasoningEngine } from "./reasoning-engine.server";
import { GOALS_QUESTION, GOALS_SAVED_REPLY } from "./onboarding";

const USER = "00000000-0000-4000-8000-000000000001";
const CHANNEL = "telegram";

// ── Base de dados em memória, só com o que o motor toca ─────────────────
type Msg = { role: string; content: string; created_at: string; id: string };

function makeDb() {
  const profile: Record<string, any> = {
    id: USER,
    name: "Rui Costa",
    assessor_name: "Afonso",
    onboarding_stage: "not_started",
    onboarding_offers: 0,
    onboarding_last_offer_at: null,
    onboarding_goals: null,
  };
  const messages: Msg[] = [];

  const table = (name: string) => {
    const rows = () => (name === "profiles" ? [profile] : name === "assessor_messages" ? messages : []);
    const q: any = {
      _rows: rows(),
      select() { return q; },
      eq() { return q; },
      order() { q._rows = [...q._rows].reverse(); return q; },
      limit(n: number) { return Promise.resolve({ data: q._rows.slice(0, n), error: null }); },
      maybeSingle() { return Promise.resolve({ data: q._rows[0] ?? null, error: null }); },
      update(patch: Record<string, any>) {
        if (name === "profiles") Object.assign(profile, patch);
        return { eq: async () => ({ error: null }) };
      },
      insert: async () => ({ data: null, error: null }),
      upsert: async () => ({ error: null }),
    };
    return q;
  };

  return {
    profile,
    messages,
    say(role: string, content: string) {
      messages.push({ role, content, created_at: new Date().toISOString(), id: String(messages.length + 1) });
    },
    supabase: { from: (n: string) => table(n) } as any,
  };
}

function decideAs(action: string, reply: string, toolCalls: any[] = []) {
  decideMock.mockResolvedValueOnce({
    ok: true,
    decision: { confidence: 0.9, action, tool_calls: toolCalls, memory_writes: [], natural_reply: reply },
    usage: { inputTokens: 0, outputTokens: 0 },
    latencyMs: 0,
  });
}

async function turn(db: ReturnType<typeof makeDb>, content: string) {
  db.say("user", content);
  const out = await runReasoningEngine({
    supabase: db.supabase, userId: USER, channel: CHANNEL, content,
  } as any);
  db.say("assistant", out.reply);
  return out.reply;
}

describe("E2E — conta nova: pedido real primeiro, perguntas depois", () => {
  beforeEach(() => {
    decideMock.mockReset();
    execToolsMock.mockReset();
    execToolsMock.mockResolvedValue([{ name: "create_follow_up", ok: true, data: {} }]);
  });

  it("não interrompe o primeiro pedido real com as perguntas de arranque", async () => {
    const db = makeDb();
    decideAs("act", "Feito.", [{ name: "create_follow_up", arguments: {} }]);

    const reply = await turn(db, "liga à Marta amanhã às 10h");

    expect(reply).not.toMatch(/como preferes chamar-me/i);
    expect(reply).not.toContain(GOALS_QUESTION);
    expect(db.profile.onboarding_stage).toBe("not_started");
  });

  it("também não pergunta quando a própria resposta já traz uma pergunta", async () => {
    const db = makeDb();
    decideAs("ask", "De que Marta falas?");

    const reply = await turn(db, "marca com a Marta");

    expect(reply).not.toMatch(/como preferes chamar-me/i);
    expect(db.profile.onboarding_stage).toBe("not_started");
  });

  it("oferece o nome numa pausa natural e só depois os objetivos", async () => {
    const db = makeDb();

    // 1) pedido real — nada de perguntas
    decideAs("act", "Feito.", [{ name: "create_follow_up", arguments: {} }]);
    const first = await turn(db, "liga à Marta amanhã às 10h");
    expect(first).not.toMatch(/como preferes chamar-me/i);

    // 2) pausa natural — aqui sim, a 1ª pergunta
    execToolsMock.mockResolvedValue([]);
    decideAs("acknowledge", "De nada.");
    const second = await turn(db, "obrigado");
    expect(second).toMatch(/como preferes chamar-me/i);
    expect(db.profile.onboarding_stage).toBe("name_asked");

    // 3) resposta ao nome → grava e encadeia a 2ª pergunta
    const third = await turn(db, "Rui");
    expect(db.profile.assessor_name).toBe("Rui");
    expect(third).toContain(GOALS_QUESTION);
    expect(db.profile.onboarding_stage).toBe("goals_asked");

    // 4) objetivos em texto livre → guardados, arranque concluído
    const fourth = await turn(db, "sobretudo não perder nenhum contacto");
    expect(fourth).toBe(GOALS_SAVED_REPLY);
    expect(db.profile.onboarding_goals).toContain("não perder");
    expect(db.profile.onboarding_stage).toBe("done");

    // 5) já não volta a perguntar
    decideAs("acknowledge", "Combinado.");
    const fifth = await turn(db, "boa");
    expect(fifth).not.toMatch(/como preferes chamar-me/i);
    expect(fifth).not.toContain(GOALS_QUESTION);
  });

  it("um pedido real em vez de resposta ao nome é tratado primeiro e não insiste", async () => {
    const db = makeDb();
    execToolsMock.mockResolvedValue([]);
    decideAs("acknowledge", "Certo.");
    const opener = await turn(db, "olá");
    expect(opener).toMatch(/como preferes chamar-me/i);

    decideAs("act", "Feito.", [{ name: "create_prospecting_lead", arguments: {} }]);
    execToolsMock.mockResolvedValue([{ name: "create_follow_up", ok: true, data: {} }]);
    const work = await turn(db, "regista a placa da Avenida de Roma");

    expect(work).not.toMatch(/como preferes chamar-me/i);
    expect(work).not.toContain(GOALS_QUESTION);
    expect(db.profile.onboarding_stage).toBe("skipped");
    expect(db.profile.assessor_name).toBe("Afonso");
  });
});
