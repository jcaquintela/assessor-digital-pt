// Testes de CARACTERIZAÇÃO do motor v3 — ramos de `pending.intent`.
//
// Estes testes não julgam se o comportamento é o ideal: fotografam o que o
// motor faz hoje, para que a divisão de `runReasoningEngineInner` em módulos
// mais pequenos possa ser feita sem alterar nada por acidente.
//
// Regra: se um destes testes ficar vermelho durante a refactorização, houve
// mudança de comportamento — não se "arranja o teste", investiga-se.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { pendingSlot } from "../pending-slots";

// ── Registo de pendentes partilhado com o mock de memory.server ──────────
interface FakePending {
  id: string;
  intent: string;
  status: string;
  structured_payload: any;
  original_content: string;
  pending_question: string;
  current_question: string;
  created_at: string;
  updated_at: string;
}
const pendings: FakePending[] = [];

// ── Espiões de ferramentas e de módulos com efeitos ──────────────────────
const decideMock = vi.fn();
const tool = {
  complete_follow_up: vi.fn(async (..._a: any[]) => ({ ok: false, error: "no_match" })),
  set_routine_active: vi.fn(async (..._a: any[]) => ({ ok: true, data: {} })),
  cancel_follow_up: vi.fn(async (..._a: any[]) => ({ ok: true, data: { items: [] } })),
  create_event: vi.fn(async (..._a: any[]) => ({ ok: true, data: { event: { id: "e1" } } })),
  create_person: vi.fn(async (..._a: any[]) => ({ ok: true, data: { person: { id: "p9" } } })),
  create_follow_up: vi.fn(async (..._a: any[]) => ({ ok: true, data: { follow_up: { id: "f9" } } })),
  create_prospecting_lead: vi.fn(async (..._a: any[]) => ({ ok: true, data: { lead: { id: "lead-1" } } })),
  create_deal: vi.fn(async (..._a: any[]) => ({ ok: true, data: { id: "d1", title: "Venda do T3", linkedMovements: 0 } })),
  create_financial_movement: vi.fn(async (..._a: any[]) => ({ ok: true, data: {} })),
};
const keepAudioFile = vi.fn(async () => undefined);
const discardAudioFile = vi.fn(async () => undefined);
const discardLastInput = vi.fn(async () => undefined);
const rescheduleReminder = vi.fn(async () => undefined);
const pushEventToProviders = vi.fn(async () => undefined);
const executeAudioBreakdown = vi.fn(async () => "Feito. Guardei os pontos do áudio.");
const executeAudioThemes = vi.fn(async () => "Feito. Guardei os temas do áudio.");
const applyLinkSuggestion = vi.fn(async () => "Liguei o documento ao imóvel.");
const archiveFilesBulk = vi.fn(async () => 3);
const deleteFilesBulk = vi.fn(async () => 3);
const saveProductFeedback = vi.fn(async () => true);

vi.mock("./think.server", () => ({
  think: vi.fn(async () => ({
    ok: true, output: { hypotheses: [], recommended_searches: [] },
    usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: 0,
  })),
}));
vi.mock("./search.server", () => ({ search: vi.fn(async () => ({})) }));
vi.mock("./decide.server", () => ({ decide: (...a: any[]) => decideMock(...a) }));
vi.mock("./act.server", () => ({
  executeToolCalls: vi.fn(async () => []),
  applyMemoryWrites: vi.fn(async () => undefined),
}));
vi.mock("./safety-net.server", () => ({
  applySafetyNet: vi.fn(async (_c: any, o: any) => o.reply),
  buildArchiveContent: vi.fn((o: any) => o.trimmed),
  archiveToMiscellaneous: vi.fn(async () => true),
}));
vi.mock("./quality.server", () => ({
  computeQualitySignals: vi.fn(() => ({ score: 1 })),
  persistQualityScore: vi.fn(async () => undefined),
}));
vi.mock("./trust.server", () => ({
  computeATS: vi.fn(() => 100), computeContextPreservation: vi.fn(() => 1),
  computeSafeDecisions: vi.fn(() => 1), computeTaskSuccess: vi.fn(() => 1),
  persistTrustScore: vi.fn(async () => undefined),
}));
vi.mock("./shadow.server", () => ({ shouldRunShadow: () => false, runShadow: vi.fn() }));
vi.mock("./corrections.server", () => ({
  looksLikeCorrection: () => false, captureCorrection: vi.fn(async () => null),
}));
vi.mock("./reflection.server", () => ({ reflect: vi.fn(async () => undefined) }));
vi.mock("./sparring-state.server", () => ({
  readSparringState: vi.fn(async () => null),
  setSparringTopic: vi.fn(async () => undefined),
  stopSparring: vi.fn(async () => undefined),
}));
vi.mock("./proactivity.server", () => ({
  resolveLatestDocumentNudgeAnswer: vi.fn(async () => ({ resolved: false })),
}));
vi.mock("./onboarding.server", () => ({
  loadOnboardingState: vi.fn(async () => ({ stage: "done", offers: 2, lastOfferAt: null, goals: null })),
  markOnboardingOffered: vi.fn(async () => undefined),
  saveAssessorName: vi.fn(async () => undefined),
  saveOnboardingGoals: vi.fn(async () => undefined),
  setOnboardingStage: vi.fn(async () => undefined),
}));
vi.mock("./profile-drip.server", () => ({
  findProfileQuestion: vi.fn(async () => null),
  closeProfileQuestion: vi.fn(async () => undefined),
  loadProfileDripState: vi.fn(async () => ({ asked: [], lastAskedAt: null, refusals: 0, noticeShown: true, askedLast30: 0, accountAgeDays: 40 })),
  saveProfileAnswer: vi.fn(async () => undefined),
  registerProfileRefusal: vi.fn(async () => undefined),
  markProfileQuestionAsked: vi.fn(async () => undefined),
  recordProfileQuestion: vi.fn(async () => undefined),
  isCalmDay: vi.fn(async () => false),
}));
vi.mock("@/lib/prospecting/script-offer.server", () => ({
  resolveScriptPending: vi.fn(async () => null),
  appendScriptOffer: vi.fn(async (_c: any, o: any) => o.reply),
}));
vi.mock("@/lib/assessor/outcome-intent", () => ({ detectOutcomeFromText: () => null }));
vi.mock("./choice-burst.server", () => ({
  collectChoiceBurstFollowUps: vi.fn(async () => []),
  markChoiceBurstConsumed: vi.fn(async () => undefined),
}));
vi.mock("./audio-keep.server", () => ({
  keepAudioFile: (...a: any[]) => keepAudioFile(...(a as [])),
  discardAudioFile: (...a: any[]) => discardAudioFile(...(a as [])),
  askKeepAudio: vi.fn(async () => null),
  findRecentlyKeptAudio: vi.fn(async () => null),
}));
vi.mock("./discard.server", () => ({ discardLastInput: (...a: any[]) => discardLastInput(...(a as [])) }));
vi.mock("./reminders.server", async (orig) => ({
  ...(await (orig as any)()),
  rescheduleReminder: (...a: any[]) => rescheduleReminder(...(a as [])),
}));
vi.mock("@/lib/calendar/sync.server", () => ({
  pushEventToProviders: (...a: any[]) => pushEventToProviders(...(a as [])),
}));
vi.mock("./audio-breakdown.server", async (orig) => ({
  ...(await (orig as any)()),
  executeAudioBreakdown: (...a: any[]) => executeAudioBreakdown(...(a as [])),
}));
vi.mock("./audio-themes.server", async (orig) => ({
  ...(await (orig as any)()),
  executeAudioThemes: (...a: any[]) => executeAudioThemes(...(a as [])),
}));
vi.mock("@/lib/drive/link-suggestions.server", () => ({
  applyLinkSuggestion: (...a: any[]) => applyLinkSuggestion(...(a as [])),
}));
vi.mock("@/lib/drive/bulk-archive.server", () => ({
  archiveFilesBulk: (...a: any[]) => archiveFilesBulk(...(a as [])),
  deleteFilesBulk: (...a: any[]) => deleteFilesBulk(...(a as [])),
}));
vi.mock("./feedback.server", () => ({
  saveProductFeedback: (...a: any[]) => saveProductFeedback(...(a as [])),
}));
vi.mock("../v2/domain.server", () => ({
  TOOL_REGISTRY: new Proxy({}, {
    get: (_t, name: string) => (tool as any)[name],
    has: () => true,
  }),
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({ insert: async () => ({ error: null }) }) },
}));

vi.mock("../memory.server", () => ({
  findActivePendingAction: vi.fn(async (_s: any, _u: string, _c: string, slot = "main") =>
    [...pendings].reverse().find(
      (p) => ["pending_confirmation", "collecting_information"].includes(p.status)
        && pendingSlot(p.intent) === slot,
    ) ?? null),
  markPendingActionStatus: vi.fn(async (_s: any, id: string, status: string) => {
    const row = pendings.find((p) => p.id === id);
    if (row) row.status = status;
  }),
  createPendingAction: vi.fn(async (_s: any, input: any) => {
    const row: FakePending = {
      id: String(pendings.length + 1),
      intent: input.intent,
      status: "pending_confirmation",
      structured_payload: input.payload,
      original_content: input.originalContent ?? "",
      pending_question: input.pendingQuestion ?? "",
      current_question: input.currentQuestion ?? "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    pendings.push(row);
    return row;
  }),
  updatePendingActionPayload: vi.fn(async (_s: any, id: string, payload: any) => {
    const row = pendings.find((p) => p.id === id);
    if (row) row.structured_payload = payload;
  }),
  findRecentExpiredConfirmation: vi.fn(async () => null),
}));

import { runReasoningEngine } from "./reasoning-engine.server";

const USER = "00000000-0000-4000-8000-0000000000c1";
const CHANNEL = "whatsapp";

// ── Base de dados falsa (encadeável e "thenable") ────────────────────────
function makeDb() {
  const profile = { id: USER, name: "Júlio", assessor_name: "Afonso" };
  const messages: any[] = [];
  const writes: Array<{ table: string; op: string; row: any }> = [];

  const chain = (table: string, rows: any[]) => {
    let data = rows;
    const q: any = {
      select: () => q, eq: () => q, is: () => q, not: () => q, in: () => q,
      ilike: () => q, gte: () => q, lte: () => q, contains: () => q, or: () => q,
      order: () => { data = [...data].reverse(); return q; },
      limit: (n: number) => Promise.resolve({ data: data.slice(0, n), error: null }),
      maybeSingle: () => Promise.resolve({ data: data[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: data[0] ?? null, error: null }),
      then: (res: any) => Promise.resolve({ data, error: null }).then(res),
      insert: (row: any) => {
        writes.push({ table, op: "insert", row });
        return chain(table, [{ id: `${table}-1`, ...(Array.isArray(row) ? row[0] : row) }]);
      },
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
      from: (name: string) =>
        chain(name, name === "profiles" ? [profile] : name === "assessor_messages" ? messages : []),
    } as any,
  };
}

type Db = ReturnType<typeof makeDb>;

/** Deixa um rascunho vivo e a respectiva pergunta como última fala do Afonso. */
function setPending(db: Db, p: { intent: string; payload?: any; question?: string; original?: string }) {
  const question = p.question ?? "Confirmas?";
  const row: FakePending = {
    id: String(pendings.length + 1),
    intent: p.intent,
    status: "pending_confirmation",
    structured_payload: p.payload ?? {},
    original_content: p.original ?? "",
    pending_question: question,
    current_question: question,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  pendings.push(row);
  db.say("assistant", question);
  return row;
}

async function turn(db: Db, content: string) {
  db.say("user", content);
  const out = await runReasoningEngine({
    supabase: db.supabase, userId: USER, channel: CHANNEL, content,
  } as any);
  db.say("assistant", out.reply);
  return out.reply as string;
}

beforeEach(() => {
  pendings.length = 0;
  vi.clearAllMocks();
  tool.complete_follow_up.mockResolvedValue({ ok: false, error: "no_match" } as any);
  tool.set_routine_active.mockResolvedValue({ ok: true, data: {} } as any);
  tool.cancel_follow_up.mockResolvedValue({ ok: true, data: { items: [] } } as any);
  tool.create_event.mockResolvedValue({ ok: true, data: { event: { id: "e1" } } } as any);
  tool.create_person.mockResolvedValue({ ok: true, data: { person: { id: "p9" } } } as any);
  tool.create_follow_up.mockResolvedValue({ ok: true, data: { follow_up: { id: "f9" } } } as any);
  tool.create_prospecting_lead.mockResolvedValue({ ok: true, data: { lead: { id: "lead-1" } } } as any);
  tool.create_deal.mockResolvedValue({ ok: true, data: { id: "d1", title: "Venda do T3", linkedMovements: 0 } } as any);
  executeAudioBreakdown.mockResolvedValue("Feito. Guardei os pontos do áudio.");
  executeAudioThemes.mockResolvedValue("Feito. Guardei os temas do áudio.");
  applyLinkSuggestion.mockResolvedValue("Liguei o documento ao imóvel.");
  archiveFilesBulk.mockResolvedValue(3);
  deleteFilesBulk.mockResolvedValue(3);
  saveProductFeedback.mockResolvedValue(true);
  decideMock.mockResolvedValue({
    ok: true,
    decision: {
      confidence: 0.5, action: "acknowledge", tool_calls: [], memory_writes: [],
      natural_reply: "Certo.",
    },
    usage: { inputTokens: 0, outputTokens: 0 }, latencyMs: 0,
  });
});

describe("caracterização — recorrência (ranhura própria)", () => {
  it("'não' desliga a rotina e confirma pelo título", async () => {
    const db = makeDb();
    setPending(db, {
      intent: "confirm_recurrence_continue",
      payload: { routine_id: "r1", routine_title: "Estudo de mercado" },
      question: "Isto repete-se — queres que continue a repetir?",
    });
    const reply = await turn(db, "não");
    expect(tool.set_routine_active).toHaveBeenCalledWith(expect.anything(), { routine_id: "r1", active: false });
    expect(reply).toMatch(/Desliguei a repetição/i);
    expect(pendings[0].status).toBe("executed");
  });

  it("'continua' mantém e não toca na rotina", async () => {
    const db = makeDb();
    setPending(db, {
      intent: "confirm_recurrence_continue",
      payload: { routine_id: "r1", routine_title: "Estudo de mercado" },
      question: "Isto repete-se — queres que continue a repetir?",
    });
    const reply = await turn(db, "continua");
    expect(tool.set_routine_active).not.toHaveBeenCalled();
    expect(reply).toMatch(/continua a repetir-se/i);
    expect(pendings[0].status).toBe("executed");
  });
});

describe("caracterização — escolha de desmarcação", () => {
  const candidates = [
    { id: "f1", title: "Visita ao T3", due_time: "10:00" },
    { id: "f2", title: "Reunião com a Ana", due_time: "15:00" },
  ];

  it("'as duas' desmarca ambas e lista cada uma", async () => {
    const db = makeDb();
    setPending(db, {
      intent: "choosing_cancel_target",
      payload: { candidates },
      question: "Qual delas queres desmarcar?",
    });
    tool.cancel_follow_up.mockResolvedValue({ ok: true, data: { items: [{ id: "f1" }, { id: "f2" }] } } as any);
    const reply = await turn(db, "as duas");
    expect(tool.cancel_follow_up).toHaveBeenCalledWith(expect.anything(), { follow_up_ids: ["f1", "f2"] });
    expect(reply).toMatch(/Desmarquei:/);
    expect(reply).toContain("Visita ao T3");
    expect(reply).toContain("Reunião com a Ana");
    expect(pendings[0].status).toBe("executed");
  });

  it("'não' fecha sem desmarcar nada", async () => {
    const db = makeDb();
    setPending(db, {
      intent: "choosing_cancel_target",
      payload: { candidates },
      question: "Qual delas queres desmarcar?",
    });
    const reply = await turn(db, "não");
    expect(tool.cancel_follow_up).not.toHaveBeenCalled();
    expect(reply).toBe("Certo — não desmarquei nada.");
    expect(pendings[0].status).toBe("cancelled");
  });
});

describe("caracterização — ficheiro de áudio (ranhura media)", () => {
  it("'sim' guarda o áudio no Drive", async () => {
    const db = makeDb();
    setPending(db, {
      intent: "confirm_keep_audio",
      payload: { file_id: "file-1" },
      question: "Guardo o áudio no Drive ou descarto?",
    });
    const reply = await turn(db, "sim");
    expect(keepAudioFile).toHaveBeenCalled();
    expect(reply).toBe("Guardei o áudio no Drive Inteligente.");
  });

  it("'descarta' apaga o ficheiro e tudo o que dele saiu", async () => {
    const db = makeDb();
    setPending(db, {
      intent: "confirm_keep_audio",
      payload: { file_id: "file-1" },
      question: "Guardo o áudio no Drive ou descarto?",
    });
    const reply = await turn(db, "descarta");
    expect(discardAudioFile).toHaveBeenCalled();
    expect(discardLastInput).toHaveBeenCalled();
    expect(reply).toBeTruthy();
    expect(pendings[0].status).toBe("cancelled");
  });
});

describe("caracterização — escolha de contacto", () => {
  const payload = {
    tool: "create_event",
    personName: "Ana",
    suggestions: [{ id: "p1", name: "Ana Silva" }],
    incoming: { title: "Visita", date: "2026-09-01", time: "15:00" },
    mode: "confirm_exact",
  };

  it("'sim' a candidato único executa a ferramenta com a pessoa ligada", async () => {
    const db = makeDb();
    setPending(db, { intent: "confirm_event_person", payload, question: "É a Ana Silva?" });
    const reply = await turn(db, "sim");
    expect(tool.create_event).toHaveBeenCalledTimes(1);
    expect(tool.create_event.mock.calls[0][1]).toMatchObject({ person_id: "p1" });
    expect(reply).toContain("Ana Silva");
    expect(pendings[0].status).toBe("executed");
  });

  it("'não, é outra pessoa' fecha o candidato e pergunta quem é", async () => {
    const db = makeDb();
    setPending(db, { intent: "confirm_event_person", payload, question: "É a Ana Silva?" });
    const reply = await turn(db, "não, é outra pessoa");
    expect(tool.create_event).not.toHaveBeenCalled();
    expect(reply).toMatch(/Diz-me quem é/i);
    expect(pendings[0].status).toBe("cancelled");
  });

  it("ferramenta falhada não promete execução", async () => {
    const db = makeDb();
    setPending(db, { intent: "confirm_event_person", payload, question: "É a Ana Silva?" });
    tool.create_event.mockResolvedValue({ ok: false, error: "db" } as any);
    const reply = await turn(db, "sim");
    expect(reply).toMatch(/não consegui/i);
    expect(pendings[0].status).toBe("failed");
  });
});

// Mesma família, ferramentas que até aqui não tinham rede de segurança.
describe("caracterização — escolha de contacto (seguimento)", () => {
  const payload = {
    tool: "create_follow_up",
    personName: "Ana",
    suggestions: [{ id: "p1", name: "Ana Silva" }],
    incoming: { title: "Ligar", date: "2026-09-01", time: "15:00" },
    mode: "confirm_exact",
  };

  it("'sim' a candidato único executa a ferramenta com a pessoa ligada", async () => {
    const db = makeDb();
    setPending(db, { intent: "confirm_event_person", payload, question: "É a Ana Silva?" });
    const reply = await turn(db, "sim");
    expect(tool.create_follow_up).toHaveBeenCalledTimes(1);
    expect(tool.create_follow_up.mock.calls[0][1]).toMatchObject({ person_id: "p1" });
    expect(reply).toContain("Ana Silva");
    expect(pendings[0].status).toBe("executed");
  });

  it("'não, é outra pessoa' fecha o candidato e pergunta quem é", async () => {
    const db = makeDb();
    setPending(db, { intent: "confirm_event_person", payload, question: "É a Ana Silva?" });
    const reply = await turn(db, "não, é outra pessoa");
    expect(tool.create_follow_up).not.toHaveBeenCalled();
    expect(reply).toMatch(/Diz-me quem é/i);
    expect(pendings[0].status).toBe("cancelled");
  });

  it("ferramenta falhada não promete execução", async () => {
    const db = makeDb();
    setPending(db, { intent: "confirm_event_person", payload, question: "É a Ana Silva?" });
    tool.create_follow_up.mockResolvedValue({ ok: false, error: "db" } as any);
    const reply = await turn(db, "sim");
    expect(reply).toMatch(/não consegui/i);
    expect(pendings[0].status).toBe("failed");
  });
});

describe("caracterização — escolha de contacto (proprietário do imóvel)", () => {
  const payload = {
    tool: "update_property",
    personName: "Ana",
    suggestions: [{ id: "p1", name: "Ana Silva" }],
    incoming: { property_id: "imo-1", owner_name: null },
    mode: "confirm_exact",
  };

  it("'sim' a candidato único liga o proprietário ao imóvel", async () => {
    const db = makeDb();
    setPending(db, { intent: "confirm_event_person", payload, question: "É a Ana Silva?" });
    const reply = await turn(db, "sim");
    expect(tool.update_property).toHaveBeenCalledTimes(1);
    expect(tool.update_property.mock.calls[0][1]).toMatchObject({ owner_person_id: "p1" });
    expect(reply).toContain("Ana Silva");
    expect(pendings[0].status).toBe("executed");
  });

  it("'não, é outra pessoa' fecha o candidato e pergunta quem é", async () => {
    const db = makeDb();
    setPending(db, { intent: "confirm_event_person", payload, question: "É a Ana Silva?" });
    const reply = await turn(db, "não, é outra pessoa");
    expect(tool.update_property).not.toHaveBeenCalled();
    expect(reply).toMatch(/Diz-me quem é/i);
    expect(pendings[0].status).toBe("cancelled");
  });

  it("ferramenta falhada não promete execução", async () => {
    const db = makeDb();
    setPending(db, { intent: "confirm_event_person", payload, question: "É a Ana Silva?" });
    tool.update_property.mockResolvedValue({ ok: false, error: "db" } as any);
    const reply = await turn(db, "sim");
    expect(reply).toMatch(/não consegui/i);
    expect(pendings[0].status).toBe("failed");
  });
});

describe("caracterização — duplicado vs. reagendamento", () => {
  const payload = {
    candidate: { id: "f1", title: "Visita ao T3" },
    incoming: { date: "2026-09-01", time: "16:00", title: "Visita ao T3" },
  };

  it("'sim' actualiza o compromisso existente e sincroniza", async () => {
    const db = makeDb();
    setPending(db, { intent: "confirm_event_reschedule", payload, question: "É o mesmo compromisso?" });
    const reply = await turn(db, "sim");
    expect(db.writes.some((w) => w.table === "follow_ups" && w.op === "update")).toBe(true);
    expect(rescheduleReminder).toHaveBeenCalled();
    expect(pushEventToProviders).toHaveBeenCalled();
    expect(reply).toMatch(/Actualizei/);
    expect(reply).toContain("16:00");
  });

  it("'não' cria um compromisso separado", async () => {
    const db = makeDb();
    setPending(db, { intent: "confirm_event_reschedule", payload, question: "É o mesmo compromisso?" });
    const reply = await turn(db, "não");
    expect(tool.create_event).toHaveBeenCalledTimes(1);
    expect(reply).toMatch(/compromisso separado/i);
  });
});

describe("caracterização — placa de prospeção", () => {
  it("'sim' cria a placa, materializa o imóvel e oferece lembrete", async () => {
    const db = makeDb();
    setPending(db, {
      intent: "create_prospecting_lead",
      payload: { phone: "912345678", location: "Canelas", property_type: "Apartamento" },
      question: "Registo a placa?",
      original: "placa em Canelas 912345678",
    });
    const reply = await turn(db, "sim");
    expect(tool.create_prospecting_lead).toHaveBeenCalledTimes(1);
    expect(db.writes.some((w) => w.table === "properties" && w.op === "insert")).toBe(true);
    expect(reply).toMatch(/Registei a placa/i);
    expect(pendings[0].status).toBe("executed");
  });

  it("placa duplicada não promete registo novo", async () => {
    const db = makeDb();
    setPending(db, {
      intent: "create_prospecting_lead",
      payload: { phone: "912345678" },
      question: "Registo a placa?",
    });
    tool.create_prospecting_lead.mockResolvedValue({ ok: true, data: { duplicate: true, existing: { id: "l0" } } } as any);
    const reply = await turn(db, "sim");
    expect(reply).toMatch(/Já tinhas uma placa/i);
    expect(pendings[0].status).toBe("failed");
  });

  it("'não' não regista nada", async () => {
    const db = makeDb();
    setPending(db, { intent: "create_prospecting_lead", payload: {}, question: "Registo a placa?" });
    const reply = await turn(db, "não");
    expect(tool.create_prospecting_lead).not.toHaveBeenCalled();
    expect(reply).toBe("Está bem, não registei nada.");
  });
});

describe("caracterização — pessoa proposta por frase elíptica", () => {
  it("'sim' cria a pessoa e o seguimento pedido", async () => {
    const db = makeDb();
    setPending(db, {
      intent: "create_person_elliptic",
      payload: { name: "Maria Manuela", phone: "912111222", with_follow_up: true },
      question: "Crio a Maria Manuela?",
      original: "seguimento à lead Maria Manuela 912111222",
    });
    const reply = await turn(db, "sim");
    expect(tool.create_person).toHaveBeenCalledTimes(1);
    expect(tool.create_follow_up).toHaveBeenCalledTimes(1);
    expect(reply).toMatch(/Registei a Maria Manuela/i);
    expect(reply).toMatch(/seguimento para amanhã/i);
  });

  it("'não' não cria nada", async () => {
    const db = makeDb();
    setPending(db, { intent: "create_person_elliptic", payload: { name: "Maria" }, question: "Crio a Maria?" });
    const reply = await turn(db, "não");
    expect(tool.create_person).not.toHaveBeenCalled();
    expect(reply).toBe("Está bem, não registei nada.");
  });
});

describe("caracterização — negócio", () => {
  it("'sim' abre o negócio e diz o estado inicial", async () => {
    const db = makeDb();
    setPending(db, { intent: "create_deal", payload: { title: "Venda do T3" }, question: "Abro o negócio?" });
    const reply = await turn(db, "sim");
    expect(tool.create_deal).toHaveBeenCalledTimes(1);
    expect(reply).toMatch(/Abri o negócio/i);
    expect(reply).toMatch(/A começar/);
  });

  it("falha de criação devolve o motivo, sem prometer nada", async () => {
    const db = makeDb();
    setPending(db, { intent: "create_deal", payload: { title: "Venda do T3" }, question: "Abro o negócio?" });
    tool.create_deal.mockResolvedValue({ ok: false, error: "sem título" } as any);
    const reply = await turn(db, "sim");
    expect(reply).toMatch(/Não consegui criar o negócio/i);
    expect(pendings[0].status).toBe("failed");
  });
});

describe("caracterização — áudio separado em itens e em temas", () => {
  it("audio_breakdown: 'sim' executa a proposta", async () => {
    const db = makeDb();
    setPending(db, {
      intent: "audio_breakdown",
      payload: { items: [{ kind: "note", title: "Ponto 1" }] },
      question: "Guardo estes pontos?",
    });
    const reply = await turn(db, "sim");
    expect(executeAudioBreakdown).toHaveBeenCalledTimes(1);
    expect(reply).toBe("Feito. Guardei os pontos do áudio.");
  });

  it("audio_breakdown: 'não' não guarda nada", async () => {
    const db = makeDb();
    setPending(db, { intent: "audio_breakdown", payload: { items: [] }, question: "Guardo estes pontos?" });
    const reply = await turn(db, "não");
    expect(executeAudioBreakdown).not.toHaveBeenCalled();
    expect(reply).toBe("Está bem, não guardei nada do áudio.");
    expect(pendings[0].status).toBe("cancelled");
  });

  it("audio_themes: 'sim' sem ambiguidades executa", async () => {
    const db = makeDb();
    setPending(db, {
      intent: "audio_themes",
      payload: { themes: [{ kind: "note", title: "Tema 1" }], links: [] },
      question: "Guardo estes temas?",
    });
    const reply = await turn(db, "sim");
    expect(executeAudioThemes).toHaveBeenCalledTimes(1);
    expect(reply).toBe("Feito. Guardei os temas do áudio.");
  });

  it("audio_themes: 'não' não guarda nada", async () => {
    const db = makeDb();
    setPending(db, {
      intent: "audio_themes",
      payload: { themes: [{ kind: "note", title: "Tema 1" }], links: [] },
      question: "Guardo estes temas?",
    });
    const reply = await turn(db, "não");
    expect(executeAudioThemes).not.toHaveBeenCalled();
    expect(reply).toBe("Está bem, não guardei nada do áudio.");
  });
});

describe("caracterização — Drive", () => {
  it("suggest_file_link: 'sim' aplica a ligação sugerida", async () => {
    const db = makeDb();
    setPending(db, {
      intent: "suggest_file_link",
      payload: { file_id: "f1", property_id: "im1" },
      question: "Ligo o documento ao imóvel?",
    });
    const reply = await turn(db, "sim");
    expect(applyLinkSuggestion).toHaveBeenCalledTimes(1);
    expect(reply).toBe("Liguei o documento ao imóvel.");
    expect(pendings[0].status).toBe("executed");
  });

  it("suggest_file_link: 'não' deixa tudo como está", async () => {
    const db = makeDb();
    setPending(db, { intent: "suggest_file_link", payload: { file_id: "f1" }, question: "Ligo o documento?" });
    const reply = await turn(db, "não");
    expect(applyLinkSuggestion).not.toHaveBeenCalled();
    expect(reply).toBe("Sem problema, deixo a ligação como está.");
  });

  it("confirm_keep_photo: 'sim' recupera a foto para o Drive", async () => {
    const db = makeDb();
    setPending(db, { intent: "confirm_keep_photo", payload: { file_id: "f1" }, question: "Guardo a foto?" });
    const reply = await turn(db, "sim");
    expect(db.writes.some((w) => w.table === "uploaded_files" && w.op === "update")).toBe(true);
    expect(reply).toBe("Guardei a foto no Drive Inteligente.");
  });

  it("confirm_bulk_archive: 'sim' arquiva o lote e diz quantos", async () => {
    const db = makeDb();
    setPending(db, {
      intent: "confirm_bulk_archive",
      payload: { file_ids: ["a", "b", "c"], kind: "audio", mode: "archive" },
      question: "Confirmas arquivar estes 3?",
    });
    const reply = await turn(db, "sim");
    expect(archiveFilesBulk).toHaveBeenCalledTimes(1);
    expect(deleteFilesBulk).not.toHaveBeenCalled();
    expect(reply).toMatch(/3/);
    expect(pendings[0].status).toBe("executed");
  });

  it("confirm_bulk_archive: 'não' cancela o lote", async () => {
    const db = makeDb();
    setPending(db, {
      intent: "confirm_bulk_archive",
      payload: { file_ids: ["a"], kind: "audio", mode: "archive" },
      question: "Confirmas arquivar este?",
    });
    const reply = await turn(db, "não");
    expect(archiveFilesBulk).not.toHaveBeenCalled();
    expect(reply).toBeTruthy();
    expect(pendings[0].status).toBe("cancelled");
  });
});

describe("caracterização — feedback do produto", () => {
  it("collecting_feedback: o corpo cria a confirmação seguinte", async () => {
    const db = makeDb();
    setPending(db, {
      intent: "collecting_feedback",
      payload: { kind: "bug" },
      question: "Diz-me o que aconteceu.",
    });
    const reply = await turn(db, "o botão de exportar não faz nada no telemóvel");
    expect(saveProductFeedback).not.toHaveBeenCalled();
    expect(pendings[0].status).toBe("executed");
    expect(pendings[1].intent).toBe("record_product_feedback");
    expect(reply).toMatch(/Guardo isto como erro/i);
  });

  it("collecting_feedback: corpo vazio volta a pedir", async () => {
    const db = makeDb();
    setPending(db, { intent: "collecting_feedback", payload: { kind: "suggestion" }, question: "Diz-me a ideia." });
    const reply = await turn(db, "ok");
    expect(reply).toBe("Diz-me só o que queres que fique guardado.");
    expect(pendings[0].status).toBe("pending_confirmation");
  });

  it("clarify_feedback_target: 'é sobre uma pessoa' não vira registo de produto", async () => {
    const db = makeDb();
    setPending(db, {
      intent: "clarify_feedback_target",
      payload: { kind: "suggestion", original: "o Paulo é difícil" },
      question: "É sobre mim ou sobre uma pessoa?",
    });
    const reply = await turn(db, "é sobre uma pessoa");
    expect(reply).toBe("Percebido, não é sobre mim. Diz-me o que queres que fique registado sobre essa pessoa.");
    expect(pendings[0].status).toBe("cancelled");
  });

  it("record_product_feedback: 'sim' grava e diz onde ficou", async () => {
    const db = makeDb();
    setPending(db, {
      intent: "record_product_feedback",
      payload: { kind: "suggestion", original: "podias ter atalhos no dashboard" },
      question: "Guardo isto como sugestão?",
    });
    const reply = await turn(db, "sim");
    expect(saveProductFeedback).toHaveBeenCalledTimes(1);
    expect(reply).toMatch(/Guardei a sugestão/i);
    expect(pendings[0].status).toBe("executed");
  });

  it("record_product_feedback: escrita falhada não promete registo", async () => {
    const db = makeDb();
    setPending(db, {
      intent: "record_product_feedback",
      payload: { kind: "bug", original: "o botão parte" },
      question: "Guardo isto como erro?",
    });
    saveProductFeedback.mockResolvedValue(false as any);
    const reply = await turn(db, "sim");
    expect(reply).not.toMatch(/^Guardei/);
    expect(pendings[0].status).toBe("failed");
  });
});

describe("caracterização — higiene dos rascunhos", () => {
  it("'só registar' fecha o rascunho e guarda em Diversos", async () => {
    const db = makeDb();
    setPending(db, {
      intent: "create_event",
      payload: {},
      question: "Queres que te lembre?",
      original: "bloco de agenda amanhã para chamadas",
    });
    const reply = await turn(db, "só registar");
    expect(reply).toMatch(/fica só registado, sem lembrete/i);
    expect(pendings[0].status).toBe("cancelled");
  });

  it("rascunho antigo cuja pergunta já não está em aberto caduca", async () => {
    const db = makeDb();
    const row = setPending(db, {
      intent: "create_deal",
      payload: { title: "Venda do T3" },
      question: "Abro o negócio?",
    });
    row.created_at = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    row.updated_at = row.created_at;
    // A conversa seguiu para outro assunto: a pergunta já não é a última fala.
    db.say("assistant", "Tens três visitas amanhã.");
    await turn(db, "sim");
    expect(tool.create_deal).not.toHaveBeenCalled();
    expect(pendings[0].status).toBe("expired");
  });
});
