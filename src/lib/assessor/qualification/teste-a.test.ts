// TESTE A — comprador Miguel: T1 Gaia perto do metro, pré-aprovação 150k,
// 15k de capitais, prazo 30/11. Critérios de aceitação action-first.
import { describe, expect, it } from "vitest";
import { runBuyerQualification, type QualificationDeps } from "./qualification.server";
import { guardSearchAndLinks } from "./url-provenance";
import { scoreConversation, scoreTurn, type ToolRun, type TurnInput } from "../eval/commercial-autonomy";

const NOW = new Date("2026-11-14T14:00:00Z");
const MIGUEL =
  "Tenho um comprador, o Miguel: procura T1 em Gaia, perto do metro, pré-aprovação até 150k, 15k de capitais próprios, prazo 30/11.";
const URL1 = "https://www.idealista.pt/imovel/33445566/";
const sp = (t: string) => t.replace(/[\u00a0\u202f]/g, " ");

function conversation(over: Partial<QualificationDeps> = {}) {
  const rows: Array<{ role: string; content: string; created_at: string }> = [];
  // Evidência do turno: só as ferramentas que correram (executadas).
  let evidence: ToolRun[] = [];
  const portal = over.searchPortals ?? (async () => ({
    status: "ok" as const,
    results: [{ url: URL1, title: "Apartamento T1 em Gaia ZMPT-12345, 139.000 €", description: "55 m2, elevador, a 300 m do metro", host: "idealista.pt" }],
  }));
  const props = over.loadProperties ?? (async () => []);
  const deps: QualificationDeps = {
    loadRecent: async () => rows.map((r) => ({ ...r })),
    loadProperties: async () => { const r = await props(); evidence.push({ name: "search_properties", ok: true, data: { rows: r } }); return r; },
    searchPortals: async (b) => {
      const r = await portal(b);
      if (r.status === "ok") evidence.push({ name: "search_similar_listings", ok: true, data: { results: r.results } });
      return r;
    },
  };
  const scored: TurnInput[] = [];
  async function say(text: string) {
    rows.push({ role: "user", content: text, created_at: NOW.toISOString() });
    evidence = [];
    const t = (await runBuyerQualification({ supabase: {}, userId: "u", channel: "whatsapp", trimmed: text, now: NOW, deps, skipFlagCheck: true }))!;
    rows.push({ role: "assistant", content: t.reply, created_at: NOW.toISOString() });
    scored.push({ user: text, reply: t.reply, tools: t.acted ? [{ name: "buyer_search", ok: true }, ...evidence] : [] });
    return { ...t, reply: sp(t.reply) };
  }
  return { say, scored };
}

describe("Teste A — comprador Miguel", () => {
  it("variante 'até 15 min do metro, urgente': teto rigoroso, riscos, próxima ação com responsável e prazo, tarefas pendentes", async () => {
    const c = conversation();
    const t = await c.say("Tenho um comprador, o Miguel: procura T1 em Gaia até 15 min do metro, pré-aprovação até 150k, 15k de capitais próprios, urgente.");
    expect(t.acted).toBe(true);
    expect(t.brief.nearMetro?.value).toBe(true);
    expect(t.reply).toMatch(/Confirmado: T1, Gaia, perto do metro/);
    // Idade não dita: contas com IMT/Selo normais e a isenção jovem como hipótese.
    expect(t.reply).toMatch(/Com crédito a 90%: teto ~114 000 € → entrada 11 400 € \+ custos ~/);
    expect(t.reply).toMatch(/Se tiver direito à isenção IMT\/IS Jovem, o teto a 90% sobe para ~125 000 € — por confirmar: idade até 35 anos \(por confirmar\)/);
    expect(t.reply).toMatch(/Com garantia pública jovem \(até 100% de crédito, decide o banco; só se for elegível\): até ~162 000 €/);
    expect(t.reply).toMatch(/\*Prioridade alta: urgente, sem data — confirma a data limite\.\*/);
    expect(t.reply).toMatch(/\[alta\] com crédito a 90%, o orçamento provisório é ~114 000 €, abaixo da pré-aprovação de 150 000 € \(calculado\)/);
    expect(t.reply).toMatch(/\[média\] pré-aprovação não é aprovação final/);
    expect(t.reply).toMatch(/\*Próximo passo:\* confirmas a idade do Miguel e pedes ao banco a simulação com um imóvel concreto\. Porquê: .+ Responsável: Tu\. Prazo: 14\/11\./);
    expect(t.reply).toMatch(/\*Tarefas prontas \(pendentes — diz "cria as tarefas"/);
    expect(scoreConversation(c.scored).passed).toBe(true);
  });

  it("1.º turno: pesquisa feita, proposta verificável, mensagem preparada, estados e próximo passo", async () => {
    const c = conversation();
    const t = await c.say(MIGUEL);
    expect(t.acted).toBe(true);
    // Proposta: link direto, referência, preço com data, local, características, fonte, porquê, incertezas.
    expect(t.reply).toContain(URL1);
    expect(t.reply).toContain("Ref. ZMPT-12345");
    expect(t.reply).toMatch(/139 000 € \(visto na pesquisa a 14\/11; confirma no anúncio\)/);
    expect(t.reply).toContain("Local: Gaia");
    expect(t.reply).toContain("Características: 55 m², elevador");
    expect(t.reply).toContain("Origem: idealista.pt");
    expect(t.reply).toMatch(/Porquê: T1 como pedido, em Gaia\./);
    // 139k está acima do orçamento a 90% (~114k) mas dentro do de garantia pública: aparece, com aviso.
    expect(t.reply).toContain("acima do orçamento provisório a 90%; só cabe com garantia pública (decide o banco)");
    expect(t.reply).toContain("Metro: por confirmar · Estado: por confirmar");
    expect(t.reply).not.toMatch(/!\[|\.(jpg|jpeg|png|webp)\b/i);
    // Material entregue, não prometido; nada sai sem aprovação.
    expect(t.reply).toContain("*Mensagem para o comprador (preparada — copias e envias tu):*");
    expect(t.reply).toMatch(/\*Executado:\* procurei na tua carteira \(0 a encaixar\); pesquisa nos portais \(1 anúncio\)/);
    expect(t.reply).toMatch(/\*Pendente \(aguarda o teu ok\):\* gravar as tarefas nos Seguimentos; enviar ao comprador ou marcar visitas com terceiros — nada sai sem o teu ok/);
    expect(t.reply).toMatch(/\*Sem acesso:\* carteira interna da Rede\/Zome \(só vejo o site público\)/);
    expect(t.reply).toContain("*Próximo passo:*");
    const s = scoreConversation(c.scored);
    expect(s.turnsToFirstUsefulAction).toBe(1);
    expect(s.hasConcreteDelivery).toBe(true);
    expect(s.sourceVerifiability).toBe(1);
    expect(s.violations).toEqual({});
    expect(s.passed).toBe(true);
  });

  it("dados incompletos: perguntas agrupadas e ação até ao 3.º turno", async () => {
    const c = conversation();
    const t1 = await c.say("Tenho um comprador, o Miguel, com pré-aprovação.");
    expect(t1.acted).toBe(false);
    const t2 = await c.say("Procura T1 em Gaia");
    // A pergunta que bloqueia volta, curta, em vez de uma lista vazia.
    expect(t2.reply).toMatch(/Falta só o orçamento aproximado \(ou o valor da pré-aprovação\)/);
    const t3 = await c.say("Pré-aprovação até 150k");
    expect(t3.acted).toBe(true);
    expect(t3.reply.startsWith("*Pesquisa para Miguel*")).toBe(true);
    const s = scoreConversation(c.scored);
    expect(s.turnsToFirstUsefulAction).toBeLessThanOrEqual(3);
    expect(Math.max(...s.perTurn.map((p) => p.questions))).toBeLessThanOrEqual(3);
    expect(s.passed).toBe(true);
  });

  it("sem ferramentas: não diz que pesquisou, não mostra anúncios, pede referências reais", async () => {
    const c = conversation({
      loadProperties: async () => { throw new Error("db"); },
      searchPortals: async () => ({ status: "failed", results: [] }),
    });
    const t = await c.say(MIGUEL);
    expect(t.reply).not.toMatch(/\*Executado:\*/);
    expect(t.reply).not.toMatch(/https?:\/\/(?!app\.meuafonso)/);
    expect(t.reply).toMatch(/A pesquisa nos portais falhou agora/);
    expect(t.reply).toMatch(/\*Próximo passo:\* confirmas a idade do Miguel e pedes ao banco a simulação/);
    expect(t.reply).toContain("Manda-me referências ZMPT ou links");
    expect(t.reply).not.toContain("*Mensagem para o comprador");
  });

  it("URL falso numa resposta da IA é retirado e conta como imóvel inventado", () => {
    const fake = "Encontrei este T1: https://www.idealista.pt/imovel/99999999/";
    expect(guardSearchAndLinks(fake, []).reply).not.toContain("99999999");
    expect(scoreTurn({ user: "", reply: fake, tools: [] }).violations).toContain("invented_link");
  });

  it("ação externa sem aprovação é apanhada; a resposta do Afonso nunca a afirma", async () => {
    expect(scoreTurn({ user: "", reply: "Já mandei ao Miguel os dois imóveis.", tools: [] }).violations).toContain("external_without_approval");
    const t = await conversation().say(MIGUEL);
    expect(scoreTurn({ user: MIGUEL, reply: t.reply, tools: [{ name: "buyer_search", ok: true }, { name: "search_similar_listings", ok: true, data: { urls: [URL1] } }, { name: "search_properties", ok: true }] }).violations).toEqual([]);
  });
});
