// Testes de CARACTERIZAÇÃO do motor v3 — cauda do turno.
//
// Fotografam o que acontece DEPOIS do ACT: tom da resposta, rede de segurança
// (Diversos), registo do trace, AQS, ATS, reflexão, ofertas de arranque e de
// perfil "por gotas", e a âncora de pergunta aberta.
//
// Se algum destes testes ficar vermelho durante a divisão do motor em
// módulos, houve mudança de comportamento — investiga-se, não se ajusta.

import { beforeEach, describe, expect, it, vi } from "vitest";

const decideMock = vi.fn();
const thinkMock = vi.fn();
const executeToolCallsMock = vi.fn(async (..._a: any[]) => [] as any[]);
const applySafetyNetMock = vi.fn(async (_c: any, o: any) => o.reply as string);
const persistQualityScore = vi.fn(async () => undefined);
const persistTrustScore = vi.fn(async () => undefined);
const reflectMock = vi.fn(async (..._a: any[]) => undefined);
const runShadowMock = vi.fn();
const shouldRunShadowMock = vi.fn(() => false);
const recordOpenQuestion = vi.fn(async () => undefined);
const markOnboardingOffered = vi.fn(async () => undefined);
const nextProfileQuestionMock = vi.fn(() => null as any);
const loadOnboardingStateMock = vi.fn(async () => ({
  stage: "done", offers: 2, lastOfferAt: null, goals: null,
}));
let aqsScore = 1;

vi.mock("./think.server", () => ({ think: (...a: any[]) => thinkMock(...a) }));
vi.mock("./search.server", () => ({ search: vi.fn(async () => ({})) }));
vi.mock("./decide.server", () => ({ decide: (...a: any[]) => decideMock(...a) }));
vi.mock("./act.server", () => ({
  executeToolCalls: (...a: any[]) => executeToolCallsMock(...(a as [])),
  applyMemoryWrites: vi.fn(async () => undefined),
}));
vi.mock("./safety-net.server", () => ({
  applySafetyNet: (...a: any[]) => applySafetyNetMock(...(a as [any, any])),
  buildArchiveContent: (o: any) => o.trimmed,
  archiveToMiscellaneous: vi.fn(async () => true),
}));
vi.mock("./quality.server", () => ({
  computeQualitySignals: vi.fn(() => ({ score: aqsScore })),
  persistQualityScore: (...a: any[]) => persistQualityScore(...(a as [])),
}));
vi.mock("./trust.server", () => ({
  computeATS: vi.fn(() => 100),
  computeContextPreservation: vi.fn(() => 1),
  computeSafeDecisions: vi.fn(() => 1),
  computeTaskSuccess: vi.fn(() => 1),
  persistTrustScore: (...a: any[]) => persistTrustScore(...(a as [])),
}));
vi.mock("./shadow.server", () => ({
  shouldRunShadow: () => shouldRunShadowMock(),
  runShadow: (...a: any[]) => runShadowMock(...a),
}));
vi.mock("./corrections.server", () => ({
  looksLikeCorrection: () => false,
  captureCorrection: vi.fn(async () => null),
}));
vi.mock("./reflection.server", () => ({ reflect: (...a: any[]) => reflectMock(...(a as [])) }));
vi.mock("./sparring-state.server", () => ({
  readSparringState: vi.fn(async () => null),
  setSparringTopic: vi.fn(async () => undefined),
  stopSparring: vi.fn(async () => undefined),
}));
vi.mock("./proactivity.server", () => ({
  resolveLatestDocumentNudgeAnswer: vi.fn(async () => ({ resolved: false })),
}));
vi.mock("./onboarding.server", () => ({
  loadOnboardingState: (...a: any[]) => loadOnboardingStateMock(...(a as [])),
  markOnboardingOffered: (...a: any[]) => markOnboardingOffered(...(a as [])),
  saveAssessorName: vi.fn(async () => undefined),
  saveOnboardingGoals: vi.fn(async () => undefined),
  setOnboardingStage: vi.fn(async () => undefined),
}));
vi.mock("./profile-drip.server", () => ({
  findProfileQuestion: vi.fn(async () => null),
  closeProfileQuestion: vi.fn(async () => undefined),
  loadProfileDripState: vi.fn(async () => ({ asked: [], lastAskedAt: null })),
  saveProfileAnswer: vi.fn(async () => undefined),
  registerProfileRefusal: vi.fn(async () => undefined),
  markProfileQuestionAsked: vi.fn(async () => undefined),
  recordProfileQuestion: vi.fn(async () => undefined),
  isCalmDay: vi.fn(async () => true),
}));
vi.mock("./profile-drip", async (orig) => ({
  ...(await (orig as any)()),
  nextProfileQuestion: (...a: any[]) => nextProfileQuestionMock(...(a as [])),
}));
vi.mock("./open-question.server", () => ({
  recordOpenQuestion: (...a: any[]) => recordOpenQuestion(...(a as [])),
}));
vi.mock("@/lib/prospecting/script-offer.server", () => ({
  resolveScriptPending: vi.fn(async () => null),
  appendScriptOffer: vi.fn(async (_c: any, o: any) => o.reply),
}));
vi.mock("@/lib/assessor/outcome-intent", () => ({ detectOutcomeFromText: () => null }));
vi.mock("../v2/domain.server", () => ({
  TOOL_REGISTRY: new Proxy({}, {
    get: () => vi.fn(async () => ({ ok: false, error: "no_match" })),
    has: () => true,
  }),
}));
vi.mock("../memory.server", () => ({
  findActivePendingAction: vi.fn(async () => null),
  markPendingActionStatus: vi.fn(async () => undefined),
  createPendingAction: vi.fn(async () => ({ id: "1" })),
  updatePendingActionPayload: vi.fn(async () => undefined),
  findRecentExpiredConfirmation: vi.fn(async () => null),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({ insert: async () => ({ error: null }) }) },
}));

import { runReasoningEngine } from "./reasoning-engine.server";
import { NATURAL_FALLBACKS } from "../culture/sanitize";

const USER = "00000000-0000-4000-8000-0000000000c2";
const CHANNEL = "whatsapp";
const MSG = "o Sr. Costa quer vender a moradia na primavera";

function makeDb() {
  const profile = { id: USER, name: "Júlio", assessor_name: "Afonso" };
  const messages: any[] = [];
  const writes: Array<{ table: string; op: string; row: any }> = [];
  const chain = (table: string, rows: any[]) => {
    let data = rows;
    const q: any = {
      select: () => q, eq: () => q, is: () => q, not: () => q, in: () => q,
      ilike: () => q, gte: () => q, lte: () => q, or: () => q,
      order: () => { data = [...data].reverse(); return q; },
      limit: (n: number) => Promise.resolve({ data: data.slice(0, n), error: null }),
      maybeSingle: () => Promise.resolve({ data: data[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: data[0] ?? null, error: null }),
      then: (res: any) => Promise.resolve({ data, error: null }).then(res),
      insert: (row: any) => { writes.push({ table, op: "insert", row }); return chain(table, [{ id: `${table}-1` }]); },
      update: (row: any) => { writes.push({ table, op: "update", row }); return chain(table, data); },
      upsert: (row: any) => { writes.push({ table, op: "upsert", row }); return chain(table, data); },
      delete: () => chain(table, data),
    };
    return q;
  };
  return {
    writes,
    say(role: string, content: string) {
      messages.push({ role, content, created_at: new Date().toISOString(), id: String(messages.length + 1) });
    },
    supabase: {
      from: (n: string) => chain(n, n === "profiles" ? [profile] : n === "assessor_messages" ? messages : []),
    } as any,
  };
}

function setDecide(over: Partial<any> = {}, extra: Partial<any> = {}) {
  decideMock.mockResolvedValue({
    ok: true,
    decision: {
      confidence: 0.9, action: "acknowledge", tool_calls: [], memory_writes: [],
      natural_reply: "Certo.", ...over,
    },
    usage: { inputTokens: 10, outputTokens: 5 }, latencyMs: 3, ...extra,
  });
}

async function turn(db: ReturnType<typeof makeDb>, content = MSG) {
  db.say("user", content);
  const out = await runReasoningEngine({
    supabase: db.supabase, userId: USER, channel: CHANNEL, content,
  } as any);
  db.say("assistant", out.reply);
  return out.reply as string;
}

beforeEach(() => {
  vi.clearAllMocks();
  aqsScore = 1;
  shouldRunShadowMock.mockReturnValue(false);
  nextProfileQuestionMock.mockReturnValue(null);
  loadOnboardingStateMock.mockResolvedValue({ stage: "done", offers: 2, lastOfferAt: null, goals: null } as any);
  applySafetyNetMock.mockImplementation(async (_c: any, o: any) => o.reply);
  executeToolCallsMock.mockResolvedValue([]);
  thinkMock.mockResolvedValue({
    ok: true, output: { hypotheses: [], recommended_searches: [] },
    usage: { inputTokens: 4, outputTokens: 2 }, latencyMs: 1,
  });
  setDecide();
});

describe("caracterização — rede de segurança no fim do turno", () => {
  it("turno sem execução e sem compreensão vai para Diversos como 'not_understood'", async () => {
    setDecide({ natural_reply: "Não percebi bem essa parte." });
    await turn(makeDb());
    expect(applySafetyNetMock).toHaveBeenCalledTimes(1);
    expect(applySafetyNetMock.mock.calls[0][1].outcome).toBe("not_understood");
  });

  it("IA indisponível é 'service_down', não incompreensão", async () => {
    setDecide({ natural_reply: "" }, { ok: false, unavailable: true, error: "rate_limit" });
    const reply = await turn(makeDb());
    expect(applySafetyNetMock.mock.calls[0][1].outcome).toBe("service_down");
    expect(reply).toBe(NATURAL_FALLBACKS.aiDown);
  });

  it("ferramenta executada com sucesso não arquiva nada", async () => {
    setDecide({ action: "act", tool_calls: [{ name: "create_follow_up", arguments: {} }], natural_reply: "Feito." });
    executeToolCallsMock.mockResolvedValue([{ name: "create_follow_up", ok: true, latencyMs: 1, data: {} }]);
    await turn(makeDb());
    expect(applySafetyNetMock.mock.calls[0][1].outcome).toBe("executed_ok");
  });

  it("ferramenta falhada arquiva com o motivo técnico", async () => {
    setDecide({ action: "act", tool_calls: [{ name: "create_follow_up", arguments: {} }], natural_reply: "Feito." });
    executeToolCallsMock.mockResolvedValue([{ name: "create_follow_up", ok: false, error: "rls", latencyMs: 1 }]);
    const reply = await turn(makeDb());
    expect(applySafetyNetMock.mock.calls[0][1].outcome).toBe("tool_failed");
    expect(applySafetyNetMock.mock.calls[0][1].reason).toContain("create_follow_up");
    expect(reply).toMatch(/não consegui/i);
  });

  it("'act' sem ferramenta nenhuma nunca afirma conclusão", async () => {
    setDecide({ action: "act", tool_calls: [], natural_reply: "Feito, desmarquei tudo." });
    const reply = await turn(makeDb());
    expect(reply).toMatch(/Não cheguei a mexer em nada/i);
    expect(applySafetyNetMock.mock.calls[0][1].outcome).toBe("not_understood");
  });

  it("execução bem sucedida nunca sai com linguagem de incompreensão", async () => {
    setDecide({
      action: "act",
      tool_calls: [{ name: "create_follow_up", arguments: {} }],
      natural_reply: "Não percebi bem essa parte.",
    });
    executeToolCallsMock.mockResolvedValue([{ name: "create_follow_up", ok: true, latencyMs: 1, data: {} }]);
    const reply = await turn(makeDb());
    expect(reply).not.toMatch(/não percebi/i);
    expect(reply).toMatch(/Guardei o seguimento/i);
  });

  it("executou e mesmo assim perguntou → resposta afirmativa", async () => {
    setDecide({
      action: "act",
      tool_calls: [{ name: "create_event", arguments: {} }],
      natural_reply: "Marco a visita para amanhã?",
    });
    executeToolCallsMock.mockResolvedValue([{ name: "create_event", ok: true, latencyMs: 1, data: {} }]);
    const reply = await turn(makeDb());
    expect(reply).not.toMatch(/\?$/);
  });
});

describe("caracterização — registo e métricas do turno", () => {
  it("grava trace, log de IA, AQS e ATS", async () => {
    const db = makeDb();
    await turn(db);
    expect(db.writes.some((w) => w.table === "assessor_reasoning_traces" && w.op === "insert")).toBe(true);
    expect(db.writes.some((w) => w.table === "assessor_ai_logs" && w.op === "insert")).toBe(true);
    expect(persistQualityScore).toHaveBeenCalledTimes(1);
    expect(persistTrustScore).toHaveBeenCalledTimes(1);
  });

  it("turno bom não dispara reflexão", async () => {
    await turn(makeDb());
    expect(reflectMock).not.toHaveBeenCalled();
  });

  it("AQS baixo dispara reflexão com o gatilho low_aqs", async () => {
    aqsScore = 0.4;
    await turn(makeDb());
    expect(reflectMock).toHaveBeenCalledTimes(1);
    expect(reflectMock.mock.calls[0][1].trigger).toBe("low_aqs");
  });

  it("shadow mode só corre quando é amostrado", async () => {
    await turn(makeDb());
    expect(runShadowMock).not.toHaveBeenCalled();
    shouldRunShadowMock.mockReturnValue(true);
    await turn(makeDb());
    expect(runShadowMock).toHaveBeenCalledTimes(1);
  });
});

describe("caracterização — ofertas no fim da resposta", () => {
  it("arranque leve por fazer acrescenta a pergunta do nome numa pausa natural", async () => {
    loadOnboardingStateMock.mockResolvedValue({
      stage: "not_started", offers: 0, lastOfferAt: null, goals: null,
    } as any);
    const reply = await turn(makeDb());
    expect(markOnboardingOffered).toHaveBeenCalledTimes(1);
    expect(reply).toMatch(/como preferes chamar-me/i);
  });

  it("perfil 'por gotas' não pergunta nada quando o arranque leve já perguntou", async () => {
    loadOnboardingStateMock.mockResolvedValue({
      stage: "not_started", offers: 0, lastOfferAt: null, goals: null,
    } as any);
    nextProfileQuestionMock.mockReturnValue({ key: "work_area", question: "Em que zona trabalhas?", withNotice: false });
    await turn(makeDb());
    expect(nextProfileQuestionMock).not.toHaveBeenCalled();
  });

  it("perfil 'por gotas' acrescenta a pergunta quando há espaço", async () => {
    nextProfileQuestionMock.mockReturnValue({ key: "work_area", question: "Em que zona trabalhas?", withNotice: false });
    const reply = await turn(makeDb());
    expect(reply).toMatch(/Em que zona trabalhas\?/);
  });
});

describe("caracterização — âncora de pergunta aberta", () => {
  it("turno sem ferramentas nem proposta deixa âncora", async () => {
    await turn(makeDb());
    expect(recordOpenQuestion).toHaveBeenCalledTimes(1);
  });

  it("turno com execução não deixa âncora", async () => {
    setDecide({ action: "act", tool_calls: [{ name: "create_event", arguments: {} }], natural_reply: "Feito." });
    executeToolCallsMock.mockResolvedValue([{ name: "create_event", ok: true, latencyMs: 1, data: {} }]);
    await turn(makeDb());
    expect(recordOpenQuestion).not.toHaveBeenCalled();
  });

  it("pergunta do perfil substitui a âncora", async () => {
    nextProfileQuestionMock.mockReturnValue({ key: "work_area", question: "Em que zona trabalhas?", withNotice: false });
    await turn(makeDb());
    expect(recordOpenQuestion).not.toHaveBeenCalled();
  });
});
