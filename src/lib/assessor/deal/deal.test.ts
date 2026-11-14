// TESTE C — negócio em risco: proposta 385k, avaliação 365k, crédito a 90% do
// menor valor, 45k de capitais, vendedor alega outro interessado a 390k.
import { describe, expect, it } from "vitest";
import { __resetAccountFlagsForTests } from "@/lib/flags/account-flag.server";
import { runDealRisk } from "./deal.server";
import { extractDealBrief, isDealRisk } from "./deal-brief";
import { dealPlan } from "./deal-plan";
import { NOT_BANK_DECISION } from "../commercial/financial-simulator";
import { scoreConversation, type TurnInput } from "../eval/commercial-autonomy";

const NOW = new Date("2026-11-14T14:00:00Z");
const C =
  "Negócio em risco: o meu comprador fez proposta de 385k, a avaliação do banco deu 365k. O banco financia até 90% do menor valor e ele tem 45k de capitais próprios. O vendedor diz que tem outro interessado a 390k.";
const sp = (t: string | null | undefined) => String(t ?? "").replace(/[\u00a0\u202f]/g, " ");

function conversation() {
  const rows: Array<{ role: string; content: string; created_at: string }> = [];
  const scored: TurnInput[] = [];
  async function say(text: string) {
    rows.push({ role: "user", content: text, created_at: NOW.toISOString() });
    const t = await runDealRisk({ supabase: {}, userId: "u", channel: "whatsapp", trimmed: text, now: NOW, skipFlagCheck: true, deps: { loadRecent: async () => rows.map((r) => ({ ...r })) } });
    if (t) {
      rows.push({ role: "assistant", content: t.reply, created_at: NOW.toISOString() });
      scored.push({ user: text, reply: t.reply, tools: t.acted ? [{ name: "deal_risk_analysis", ok: true }] : [] });
    }
    return t ? { ...t, reply: sp(t.reply) } : null;
  }
  return { say, scored };
}

describe("factos vs alegações", () => {
  it("extrai o caso C e separa a oferta alegada", () => {
    expect(isDealRisk(C)).toBe(true);
    expect(extractDealBrief(C, NOW)).toMatchObject({
      proposalPrice: 385000, appraisal: 365000, ltv: 0.9, ownFunds: 45000,
      allegedOffer: 390000, allegedBy: "vendedor", age: null, financingClause: null,
    });
  });
  it("não confunde com comprador novo nem com marcação de escritura sem risco", () => {
    expect(isDealRisk("Tenho um comprador, o Miguel: procura T1 em Gaia até 150k")).toBe(false);
  });
});

describe("Teste C — primeira ação útil no 1.º turno", () => {
  it("contas rigorosas, riscos, próxima ação com responsável e prazo, recomendação de parar, mensagens e tarefas", async () => {
    const c = conversation();
    const t = (await c.say(C))!;
    expect(t.acted).toBe(true);
    expect(t.reply).toContain("*Confirmado (por ti):* proposta 385 000 € · avaliação 365 000 € · crédito até 90% do menor valor · capitais 45 000 €.");
    expect(t.reply).toMatch(/\*Por verificar:\* outro interessado a 390 000 € \(dito pelo vendedor, sem prova\) — não entra nas contas/);
    // Contas (simulador): a alegação nunca entra.
    const contas = t.reply.slice(t.reply.indexOf("*Contas*"), t.reply.indexOf("*Riscos detetados*"));
    expect(contas).not.toContain("390");
    expect(contas).toMatch(/A 385 000 €: crédito máx\. 328 500 € → entrada 56 500 € \+ encargos ~23 888 € = 80 388 €; capitais 45 000 € → faltam ~35 388 €/);
    expect(contas).toMatch(/A 365 000 € \(valor da avaliação\).*faltam ~13 628 €/);
    expect(contas).toMatch(/Com IMT Jovem, a 365 000 €.*sobram ~1696 €/);
    expect(contas).toMatch(/Preço máximo que fecha com 45 000 €: ~292 000 € \(com IMT Jovem: ~366 000 €\)/);
    expect(contas).toMatch(/IMT 17 037 €, Selo da compra 3080 €, Selo do crédito 1971 €, escritura e registo ~1000 €, custos do banco ~800 €/);
    expect(contas).toContain("habitação própria e permanente (assumido)");
    expect(t.reply).toContain(sp(NOT_BANK_DECISION));
    // Riscos.
    expect(t.reply).toMatch(/\[alta\] avaliação 365 000 € abaixo da proposta em 20 000 € \(5,2%\) \(confirmado\)/);
    expect(t.reply).toMatch(/\[média\] outro interessado a 390 000 € dito pelo vendedor, sem prova \(alegado\)/);
    expect(t.reply).toMatch(/condição de financiamento no CPCV por confirmar/);
    // Próxima melhor ação + parar.
    expect(t.reply).toMatch(/\*Próximo passo:\* hoje confirmas a idade do comprador \(IMT Jovem\) e propões ao vendedor 365 000 € com o relatório de avaliação\. Porquê: .+ Responsável: Tu\. Prazo: 14\/11\./);
    expect(t.reply).toMatch(/\*Se não fechar:\* .*recomendo parar antes de pagar sinal/);
    // Execução assistida: mensagens preparadas, tarefas pendentes, nada executado.
    expect(t.reply).toContain("*Mensagem para o vendedor (preparada — copias e envias tu; sem dados financeiros do comprador):*");
    expect(t.reply).toContain("*Mensagem para o comprador (preparada — copias e envias tu):*");
    expect(t.reply).toMatch(/\*Tarefas prontas \(pendentes — diz "cria as tarefas" e ficam nos teus Seguimentos\):\*/);
    expect(t.reply).toContain("16/11 · Tu: Negócio 385k: decisão — avançar ou parar");
    expect(t.reply).toMatch(/\*Preparado:\* contas, 2 mensagens, 4 tarefas/);
    expect(t.reply).toMatch(/\*Pendente \(aguarda o teu ok\):\* gravar as tarefas nos Seguimentos; enviar mensagens/);
    expect(t.reply).not.toContain("*Executado:*");
    expect(t.reply.length).toBeLessThan(4000);
    const s = scoreConversation(c.scored);
    expect(s.turnsToFirstUsefulAction).toBe(1);
    expect(s.hasConcreteDelivery).toBe(true);
    expect(s.violations).toEqual({});
    expect(s.passed).toBe(true);
  });

  it("proteção de dados: a mensagem ao vendedor não revela capitais, idade nem contas do comprador", async () => {
    const t = (await conversation().say(C))!;
    const seller = t.reply.split("*Mensagem para o vendedor")[1]!.split("*Mensagem para o comprador")[0]!;
    expect(seller).not.toMatch(/45 000|capitais|anos|IMT|faltam/);
    expect(seller).toMatch(/peço que ma confirme por escrito/);
  });
});

describe("Teste C — casos limite", () => {
  it("comprador com 32 anos: a 365k fecha → propor a avaliação, sem pergunta de idade", async () => {
    const p = dealPlan(extractDealBrief(`${C} O comprador tem 32 anos.`, NOW), NOW);
    expect(p.viability).toBe("viable_at_appraisal");
    expect(sp(p.next!.action)).toMatch(/propões ao vendedor 365 000 €/);
    expect(p.questions.join(" ")).not.toMatch(/35 anos/);
  });
  it("comprador com 40 anos: inviável → recomenda parar", () => {
    const p = dealPlan(extractDealBrief(`${C} O comprador tem 40 anos.`, NOW), NOW);
    expect(p.viability).toBe("unviable");
    expect(sp(p.next!.action)).toMatch(/preço máximo que fecha é ~292 000 €/);
    expect(p.next!.stop).toMatch(/recomendo parar este negócio/);
  });
  it("contas que fecham: avança para aprovação final", () => {
    const p = dealPlan(extractDealBrief("Negócio: proposta de 300k, avaliação do banco 310k, capitais de 60k.", NOW), NOW);
    expect(p.viability).toBe("viable");
    expect(p.next!.action).toMatch(/aprovação final/);
    expect(p.messages.find((m) => m.to === "o vendedor")).toBeUndefined();
  });
  it("dados incompletos: sem capitais não faz contas e pergunta tudo de uma vez", async () => {
    const t = (await conversation().say("A avaliação do banco deu 365k, abaixo da proposta de 385k."))!;
    expect(t.acted).toBe(false);
    expect(t.reply).not.toContain("*Contas*");
    expect(t.reply).toMatch(/de uma vez:\n- Quanto tem o comprador de capitais próprios\?/);
  });
  it("continuação: a idade dita depois atualiza as contas sem repetir perguntas", async () => {
    const c = conversation();
    await c.say(C);
    const t2 = (await c.say("Tem 32 anos"))!;
    expect(t2.reply).toMatch(/\(atualização\)\*/);
    expect(t2.plan.viability).toBe("viable_at_appraisal");
    expect(t2.reply).not.toContain("O comprador tem até 35 anos?");
  });
  it("CPCV sem condição de financiamento e a 5 dias: riscos altos", () => {
    const p = dealPlan(extractDealBrief(`${C} CPCV marcado para 19/11, sem condição de financiamento, sinal de 38k.`, NOW), NOW);
    const txt = p.risks.map((r) => `${r.severity} ${r.text}`).join(" | ");
    expect(txt).toMatch(/alta CPCV em 5 dias/);
    expect(txt).toMatch(/alta CPCV sem condição de financiamento: se o crédito falhar, o sinal pode perder-se/);
  });
  it("sinais de desistência são risco alto", () => {
    const p = dealPlan(extractDealBrief(`${C} O comprador está a pensar desistir.`, NOW), NOW);
    expect(p.risks.some((r) => r.kind === "withdrawal" && r.severity === "alta")).toBe(true);
  });
  it("interruptor desligado: segue para o Afonso normal", async () => {
    __resetAccountFlagsForTests();
    const t = await runDealRisk({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }, userId: "u", channel: "whatsapp", trimmed: C, now: NOW, deps: { loadRecent: async () => [] } });
    expect(t).toBeNull();
  });
});
