import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetAccountFlagsForTests, __setAccountFlagForTests } from "@/lib/flags/account-flag.server";
import { ACTION_FIRST_FLAG, runBuyerQualification, type QualificationDeps } from "./qualification.server";
import { extractBuyerBrief, briefFromMessages, isBuyerQualification } from "./buyer-brief";
import { QUALIFICATION_MARKER, MAX_QUESTIONS } from "./compose";
import { formatProposal, fromPortalListing, parseListingPrice, type ListingProposal } from "./proposal-format";
import { enforceUrlProvenance, guardSearchAndLinks, REDE_NO_ACCESS_REPLY } from "./url-provenance";

const USER = "00000000-0000-0000-0000-00000000c0de";
const NOW = new Date("2026-11-14T14:00:00Z");
const MIGUEL =
  "Tenho um comprador, o Miguel: procura T1 em Gaia, perto do metro, pré-aprovação até 150k, 15k de capitais próprios, prazo 30/11.";
const PORTAL_URL = "https://www.idealista.pt/imovel/33445566/";

type Row = { role: string; content: string; created_at: string };

/** Conversa simulada: cada turno guarda a mensagem do consultor e a resposta. */
function conversation(opts: { portal?: QualificationDeps["searchPortals"]; props?: any[] } = {}) {
  const rows: Row[] = [];
  const portalCalls: unknown[] = [];
  const deps: QualificationDeps = {
    loadRecent: async () => rows.map((r) => ({ ...r })),
    loadProperties: async () => opts.props ?? [
      { id: "p1", title: "T1 Mafamude junto ao metro", typology: "T1", location: "Mafamude, Gaia", city: "Vila Nova de Gaia", asking_price: 148000, status: "disponivel" },
      { id: "p2", title: "T3 Porto", typology: "T3", location: "Paranhos", city: "Porto", asking_price: 300000, status: "disponivel" },
    ],
    searchPortals: opts.portal ?? (async (b) => {
      portalCalls.push(b);
      return { status: "ok", results: [{ url: PORTAL_URL, title: "Apartamento T1 em Gaia, 139.000 €", description: "Perto do metro", host: "idealista.pt" }] };
    }),
  };
  async function say(text: string) {
    rows.push({ role: "user", content: text, created_at: NOW.toISOString() });
    const turn = await runBuyerQualification({ supabase: {}, userId: USER, channel: "whatsapp", trimmed: text, now: NOW, deps });
    if (turn) rows.push({ role: "assistant", content: turn.reply, created_at: NOW.toISOString() });
    return turn;
  }
  return { say, portalCalls };
}

const questionsIn = (reply: string) => reply.split("\n").filter((l) => /\?\s*$/.test(l)).length;
const CONTACT_RE = /\b(vou (?:contactar|ligar|enviar|mandar)|envio (?:uma )?mensagem|contacto o|ligo ao|aviso o (?:comprador|cliente)|mandei)\b/i;

beforeEach(() => { __resetAccountFlagsForTests(); __setAccountFlagForTests(ACTION_FIRST_FLAG, "*", true); });
afterEach(() => { __resetAccountFlagsForTests(); vi.restoreAllMocks(); });

describe("critérios do comprador", () => {
  it("caso Miguel: confirmado vs assumido, urgência", () => {
    const b = extractBuyerBrief(MIGUEL, NOW);
    expect(b.buyerName?.value).toBe("Miguel");
    expect(b.typology).toMatchObject({ value: "T1", status: "confirmed" });
    expect(b.zone).toMatchObject({ value: "Gaia", status: "confirmed" });
    expect(b.nearMetro?.value).toBe(true);
    expect(b.financingApproved?.value).toBe(150000);
    expect(b.ownFunds?.value).toBe(15000);
    expect(b.deadline?.value).toBe("2026-11-30");
    // Crédito a 90% (máx. 150k) + 15k para entrada, IMT, Selo e escritura → ~114 000 €,
    // sempre marcado como assumido (o antigo (150k+15k)/1,08 ignorava o limite de 90%).
    expect(b.budgetMax).toMatchObject({ value: 114000, status: "assumed" });
  });
  it("um orçamento dito pelo consultor ganha ao assumido", () => {
    const { brief } = briefFromMessages([MIGUEL, "o orçamento máximo é 160 mil"], NOW);
    expect(brief.budgetMax).toMatchObject({ value: 160000, status: "confirmed" });
  });
  it("mensagens que não são de comprador ficam de fora", () => {
    expect(isBuyerQualification("Tenho visita às 15h com o Paulo")).toBe(false);
    expect(isBuyerQualification("Placa em Gaia 932145678 apartamento")).toBe(false);
  });
});

describe("primeira ação útil", () => {
  it("caso Miguel: age no 1.º turno, numa só mensagem", async () => {
    const c = conversation();
    const t = (await c.say(MIGUEL))!;
    expect(t.acted).toBe(true);
    expect(t.reply.startsWith(`${QUALIFICATION_MARKER}Miguel*`)).toBe(true);
    expect(t.reply).toMatch(/Confirmado: T1, Gaia, perto do metro/);
    expect(t.reply).toMatch(/Assumido: teto de \*114[\s.\u00a0\u202f]000 €\*/);
    expect(t.reply).toMatch(/Prioridade alta: prazo 30\/11, faltam 16 dias/);
    expect(t.reply).toContain("https://app.meuafonso.com/imoveis/p1");
    expect(t.reply).not.toContain("/imoveis/p2");
    expect(t.reply).toContain(PORTAL_URL);
    expect(t.reply).toContain(REDE_NO_ACCESS_REPLY);
    expect(questionsIn(t.reply)).toBeLessThanOrEqual(MAX_QUESTIONS);
    expect(c.portalCalls).toHaveLength(1);
  });
  it("só falta a zona: pergunta tudo de uma vez e age na 2.ª interação", async () => {
    const c = conversation();
    const t1 = (await c.say("O comprador Miguel procura T1, tem pré-aprovação de 150k"))!;
    expect(t1.acted).toBe(false);
    expect(t1.reply).toContain("Que zona?");
    expect(c.portalCalls).toHaveLength(0);
    const t2 = (await c.say("Gaia, perto do metro"))!;
    expect(t2.acted).toBe(true);
    expect(t2.reply).toContain(PORTAL_URL);
  });
  it("em geral: ≤ 3 interações até à 1.ª ação, mesmo a dar um critério de cada vez", async () => {
    const c = conversation();
    const turns = [
      await c.say("Tenho um comprador que procura um T1"),
      await c.say("em Gaia"),
      await c.say("tem pré-aprovação de 150k"),
    ];
    const first = turns.findIndex((t) => t?.acted);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first + 1).toBeLessThanOrEqual(3);
    for (const t of turns) expect(questionsIn(t!.reply)).toBeLessThanOrEqual(MAX_QUESTIONS);
  });
});

describe("sem repetir perguntas", () => {
  it("o que já foi perguntado não volta, e o que foi dito não é perguntado", async () => {
    const c = conversation();
    const t1 = (await c.say("Comprador Miguel procura T1 em Gaia, orçamento 150 mil"))!;
    expect(t1.reply).toContain("Há prazo para comprar?");
    const t2 = (await c.say("o prazo é 30/11"))!;
    expect(t2.reply).not.toContain("Há prazo para comprar?");
    expect(t2.reply).not.toContain("Algo obrigatório");
    expect(t2.reply).not.toContain("Que zona?");
  });
  it("uma correção atualiza e diz o que mudou", async () => {
    const c = conversation();
    await c.say(MIGUEL);
    const t2 = (await c.say("afinal é Matosinhos"))!;
    expect(t2.reply).toContain("Atualizei: zona Gaia → Matosinhos");
  });
});

describe("propostas de imóveis", () => {
  const brief = extractBuyerBrief(MIGUEL, NOW);
  it("cada proposta tem link, origem, preço, tipologia, local, metro, estado e porquê", () => {
    const p = fromPortalListing({ url: PORTAL_URL, title: "T1 em Gaia ZMPT-12345, 109.000 €", host: "idealista.pt" }, brief);
    const txt = formatProposal(p, 1)!;
    expect(txt).toContain(PORTAL_URL);
    expect(txt).toContain("Origem: idealista.pt");
    expect(txt).toContain("Ref. ZMPT-12345");
    expect(txt).toMatch(/109\.000 €|109[\s\u00a0\u202f]000 €/);
    expect(txt).toContain("Tipologia: T1");
    expect(txt).toContain("Local: Gaia");
    expect(txt).toContain("Metro: por confirmar");
    expect(txt).toContain("Estado: por confirmar");
    expect(txt).toMatch(/Porquê: T1 como pedido, em Gaia, dentro do teto assumido/);
  });
  it("acima do teto assumido não é escondido: aparece com aviso", () => {
    const p = fromPortalListing({ url: PORTAL_URL, title: "T1 Gaia 175.000 €", host: "idealista.pt" }, brief);
    expect(formatProposal(p, 1)).toContain("acima do teto assumido");
  });
  it("sem link real não há proposta; nunca há imagens", () => {
    const p: ListingProposal = { ...fromPortalListing({ url: PORTAL_URL, title: "T1", host: "x" }, brief), url: "" };
    expect(formatProposal(p, 1)).toBeNull();
    const ok = formatProposal(fromPortalListing({ url: PORTAL_URL, title: "T1", host: "x" }, brief), 1)!;
    expect(ok).not.toMatch(/!\[|\.(jpg|jpeg|png|webp)\b/i);
  });
  it("preço por confirmar quando o anúncio não o diz", () => {
    expect(parseListingPrice("Apartamento T1 em Gaia")).toBeNull();
    const p = fromPortalListing({ url: PORTAL_URL, title: "Apartamento T1 em Gaia", host: "idealista.pt" }, brief);
    expect(formatProposal(p, 1)).toContain("preço por confirmar");
  });
  it("pesquisa nos portais falhada ou esgotada: diz-o e não mostra anúncios", async () => {
    const failed = await conversation({ portal: async () => ({ status: "failed", results: [] }) }).say(MIGUEL);
    expect(failed!.reply).toContain("A pesquisa nos portais falhou agora");
    expect(failed!.reply).not.toContain("idealista");
    const limited = await conversation({ portal: async () => ({ status: "rate_limited", results: [] }) }).say(MIGUEL);
    expect(limited!.reply).toContain("Já fiz as pesquisas de mercado de hoje");
  });
});

describe("fontes reais e links verificáveis", () => {
  it("link inventado é retirado; link da pesquisa e do painel ficam", () => {
    const r = enforceUrlProvenance(
      `Vê este ${PORTAL_URL} e este https://www.idealista.pt/imovel/99999999/ e a ficha https://app.meuafonso.com/imoveis/p1`,
      new Set([PORTAL_URL.replace(/\/$/, "")]),
    );
    expect(r.reply).toContain(PORTAL_URL);
    expect(r.reply).toContain("https://app.meuafonso.com/imoveis/p1");
    expect(r.reply).not.toContain("99999999");
    expect(r.removed).toHaveLength(1);
  });
  it("afirmar pesquisa na carteira da Rede é sempre substituído (não há ligação)", () => {
    const g = guardSearchAndLinks("Pesquisei na carteira da Rede e encontrei 3 T1 para o Miguel.", []);
    expect(g.reply).toBe(REDE_NO_ACCESS_REPLY);
  });
  it("afirmar pesquisa nos portais só passa se a pesquisa correu", () => {
    expect(guardSearchAndLinks("Pesquisei nos portais e há 2 opções.", []).replaced).toBe(true);
    const ran = guardSearchAndLinks("Pesquisei nos portais e há 2 opções.", [{ name: "search_similar_listings", ok: true, data: {} }]);
    expect(ran.replaced).toBe(false);
  });
  it("referências ZMPT e links do consultor ficam por analisar, sem fingir que foram vistos", async () => {
    const t = (await conversation().say(`${MIGUEL} Vê a ZMPT-45678`))!;
    expect(t.reply).toContain("ZMPT-45678");
    expect(t.reply).toMatch(/ainda por analisar/);
  });
});

describe("segurança", () => {
  it("nunca anuncia contacto a terceiros", async () => {
    const c = conversation();
    for (const m of [MIGUEL, "afinal é Matosinhos", "o orçamento máximo é 160 mil"]) {
      const t = await c.say(m);
      expect(t!.reply).not.toMatch(CONTACT_RE);
    }
  });
  it("interruptor desligado: o turno segue para o Afonso normal", async () => {
    __setAccountFlagForTests(ACTION_FIRST_FLAG, "*", false);
    expect(await conversation().say(MIGUEL)).toBeNull();
  });
  it("mensagem que não é de comprador: o turno segue para o Afonso normal", async () => {
    expect(await conversation().say("Amanhã tenho visita às 10h com o Paulo")).toBeNull();
  });
});
