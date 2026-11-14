// TESTE B — angariação exclusiva ZMPT593612 sem visitas há 6 semanas.
import { describe, expect, it } from "vitest";
import { __resetAccountFlagsForTests } from "@/lib/flags/account-flag.server";
import { runListingDiagnosis, type ListingDeps } from "./listing.server";
import { extractListingBrief, isListingDiagnosis } from "./listing-brief";
import { checkPrice, compareCompetitor, readFunnel } from "./diagnosis";
import { formatActionStates } from "../commercial/action-states";
import { scoreConversation, scoreTurn, type TurnInput } from "../eval/commercial-autonomy";
import { guardExternalClaims, guardSearchAndLinks, NO_MONITORING_NOTE, NOT_DONE_EXTERNAL_NOTE } from "../qualification/url-provenance";

const NOW = new Date("2026-11-14T14:00:00Z");
const B =
  "Tenho a angariação exclusiva ZMPT593612, moradia T3 em Serzedo e Perosinho a 449k. Está há 6 semanas no mercado, zero visitas, só 2 contactos de colegas. Concorrente: ZMPT593954. Estratégia orgânica, com margem para pago.";
const COMP_URL = "https://www.idealista.pt/imovel/111222/";

/** Os valores em € usam espaços não separáveis; os testes leem espaços normais. */
const sp = (t: string | null | undefined) => String(t ?? "").replace(/[\u00a0\u202f]/g, " ");
type Row = { role: string; content: string; created_at: string };
function conversation(opts: Partial<ListingDeps> = {}) {
  const rows: Row[] = [];
  const calls = { comparables: 0 };
  const deps: ListingDeps = {
    loadRecent: async () => rows.map((r) => ({ ...r })),
    findOwnListing: opts.findOwnListing ?? (async () => ({ found: false, price: null, url: null })),
    searchComparables: opts.searchComparables ?? (async () => {
      calls.comparables++;
      return { status: "ok", results: [{ url: COMP_URL, title: "Moradia T3 em Serzedo, 430.000 €", host: "idealista.pt" }] };
    }),
  };
  const scored: TurnInput[] = [];
  async function say(text: string) {
    const out = await sayRaw(text);
    return out ? { ...out, reply: sp(out.reply) } : out;
  }
  async function sayRaw(text: string) {
    rows.push({ role: "user", content: text, created_at: NOW.toISOString() });
    const t = await runListingDiagnosis({ supabase: {}, userId: "u", channel: "whatsapp", trimmed: text, now: NOW, deps, skipFlagCheck: true });
    if (t) {
      rows.push({ role: "assistant", content: t.reply, created_at: NOW.toISOString() });
      scored.push({
        user: text, reply: t.reply,
        tools: t.acted ? [{ name: "listing_diagnosis", ok: true, data: { urls: [COMP_URL] } }] : [],
      });
    }
    return t;
  }
  return { say, scored, calls };
}

describe("factos da angariação", () => {
  it("extrai o caso B sem confundir o concorrente com o imóvel", () => {
    const b = extractListingBrief(B);
    expect(b).toMatchObject({
      ref: "ZMPT593612", competitorRef: "ZMPT593954", exclusive: true, propertyType: "moradia", typology: "T3",
      zone: "Serzedo e Perosinho", askingPrice: 449000, weeksOnMarket: 6, visits: 0, colleagueContacts: 2,
      organic: true, paidMargin: true, elsewherePrice: null, competitorPrice: null,
    });
  });
  it("é angariação, não comprador nem marcação de visita", () => {
    expect(isListingDiagnosis("Marca visita à angariação de Gaia amanhã às 15h")).toBe(false);
    expect(isListingDiagnosis(B)).toBe(true);
    expect(isListingDiagnosis("Tenho um comprador, o Miguel: procura T1 em Gaia até 150k")).toBe(false);
    expect(isListingDiagnosis("Visita amanhã às 15h com o Paulo")).toBe(false);
  });
});

describe("Teste B — primeira ação útil no 1.º turno", () => {
  it("diagnóstico de procura, kit completo, plano com responsáveis e datas, estados e próximo passo", async () => {
    const c = conversation();
    const t = (await c.say(B))!;
    expect(t.acted).toBe(true);
    expect(t.reply).toMatch(/0 visitas em 6 semanas é um problema de \*geração de procura\*/);
    expect(t.reply).toMatch(/Os 2 contactos de colegas são procura indireta/);
    for (const part of ["Mensagem aos colegas:", "Redes:", "Foto principal:", "Diferenciação:", "Canais:", "KPI:"]) {
      expect(t.reply).toContain(part);
    }
    expect(t.reply).toContain("*Plano 7 dias*");
    expect(t.reply).toMatch(/14\/11 · Tu: /);
    expect(t.reply).toMatch(/20\/11 · Tu: checkpoint final: meta proposta ≥3 contactos qualificados e ≥1 visita marcada/);
    expect(t.reply).toMatch(/Pago só com evidência no dia 7/);
    expect(t.reply).toMatch(/\*Executado:\* procurei ZMPT593612 na tua carteira \(não está lá\); pesquisa de comparáveis nos portais \(1 anúncio\)/);
    expect(t.reply).toMatch(/\*Preparado:\* diagnóstico, kit orgânico e plano de 7 dias/);
    expect(t.reply).toMatch(/\*Aguarda aprovação:\* enviar mensagens, publicar, mudar preço ou anúncio, gastar margem paga/);
    expect(t.reply).toMatch(/\*Sem acesso:\* estatísticas do anúncio nos portais, anúncio do concorrente ZMPT593954, carteira da Rede\/Zome, acompanhar o anúncio sozinho/);
    expect(t.reply).toContain("*Próximo passo:*");
    expect(t.reply).toContain(COMP_URL);
    // Cabe numa mensagem de WhatsApp/Telegram.
    expect(t.reply.length).toBeLessThan(4000);
    const s = scoreConversation(c.scored);
    expect(s.turnsToFirstUsefulAction).toBe(1);
    expect(s.hasConcreteDelivery).toBe(true);
    expect(s.sourceVerifiability).toBe(1);
    expect(s.violations).toEqual({});
    expect(s.passed).toBe(true);
  });

  it("concorrente sem anúncio: não compara nem conclui pela diferença de preço", async () => {
    const t = (await conversation().say(B))!;
    expect(t.reply).toMatch(/\*Concorrente ZMPT593954:\* sem o anúncio não tenho preço, área nem estado verificados, por isso não comparo/);
    expect(t.reply).not.toMatch(/(mais|menos) competitiv[oa] (que|do que)/i);
  });

  it("concorrente com preço dito: mostra a diferença mas diz que não prova competitividade", () => {
    const b = extractListingBrief(`${B} O concorrente ZMPT593954 está a 420k.`);
    expect(b.competitorPrice).toBe(420000);
    expect(sp(compareCompetitor(b))).toMatch(/420 000 € \(dito por ti, por verificar\) — o teu está 29 000 € acima\. Isto sozinho não prova que o teu está caro ou competitivo/);
  });

  it("preço divergente (449k vs 455k noutros portais): verificação, não facto", async () => {
    const t = (await conversation().say(`${B} Vi que aparece a 455k noutros portais.`))!;
    expect(t.reply).toMatch(/\*Preço divergente:\* disseste 449 000 €, mas referes 455 000 € noutros portais \(não verificado por mim\)/);
    expect(t.reply).toMatch(/Até lá trabalho com 449 000 € como "informado por ti"/);
    expect(t.reply).toMatch(/\*Próximo passo:\* hoje confirmas o preço publicado em cada portal/);
  });

  it("preço divergente com a própria carteira também é sinalizado", () => {
    const b = extractListingBrief(B);
    expect(sp(checkPrice(b, { ownRecordPrice: 455000 }).line)).toMatch(/na tua carteira está 455 000 €/);
    expect(checkPrice(b, { ownRecordPrice: 449000 }).discrepancy).toBe(false);
  });
});

describe("Teste B — funil e continuação", () => {
  it("sem números do portal diz exatamente o que falta", () => {
    expect(readFunnel(extractListingBrief(B)).lines.join(" ")).toMatch(/Sem impressões, cliques, pedidos de contacto do portal não sei em que ponto o funil parte/);
  });
  it("com números, encontra onde o funil parte e atualiza sem repetir o kit", async () => {
    const c = conversation();
    await c.say(B);
    const t2 = (await c.say("No idealista tem 3000 impressões e 15 cliques"))!;
    expect(t2.reply).toMatch(/— atualização\*/);
    expect(t2.reply).toMatch(/3000 impressões e 15 cliques \(0\.5%\) — vê-se mas não se abre/);
    expect(t2.reply).toMatch(/\*Próximo passo:\* hoje trocas a 1\.ª foto e o título/);
    expect(t2.reply).not.toContain("*Kit orgânico");
    expect(scoreConversation(c.scored).passed).toBe(true);
  });
  it("pouco alcance: margem paga só se justifica com evidência", () => {
    const r = readFunnel(extractListingBrief(`${B} 200 impressões, 10 cliques`));
    expect(r.breakAt).toBe("reach");
  });
});

describe("Teste B — falhas e dados incompletos", () => {
  it("ferramentas indisponíveis: não inventa comparáveis e não diz que executou a pesquisa", async () => {
    const c = conversation({ searchComparables: async () => ({ status: "failed", results: [] }), findOwnListing: async () => { throw new Error("db"); } });
    const t = (await c.say(B))!;
    expect(t.reply).toMatch(/A pesquisa de comparáveis nos portais falhou agora/);
    expect(t.reply).not.toMatch(/\*Executado:\*/);
    expect(t.reply).not.toMatch(/https?:\/\/(?!app\.meuafonso)/);
    expect(t.reply).toContain("*Kit orgânico");
  });
  it("sem identificar o imóvel: pergunta agrupada, uma só mensagem", async () => {
    const t = (await conversation().say("A minha angariação está há 6 semanas sem visitas, o que faço?"))!;
    expect(t.acted).toBe(false);
    expect(t.reply).toMatch(/de uma vez:\n- Referência ZMPT ou tipologia e zona\?\n- Preço pedido\?/);
    expect(scoreTurn({ user: "", reply: t.reply, tools: [] }).violations).toEqual([]);
  });
  it("sem preço: age na mesma e pergunta-o junto com os pontos fortes", async () => {
    const t = (await conversation().say("Angariação ZMPT593612, moradia T3 em Serzedo, 6 semanas sem visitas."))!;
    expect(t.acted).toBe(true);
    expect(t.reply).toMatch(/Preço pedido por confirmar/);
    expect(t.reply).toMatch(/- Qual o preço pedido\?\n- Quais os 3 pontos fortes do imóvel\?/);
  });
});

describe("estados de ação", () => {
  it("'Executado' sem ferramenta é despromovido a 'Preparado'", () => {
    const txt = formatActionStates([{ state: "executed", text: "divulguei" }]);
    expect(txt).not.toContain("*Executado:*");
    expect(txt).toContain("*Preparado:* divulguei");
  });
  it("resposta da IA que afirma divulgação ou monitorização é corrigida", () => {
    const g = guardExternalClaims("Já divulguei a moradia nos grupos de colegas. Vou acompanhar o anúncio esta semana. O preço é 449k.");
    expect(g.changed).toBe(true);
    expect(g.reply).not.toMatch(/divulguei a moradia|Vou acompanhar/);
    expect(g.reply).toContain("O preço é 449k.");
    expect(g.reply).toContain(NOT_DONE_EXTERNAL_NOTE);
    expect(g.reply).toContain(NO_MONITORING_NOTE);
    expect(guardSearchAndLinks("Partilhei com os colegas.", []).reply).toContain(NOT_DONE_EXTERNAL_NOTE);
    expect(guardExternalClaims("Não divulguei nada.").changed).toBe(false);
  });
});

describe("interruptor", () => {
  it("desligado: segue para o Afonso normal", async () => {
    __resetAccountFlagsForTests();
    const t = await runListingDiagnosis({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }, userId: "u", channel: "whatsapp", trimmed: B, now: NOW,
      deps: { loadRecent: async () => [], findOwnListing: async () => ({ found: false, price: null, url: null }), searchComparables: async () => ({ status: "not_run", results: [] }) } });
    expect(t).toBeNull();
  });
});
