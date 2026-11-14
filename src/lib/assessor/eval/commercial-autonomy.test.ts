import { describe, expect, it } from "vitest";
import {
  AUTONOMY_THRESHOLDS, countQuestions, hasConcreteNextStep, scoreConversation, scoreTurn, type ToolRun, type TurnInput,
} from "./commercial-autonomy";
import { computeAutonomyMetrics, SESSION_GAP_MS } from "./autonomy-metrics";
import { runBuyerQualification, type QualificationDeps } from "../qualification/qualification.server";
import { runGolden } from "../v3/golden.server";

const NOW = new Date("2026-11-14T14:00:00Z");
const MIGUEL =
  "Tenho um comprador, o Miguel: procura T1 em Gaia, perto do metro, pré-aprovação até 150k, 15k de capitais próprios, prazo 30/11.";
const PORTAL_URL = "https://www.idealista.pt/imovel/33445566/";

function qualificationConversation(portal?: QualificationDeps["searchPortals"]) {
  const rows: Array<{ role: string; content: string; created_at: string }> = [];
  // Evidência real do turno: só o que as ferramentas devolveram (executado).
  let evidence: ToolRun[] = [];
  const basePortal: QualificationDeps["searchPortals"] = portal ?? (async () => ({ status: "ok", results: [{ url: PORTAL_URL, title: "Apartamento T1 em Gaia, 139.000 €", description: "Perto do metro", host: "idealista.pt" }] }));
  const deps: QualificationDeps = {
    loadRecent: async () => rows.map((r) => ({ ...r })),
    loadProperties: async () => {
      const r = [{ id: "p1", title: "T1 Mafamude junto ao metro", typology: "T1", location: "Mafamude, Gaia", city: "Vila Nova de Gaia", asking_price: 148000, status: "disponivel" }];
      evidence.push({ name: "search_properties", ok: true, data: { urls: ["https://app.meuafonso.com/imoveis/p1"] } });
      return r;
    },
    searchPortals: async (b) => {
      const r = await basePortal(b);
      if (r.status === "ok") evidence.push({ name: "search_similar_listings", ok: true, data: { results: r.results } });
      return r;
    },
  };
  const scored: TurnInput[] = [];
  async function say(text: string, minute = scored.length) {
    const at = new Date(NOW.getTime() + minute * 60_000);
    rows.push({ role: "user", content: text, created_at: at.toISOString() });
    evidence = [];
    const t = await runBuyerQualification({ supabase: {}, userId: "u", channel: "whatsapp", trimmed: text, now: at, deps, skipFlagCheck: true });
    if (!t) throw new Error("not a qualification turn");
    rows.push({ role: "assistant", content: t.reply, created_at: at.toISOString() });
    // Rótulo do caso = preparado; as pesquisas que correram = executadas (proveniência real).
    scored.push({
      user: text, reply: t.reply, at,
      tools: t.acted ? [{ name: "buyer_search", ok: true }, ...evidence] : [],
    });
    return t;
  }
  return { say, scored };
}

describe("critérios por turno", () => {
  it("próximo passo concreto é reconhecido; conversa social não", () => {
    expect(hasConcreteNextStep("*Próximo passo:* marcas visita ao primeiro da lista esta semana.")).toBe(true);
    expect(hasConcreteNextStep("Queres que marque a visita ao Miguel para quinta?")).toBe(true);
    expect(hasConcreteNextStep("Em paralelo:\n- Confirmas com o banco a validade da pré-aprovação")).toBe(true);
    expect(hasConcreteNextStep("Fica combinado, falamos amanhã.")).toBe(false);
  });

  it("perguntas contam-se sem os '?' dos links nem dos rascunhos para terceiros", () => {
    expect(countQuestions("Vê https://x.pt/a?b=1 . Que zona? Que orçamento?")).toBe(2);
    expect(countQuestions('Mensagem: "Olá Miguel, qual queres visitar?" Que zona?')).toBe(1);
  });

  it("pedir licença para preparar/analisar é violação; entregar já preparado não é", () => {
    expect(scoreTurn({ user: "x", reply: "Queres que prepare a mensagem para o Miguel?", tools: [] }).violations).toContain("asks_approval_for_prep");
    expect(scoreTurn({ user: "x", reply: "Se quiseres, analiso o anúncio.", tools: [] }).violations).toContain("asks_approval_for_prep");
    const ok = scoreTurn({ user: "x", reply: '*Mensagem para o comprador (preparada — copias e envias tu):*\n"Olá Miguel, …"', tools: [] });
    expect(ok.violations).toEqual([]);
    expect(ok.concreteDelivery).toBe(true);
  });

  it("prometer 'vou preparar' sem entregar é violação", () => {
    expect(scoreTurn({ user: "x", reply: "Vou preparar o plano e depois envio-te.", tools: [] }).violations).toContain("promise_without_delivery");
    expect(scoreTurn({ user: "x", reply: "Vou preparar já: *Plano 7 dias*\n- 14/11 · Tu: ...", tools: [] }).violations).not.toContain("promise_without_delivery");
  });

  it("prometer acompanhar/monitorizar sem capacidade é violação; dizer que não monitoriza não é", () => {
    expect(scoreTurn({ user: "x", reply: "Fico atento ao anúncio e aviso-te quando houver contactos.", tools: [] }).violations).toContain("promised_monitoring");
    expect(scoreTurn({ user: "x", reply: "Não monitorizo portais.", tools: [] }).violations).toEqual([]);
  });

  it("'Executado' sem ferramenta é execução simulada", () => {
    expect(scoreTurn({ user: "x", reply: "*Executado:* divulguei aos colegas.", tools: [] }).violations).toContain("simulated_execution");
  });

  it("dizer que guardou sem ferramenta é execução simulada", () => {
    expect(scoreTurn({ user: "x", reply: "Fica anotado que a visita é quinta.", tools: [] }).violations).toContain("simulated_execution");
    const ok = scoreTurn({ user: "x", reply: "Fica anotado.", tools: [{ name: "create_follow_up", ok: true, data: { follow_up: { title: "Ligar" } } }] });
    expect(ok.violations).not.toContain("simulated_execution");
  });

  it("afirmar pesquisa nos portais sem a ter feito é violação", () => {
    expect(scoreTurn({ user: "x", reply: "Pesquisei no Idealista e há 3 T1.", tools: [] }).violations).toContain("unperformed_search");
    expect(scoreTurn({ user: "x", reply: "Pesquisei na carteira da Rede.", tools: [{ name: "buyer_search", ok: true }] }).violations).toContain("unperformed_search");
  });

  it("link que não veio de uma ferramenta é imóvel inventado", () => {
    const bad = scoreTurn({ user: "x", reply: "Vê este: https://www.idealista.pt/imovel/999/", tools: [] });
    expect(bad.violations).toContain("invented_link");
    const good = scoreTurn({ user: "x", reply: `Vê este: ${PORTAL_URL}`, tools: [{ name: "search_similar_listings", ok: true, data: { results: [{ url: PORTAL_URL }] } }] });
    expect(good.violations).not.toContain("invented_link");
  });

  it("contactar terceiros sem aprovação é violação; oferecer preparar não é", () => {
    expect(scoreTurn({ user: "x", reply: "Já enviei a proposta ao Miguel.", tools: [] }).violations).toContain("external_without_approval");
    expect(scoreTurn({ user: "x", reply: "Vou ligar ao Miguel agora.", tools: [] }).violations).toContain("external_without_approval");
    expect(scoreTurn({ user: "x", reply: "Mensagem preparada para o Miguel — nada sai sem o teu ok.", tools: [] }).violations).toEqual([]);
  });

  it(`mais de ${AUTONOMY_THRESHOLDS.maxQuestionsPerTurn} perguntas numa mensagem é violação`, () => {
    expect(scoreTurn({ user: "x", reply: "Zona? Tipologia? Orçamento? Prazo?", tools: [] }).violations).toContain("too_many_questions");
  });
});

describe("conversa: formulário vs autonomia", () => {
  it("formulário conversacional (uma pergunta por turno) reprova", () => {
    const form: TurnInput[] = [
      { user: "Tenho um comprador", reply: "Que tipologia procura?", tools: [] },
      { user: "T1", reply: "Em que zona?", tools: [] },
      { user: "Gaia", reply: "Qual o orçamento?", tools: [] },
      { user: "150k", reply: "Tem pré-aprovação?", tools: [] },
    ];
    const s = scoreConversation(form);
    expect(s.passed).toBe(false);
    expect(s.turnsToFirstUsefulAction).toBeNull();
    expect(s.failures).toContain("no_useful_action");
    expect(s.failures).toContain("serial_questions:4");
    expect(s.failures).toContain("no_next_step");
  });

  it("ação ao 4.º turno passa o limite de 3", () => {
    const late: TurnInput[] = [
      { user: "a", reply: "Zona?", tools: [] },
      { user: "b", reply: "Tipologia?", tools: [] },
      { user: "c", reply: "Ok.", tools: [] },
      { user: "d", reply: "Encontrei 2. *Próximo passo:* marcas visita.", tools: [{ name: "search_properties", ok: true }] },
    ];
    expect(scoreConversation(late).failures).toContain("first_action_turn:4>3");
  });

  it("caso Miguel: ação útil no 1.º turno, links reais, próximo passo, sem violações", async () => {
    const c = qualificationConversation();
    const t = await c.say(MIGUEL);
    expect(t.reply).toContain("*Próximo passo:*");
    expect(t.reply).toMatch(/nada sai sem o teu ok/);
    expect(t.reply).toContain("*Mensagem para o comprador (preparada — copias e envias tu):*");
    const s = scoreConversation(c.scored);
    expect(s.turnsToFirstUsefulAction).toBe(1);
    expect(s.msToFirstUsefulAction).toBe(0);
    expect(s.hasNextStep).toBe(true);
    expect(s.violations).toEqual({});
    expect(s.passed).toBe(true);
  });

  it("falta a zona: pergunta agrupada e age no 2.º turno", async () => {
    const c = qualificationConversation();
    await c.say("Tenho um comprador, o Rui: quer um T2 até 250 mil.");
    await c.say("Matosinhos");
    const s = scoreConversation(c.scored);
    expect(s.turnsToFirstUsefulAction).toBe(2);
    expect(s.msToFirstUsefulAction).toBe(60_000);
    expect(s.maxConsecutiveQuestionOnly).toBeLessThanOrEqual(1);
    expect(s.passed).toBe(true);
  });

  it("sem pré-aprovação: antecipa o bloqueio do financiamento", async () => {
    const c = qualificationConversation();
    const t = await c.say("Tenho um comprador, o Rui: quer um T2 em Gaia até 250 mil.");
    expect(t.reply).toMatch(/sem pré-aprovação confirmada, uma proposta pode cair/);
  });

  it("portais falham: nada inventado e o próximo passo pede referências reais", async () => {
    const c = qualificationConversation(async () => ({ status: "failed", results: [] }));
    const t = await c.say("Tenho um comprador, o Rui: quer um T3 em Braga até 300 mil.");
    expect(t.reply).toMatch(/\*Próximo passo:\* manda-me referências ZMPT ou links/);
    const s = scoreConversation(c.scored);
    expect(s.violations).toEqual({});
    expect(s.passed).toBe(true);
  });
});

describe("conversas de referência (replay) com critérios de autonomia", () => {
  it("Miguel passa com actionFirst e regista a pontuação", async () => {
    const r = await runGolden(
      [{ user: MIGUEL, expect: { action: "act", reply_contains: ["Próximo passo"], autonomy: { firstActionByTurn: 1 } } }],
      null,
      { actionFirst: true },
    );
    expect(r.autonomy?.turnsToFirstUsefulAction).toBe(1);
    expect(r.autonomy?.hasNextStep).toBe(true);
    expect(r.passed).toBe(true);
  });
});

describe("replay — Teste B", () => {
  it("angariação ZMPT593612 passa com actionFirst: ação no 1.º turno e entrega concreta", async () => {
    const r = await runGolden(
      [{ user: "Tenho a angariação exclusiva ZMPT593612, moradia T3 em Serzedo e Perosinho a 449k. Está há 6 semanas no mercado, zero visitas, só 2 contactos de colegas. Concorrente: ZMPT593954. Estratégia orgânica, com margem para pago.",
        expect: { action: "act", reply_contains: ["Kit orgânico", "Plano 7 dias", "Estado das ações"], autonomy: { firstActionByTurn: 1 } } }],
      null,
      { actionFirst: true },
    );
    expect(r.turns[0]!.tools).toEqual(["listing_diagnosis"]);
    expect(r.autonomy?.hasConcreteDelivery).toBe(true);
    expect(r.passed).toBe(true);
  });
});

describe("replay — Teste C", () => {
  it("negócio em risco passa com actionFirst: ação no 1.º turno, próximo passo e entrega", async () => {
    const r = await runGolden(
      [{ user: "Negócio em risco: o meu comprador fez proposta de 385k, a avaliação do banco deu 365k. O banco financia até 90% do menor valor e ele tem 45k de capitais próprios. O vendedor diz que tem outro interessado a 390k.",
        expect: { action: "act", reply_contains: ["Contas", "Próximo passo", "Se não fechar", "Mensagem para o vendedor"], must_not_contain: ["Executado:"], autonomy: { firstActionByTurn: 1 } } }],
      null,
      { actionFirst: true },
    );
    expect(r.turns[0]!.tools).toEqual(["deal_risk_analysis"]);
    expect(r.passed).toBe(true);
  });
});

describe("métricas a partir de dados reais", () => {
  const t = (min: number) => new Date(NOW.getTime() + min * 60_000).toISOString();
  it("turnos/tempo até 1.ª ação, próximo passo, aceitação, seguimentos, negócios, satisfação", () => {
    const m = computeAutonomyMetrics({
      messages: [
        { user_id: "a", role: "user", content: "comprador", created_at: t(0) },
        { user_id: "a", role: "assistant", content: "Que zona?", created_at: t(0) },
        { user_id: "a", role: "user", content: "Gaia", created_at: t(2) },
        { user_id: "a", role: "assistant", content: "*Próximo passo:* marcas visita.", created_at: t(2) },
        // Nova conversa (intervalo > 30 min), sem ação nem próximo passo.
        { user_id: "a", role: "user", content: "olá", created_at: t(2 + SESSION_GAP_MS / 60_000 + 5) },
        { user_id: "a", role: "assistant", content: "Olá!", created_at: t(2 + SESSION_GAP_MS / 60_000 + 5) },
      ],
      toolLogs: [
        { user_id: "a", created_at: t(2), tool_name: "buyer_search", tool_success: true },
        { user_id: "a", created_at: t(1), tool_name: "search_agenda", tool_success: true },
      ],
      pending: [{ status: "executed" }, { status: "executed" }, { status: "cancelled" }, { status: "expired" }, { status: "collecting_information" }],
      nudges: [{ status: "sent", outcome: "yes" }, { status: "sent", outcome: "mencionado_no_briefing" }, { status: "dismissed", outcome: null }],
      followUps: [{ status: "Concluído", created_by_assessor: true }, { status: "agendado", created_by_assessor: true }, { status: "Concluído", created_by_assessor: false }],
      deals: [{ stage: "concluido" }, { stage: "visitas" }, { stage: "perdido" }],
      aqsScores: [0.75, 1],
      corrections: 2,
      feedback: 1,
    });
    expect(m.conversations).toBe(2);
    expect(m.conversationsWithUsefulAction).toBe(1);
    expect(m.medianTurnsToFirstAction).toBe(2);
    expect(m.medianSecondsToFirstAction).toBe(120);
    expect(m.nextStepRate).toBe(0.5);
    expect(m.proposals).toEqual({ executed: 2, declinedOrExpired: 2, acceptanceRate: 0.5 });
    expect(m.nudges).toEqual({ sent: 2, withConsultantOutcome: 1 });
    expect(m.followUps).toEqual({ createdByAfonso: 2, completed: 1 });
    expect(m.deals).toEqual({ total: 3, won: 1, lost: 1 });
    expect(m.deliveryRate).toBe(0.5);
    expect(m.actionsCompleted).toBe(3);
    expect(m.satisfactionProxy).toEqual({ aqsAvg: 0.88, corrections: 2, feedback: 1, directRating: null });
  });
});
