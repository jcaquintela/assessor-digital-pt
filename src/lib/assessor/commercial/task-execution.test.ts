// Execução assistida com consentimento: as tarefas só ficam gravadas quando o
// consultor diz "cria as tarefas"; nunca duplicam; falhas são ditas.
import { describe, expect, it } from "vitest";
import { runCreateTasks, type TaskExecDeps } from "./task-execution.server";
import { isCreateTasksCommand, type PreparedTask } from "./assisted-execution";
import { runDealRisk } from "../deal/deal.server";
import { runListingDiagnosis } from "../listing/listing.server";
import { runBuyerQualification } from "../qualification/qualification.server";

const NOW = new Date("2026-11-14T14:00:00Z");
const LATER = new Date(NOW.getTime() + 5 * 60_000);
const C = "Negócio em risco: o meu comprador fez proposta de 385k, a avaliação do banco deu 365k. O banco financia até 90% do menor valor e ele tem 45k de capitais próprios. O vendedor diz que tem outro interessado a 390k.";
const B = "Tenho a angariação exclusiva ZMPT593612, moradia T3 em Serzedo e Perosinho a 449k. Está há 6 semanas no mercado, zero visitas, só 2 contactos de colegas. Concorrente: ZMPT593954.";
const A = "Tenho um comprador, o Miguel: procura T1 em Gaia até 15 min do metro, pré-aprovação até 150k, 15k de capitais próprios, urgente.";

type Row = { role: string; content: string; created_at: string };

async function afterDeal(): Promise<Row[]> {
  const t = (await runDealRisk({ supabase: {}, userId: "u", channel: "whatsapp", trimmed: C, now: NOW, skipFlagCheck: true, deps: { loadRecent: async () => [] } }))!;
  return [{ role: "user", content: C, created_at: NOW.toISOString() }, { role: "assistant", content: t.reply, created_at: NOW.toISOString() }];
}

function deps(rows: Row[], opts: { existing?: Set<string>; fail?: boolean } = {}) {
  const created: PreparedTask[] = [];
  const d: TaskExecDeps = {
    loadRecent: async () => rows,
    existingTitles: async () => opts.existing ?? new Set(),
    createFollowUp: async (t) => { if (opts.fail) return { ok: false, created: false, error: "db" }; created.push(t); return { ok: true, created: true }; },
  };
  return { d, created };
}

describe("consentimento explícito", () => {
  it("só frases explícitas contam", () => {
    expect(isCreateTasksCommand("cria as tarefas")).toBe(true);
    expect(isCreateTasksCommand("Sim, cria os seguimentos")).toBe(true);
    expect(isCreateTasksCommand("sim")).toBe(false);
    expect(isCreateTasksCommand("as tarefas parecem bem")).toBe(false);
  });
  it("propor (A, B, C) nunca grava nada; só o pedido grava", async () => {
    const rows = await afterDeal();
    const { d, created } = deps(rows);
    expect(await runCreateTasks({ supabase: {}, userId: "u", channel: "whatsapp", trimmed: "ok obrigado", now: LATER, deps: d, skipFlagCheck: true })).toBeNull();
    expect(created).toHaveLength(0);
  });
  it("sem proposta comercial recente, não trata o pedido (segue para o Afonso normal)", async () => {
    const { d } = deps([{ role: "assistant", content: "Olá!", created_at: NOW.toISOString() }]);
    expect(await runCreateTasks({ supabase: {}, userId: "u", channel: "whatsapp", trimmed: "cria as tarefas", now: LATER, deps: d, skipFlagCheck: true })).toBeNull();
  });
  it("proposta com mais de 2 horas já não é gravada às cegas", async () => {
    const { d } = deps(await afterDeal());
    expect(await runCreateTasks({ supabase: {}, userId: "u", channel: "whatsapp", trimmed: "cria as tarefas", now: new Date(NOW.getTime() + 3 * 3600_000), deps: d, skipFlagCheck: true })).toBeNull();
  });
});

describe("Teste C — PREPARADO → EXECUTADO", () => {
  it("grava exatamente as 4 tarefas mostradas, com Executado só depois da gravação", async () => {
    const { d, created } = deps(await afterDeal());
    const r = (await runCreateTasks({ supabase: {}, userId: "u", channel: "whatsapp", trimmed: "cria as tarefas", now: LATER, deps: d, skipFlagCheck: true }))!;
    expect(created.map((t) => `${t.dueYmd} ${t.title}`)).toEqual([
      "2026-11-14 Negócio 385k: confirmar idade (IMT Jovem) e capitais extra do comprador",
      "2026-11-14 Negócio 385k: propor 365k ao vendedor com a avaliação",
      "2026-11-14 Negócio 385k: confirmar no CPCV a condição de financiamento e o sinal",
      "2026-11-16 Negócio 385k: decisão — avançar ou parar",
    ]);
    expect(r.created).toBe(4);
    expect(r.reply).toMatch(/Gravei 4 tarefas nos teus Seguimentos/);
    expect(r.reply).toMatch(/\*Executado:\* 4 tarefas gravadas nos Seguimentos/);
  });
  it("repetir o pedido não duplica", async () => {
    const rows = await afterDeal();
    const existing = new Set(["2026-11-14|Negócio 385k: propor 365k ao vendedor com a avaliação", "2026-11-16|Negócio 385k: decisão — avançar ou parar"]);
    const { d, created } = deps(rows, { existing });
    const r = (await runCreateTasks({ supabase: {}, userId: "u", channel: "whatsapp", trimmed: "cria as tarefas", now: LATER, deps: d, skipFlagCheck: true }))!;
    expect(created).toHaveLength(2);
    expect(r.reply).toMatch(/Já lá estavam \(não dupliquei\)/);
  });
  it("falha na gravação: diz que não gravou e não mostra Executado", async () => {
    const { d } = deps(await afterDeal(), { fail: true });
    const r = (await runCreateTasks({ supabase: {}, userId: "u", channel: "whatsapp", trimmed: "cria as tarefas", now: LATER, deps: d, skipFlagCheck: true }))!;
    expect(r.created).toBe(0);
    expect(r.reply).toMatch(/Não consegui gravar: .* — ficou como estava/);
    expect(r.reply).not.toContain("*Executado:*");
  });
});

describe("Testes A e B — tarefas também gravam com consentimento", () => {
  it("B: plano de 7 dias vira 5 tarefas datadas", async () => {
    const t = (await runListingDiagnosis({ supabase: {}, userId: "u", channel: "whatsapp", trimmed: B, now: NOW, skipFlagCheck: true,
      deps: { loadRecent: async () => [], findOwnListing: async () => ({ found: false, price: null, url: null }), searchComparables: async () => ({ status: "not_run", results: [] }) } }))!;
    const { d, created } = deps([{ role: "user", content: B, created_at: NOW.toISOString() }, { role: "assistant", content: t.reply, created_at: NOW.toISOString() }]);
    await runCreateTasks({ supabase: {}, userId: "u", channel: "whatsapp", trimmed: "cria as tarefas", now: LATER, deps: d, skipFlagCheck: true });
    expect(created.map((x) => x.dueYmd)).toEqual(["2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17", "2026-11-20"]);
    expect(created[0]!.title).toMatch(/^ZMPT593612: /);
  });
  it("A: tarefas do Miguel (urgente)", async () => {
    const t = (await runBuyerQualification({ supabase: {}, userId: "u", channel: "whatsapp", trimmed: A, now: NOW, skipFlagCheck: true,
      deps: { loadRecent: async () => [], loadProperties: async () => [], searchPortals: async () => ({ status: "not_run", results: [] }) } }))!;
    const { d, created } = deps([{ role: "user", content: A, created_at: NOW.toISOString() }, { role: "assistant", content: t.reply, created_at: NOW.toISOString() }]);
    await runCreateTasks({ supabase: {}, userId: "u", channel: "whatsapp", trimmed: "cria as tarefas", now: LATER, deps: d, skipFlagCheck: true });
    expect(created.map((x) => x.title)).toEqual([
      "Miguel: validar com o banco a pré-aprovação e o teto (e a idade para IMT Jovem)",
      "Miguel: marcar visitas aos imóveis que encaixam",
      "Miguel: rever a pesquisa com o Afonso",
    ]);
    expect(created[1]!.dueYmd).toBe("2026-11-15");
  });
});
