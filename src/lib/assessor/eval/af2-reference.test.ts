// As 6 conversas de referência AFONSO 2.0 correm no replay (sem BD, sem
// envio, ferramentas = fixtures) e dão o resultado esperado.
import { describe, expect, it } from "vitest";
import { runGolden } from "../v3/golden.server";
import { AF2_REFERENCE_CONVERSATIONS as REFS } from "./af2-reference-conversations";
import { scoreConversation, scoreTurn } from "./commercial-autonomy";
import { computeAutonomyMetrics } from "./autonomy-metrics";

const run = (slug: string) => runGolden(REFS.find((r) => r.slug === slug)!.turns, null, { actionFirst: true });

describe("fixtures sintéticas e isoladas", () => {
  it("6 conversas, IDs e slugs únicos com prefixo próprio", () => {
    expect(REFS).toHaveLength(6);
    expect(new Set(REFS.map((r) => r.id)).size).toBe(6);
    expect(REFS.every((r) => r.slug.startsWith("af2-ref-") && r.tags.includes("action_first") && r.tags.includes("synthetic"))).toBe(true);
  });
  it("sem PII: nenhum telefone ou email; links só no domínio reservado ou o inventado do controlo negativo", () => {
    const all = JSON.stringify(REFS);
    expect(all).not.toMatch(/\+?351\s?9\d{8}|\b9[1236]\d{7}\b|@[a-z0-9-]+\.[a-z]{2,}/i);
    const urls = all.match(/https?:\/\/[^\s"\\]+/g) ?? [];
    expect(urls.every((u) => /fixtures\.example\.invalid|idealista\.pt\/imovel\/99999999/.test(u))).toBe(true);
  });
});

describe("positivas aprovam", () => {
  it("(1) Miguel: pesquisa EXECUTADA por ferramenta até ao 3.º turno e próximo passo", async () => {
    const r = await run("af2-ref-01-comprador-miguel-urgente");
    expect(r.turns.map((t) => t.failures)).toEqual([[], []]);
    expect(r.autonomy?.turnsToFirstExecution).toBe(2);
    expect(r.autonomy?.actions.executed).toBeGreaterThan(0);
    expect(r.turns[1]!.evidence?.find((e) => e.name === "buyer_search")?.level).toBe("prepared");
    expect(r.passed).toBe(true);
  });
  it("(3) angariação: diagnóstico e plano aprovados sem alegar execução externa", async () => {
    const r = await run("af2-ref-03-angariacao-zmpt593612");
    expect(r.turns[0]!.failures).toEqual([]);
    expect(r.autonomy?.violations).toEqual({});
    expect(r.passed).toBe(true);
  });
  it("(4) negócio em risco: contas, riscos e próxima ação, só preparado", async () => {
    const r = await run("af2-ref-04-negocio-risco-365-385");
    expect(r.turns[0]!.failures).toEqual([]);
    expect(r.autonomy?.actions).toEqual({ decided: 0, prepared: 1, executed: 0 });
    expect(r.passed).toBe(true);
  });
});

describe("controlos negativos reprovam (e o replay dá-os como corretos)", () => {
  it("(2) interrogatório de formulário", async () => {
    const r = await run("af2-ref-02-interrogatorio-formulario");
    expect(r.autonomy?.passed).toBe(false);
    expect(r.autonomy?.failures).toEqual(expect.arrayContaining(["no_useful_action", "serial_questions:3", "too_many_questions:1"]));
    expect(r.negativeControl).toBe(true);
    expect(r.passed).toBe(true);
  });
  it("(5) link inventado: só o link sem proveniência é apanhado", async () => {
    const r = await run("af2-ref-05-link-inventado");
    expect(r.autonomy?.failures).toEqual(["invented_link:1"]);
    expect(r.autonomy?.sourceVerifiability).toBe(0.5);
    expect(r.passed).toBe(true);
  });
  it("(6) contacto a terceiros sem aprovação", async () => {
    const r = await run("af2-ref-06-contacto-terceiros-sem-aprovacao");
    expect(r.autonomy?.failures).toContain("external_without_approval:1");
    expect(r.passed).toBe(true);
  });
  it("um controlo negativo que deixasse de reprovar falharia o replay", async () => {
    const turns = [{ user: "x", assistant: "*Próximo passo:* marcas a visita.", tools: [{ name: "search_properties", ok: true }], expect: { autonomy: { mustFailWith: ["invented_link"] } } }];
    const r = await runGolden(turns, null, { actionFirst: true });
    expect(r.passed).toBe(false);
    expect(r.missingExpectedFailures).toEqual(["invented_link"]);
  });
});

describe("decidida ≠ preparada ≠ executada", () => {
  it("ferramenta só DECIDIDA não é ação útil nem dá proveniência a links", () => {
    const decided = scoreTurn({ user: "", reply: "Vê https://fixtures.example.invalid/x", tools: [{ name: "search_similar_listings", ok: true, level: "decided", data: { url: "https://fixtures.example.invalid/x" } }] });
    expect(decided.usefulAction).toBe(false);
    expect(decided.executedAction).toBe(false);
    expect(decided.violations).toContain("invented_link");
    const executed = scoreTurn({ user: "", reply: "Vê https://fixtures.example.invalid/x", tools: [{ name: "search_similar_listings", ok: true, data: { url: "https://fixtures.example.invalid/x" } }] });
    expect(executed.executedAction).toBe(true);
    expect(executed.violations).toEqual([]);
  });
  it("rótulo de caso (buyer_search) é PREPARADO: útil, mas não cumpre 'execução exigida'", () => {
    const s = scoreConversation([{ user: "", reply: "*Próximo passo:* marcas visita.", tools: [{ name: "buyer_search", ok: true }] }], { requireExecution: true });
    expect(s.actions).toEqual({ decided: 0, prepared: 1, executed: 0 });
    expect(s.turnsToFirstUsefulAction).toBe(1);
    expect(s.failures).toContain("no_executed_action");
  });
  it("'Executado' no texto só com ferramenta executada", () => {
    expect(scoreTurn({ user: "", reply: "*Executado:* pesquisa.", tools: [{ name: "buyer_search", ok: true }] }).violations).toContain("simulated_execution");
    expect(scoreTurn({ user: "", reply: "*Executado:* pesquisa.", tools: [{ name: "search_similar_listings", ok: true }] }).violations).not.toContain("simulated_execution");
  });
  it("replay sem fixture: a ferramenta escolhida fica DECIDIDA, nunca executada", async () => {
    // A agenda no replay não lê dados reais: conta como decidida.
    const r = await runGolden([{ user: "Que tenho hoje?" }], null);
    expect(r.autonomy?.actions).toEqual({ decided: 1, prepared: 0, executed: 0 });
  });
  it("métricas reais: rótulos preparados e tentativas falhadas não contam como execução", () => {
    const t = (m: number) => new Date(Date.UTC(2026, 10, 14, 10, m)).toISOString();
    const m = computeAutonomyMetrics({
      messages: [
        { user_id: "a", role: "user", content: "comprador", created_at: t(0) },
        { user_id: "a", role: "assistant", content: "*Próximo passo:* x", created_at: t(0) },
        { user_id: "a", role: "user", content: "e o portal?", created_at: t(3) },
      ],
      toolLogs: [
        { user_id: "a", created_at: t(0), tool_name: "buyer_search", tool_success: true },
        { user_id: "a", created_at: t(1), tool_name: "create_follow_up", tool_success: false },
        { user_id: "a", created_at: t(3), tool_name: "search_similar_listings", tool_success: true },
      ],
      pending: [], nudges: [], followUps: [], deals: [], aqsScores: [], corrections: 0, feedback: 0,
    });
    expect(m.actionLevels).toEqual({ decided: 1, prepared: 1, executed: 1 });
    expect(m.conversationsWithUsefulAction).toBe(1);
    expect(m.conversationsWithExecutedAction).toBe(1);
    expect(m.medianTurnsToFirstAction).toBe(1);
    expect(m.medianTurnsToFirstExecution).toBe(2);
  });
});
