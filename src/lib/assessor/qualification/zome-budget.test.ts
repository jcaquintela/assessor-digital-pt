// Site público zome.pt como fonte de anúncios + orçamento provisório do
// comprador (sem dedução fixa de custos; isenção IMT/IS Jovem declarada, não verificada).
import { describe, expect, it } from "vitest";
import {
  filterZomeResults, parseZomeListingUrl, parseZomePage, zomeSearchQuery, ZOME_SOURCE_LABEL, type ZomeListing,
} from "@/lib/imoveis/zome-public";
import { lookupZomeRef, searchZomePublic, type ZomeNet } from "@/lib/imoveis/zome-public.server";
import { briefFromMessages, extractBuyerBrief } from "./buyer-brief";
import { budgetBlock } from "./compose";
import { dedupeListings, sameProperty } from "./dedupe";
import { formatProposal, fromPortalListing, rankProposals, type ListingProposal } from "./proposal-format";
import { runBuyerQualification, zomeToPortalListing, type QualificationDeps } from "./qualification.server";
import { guardSearchAndLinks, REDE_NO_ACCESS_REPLY } from "./url-provenance";
import { runListingDiagnosis, type ListingDeps } from "../listing/listing.server";

const NOW = new Date("2026-11-14T14:00:00Z");
const sp = (t: string | null | undefined) => String(t ?? "").replace(/[\u00a0\u202f]/g, " ");
const ZURL = "https://www.zome.pt/pt/apartamento-t2-porto-valongo-ermesinde-ZMPT594983";
const ZT1 = "https://www.zome.pt/pt/apartamento-t1-porto-vila_nova_de_gaia-mafamude_e_vilar_do_paraiso-ZMPT590001";
const IDEALISTA = "https://www.idealista.pt/imovel/33445566/";
const PAGE_MD = [
  "![Imagem](https://images.zome.pt/listings/x.jpg)", "Novidade", "ID **ZMPT594983**", "", "269.500 €", "", "884 €/mês", "",
  "- Áreas:", "- 82m² área útil", "- 103m² área bruta",
].join("\n");
const PAGE_TITLE = "Zome Portugal - Apartamento T2 com varanda e lugar de garagem - Centro de Ermesinde - ZMPT594983";

const MIGUEL_30 =
  "Tenho um comprador, o Miguel, 30 anos, primeira habitação própria permanente: procura T1 em Gaia, perto do metro, pré-aprovação até 150k, 15k de capitais próprios, prazo 30/11.";
const MIGUEL = "Tenho um comprador, o Miguel: procura T1 em Gaia, perto do metro, pré-aprovação até 150k, 15k de capitais próprios, prazo 30/11.";

/** Supabase mínimo para as funções de servidor: sem cache, contagem configurável, regista inserts. */
function fakeSupabase(opts: { count?: number; cached?: ZomeListing[] } = {}) {
  const inserts: any[] = [];
  const chain = (result: any): any => new Proxy(() => {}, {
    get: (_t, k) => (k === "then" ? (res: any) => res(result) : () => chain(result)),
    apply: () => chain(result),
  });
  return {
    inserts,
    from: () => ({
      select: (_cols: string, o?: { head?: boolean }) => chain(o?.head ? { count: opts.count ?? 0 } : { data: opts.cached ? [{ results: opts.cached }] : [] }),
      insert: async (row: any) => { inserts.push(row); return { error: null }; },
    }),
  };
}

describe("site público zome.pt — links e factos", () => {
  it("lê referência, tipologia e localização do próprio URL do anúncio", () => {
    expect(parseZomeListingUrl(ZURL)).toMatchObject({ ref: "ZMPT594983", typology: "T2", kind: "apartamento", location: "Ermesinde, Valongo", url: ZURL });
    expect(parseZomeListingUrl(ZT1)?.location).toBe("Mafamude e Vilar do Paraiso, Vila Nova de Gaia");
  });
  it("só anúncios individuais: empreendimentos, outras páginas e outros sites ficam de fora", () => {
    expect(parseZomeListingUrl("https://www.zome.pt/pt/EMPT195128")).toBeNull();
    expect(parseZomeListingUrl("https://www.zome.pt/pt/quanto-vale-a-minha-casa/")).toBeNull();
    expect(parseZomeListingUrl("https://zome.pt.evil.com/pt/apartamento-t1-porto-x-y-ZMPT590001")).toBeNull();
    const r = filterZomeResults([
      { url: ZURL, title: "T2 Ermesinde" }, { url: `${ZURL}/`, title: "repetido" },
      { url: "https://www.zome.pt/pt/EMPT195128", title: "Empreendimento" }, { url: IDEALISTA, title: "outro site" },
    ]);
    expect(r.map((x) => x.url)).toEqual([ZURL]);
    expect(r[0]!.verification).toBe("search_result");
  });
  it("página do anúncio: preço e área lidos na página (a renda estimada não é o preço)", () => {
    const l = parseZomePage(ZURL, PAGE_MD, PAGE_TITLE)!;
    expect(l).toMatchObject({ ref: "ZMPT594983", price: 269500, areaM2: 82, verification: "page" });
    expect(l.title).toBe("Apartamento T2 com varanda e lugar de garagem - Centro de Ermesinde");
  });
  it("página com outro ID não é aceite como o anúncio pedido", () => {
    expect(parseZomePage(ZURL, PAGE_MD.replace("ZMPT594983", "ZMPT000001"), PAGE_TITLE)).toBeNull();
  });
  it("pesquisa dirigida ao site público, nunca sem zona", () => {
    expect(zomeSearchQuery({ typology: "T1", location: "Gaia" })).toBe("site:zome.pt T1 Gaia venda");
    expect(zomeSearchQuery({ typology: "T1", location: null })).toBeNull();
  });
  it("proposta zome.pt: link direto, fonte, referência e estado de verificação", () => {
    const brief = extractBuyerBrief(MIGUEL_30, NOW);
    const [l] = filterZomeResults([{ url: ZT1, title: "Apartamento T1 em Mafamude", description: "120.000 €" }]);
    const txt = sp(formatProposal(fromPortalListing(zomeToPortalListing(l!), brief, "14/11"), 1));
    expect(txt).toContain(ZT1);
    expect(txt).toContain(`Origem: ${ZOME_SOURCE_LABEL} · Ref. ZMPT590001`);
    expect(txt).toContain("120 000 € (visto na pesquisa a 14/11; confirma no anúncio)");
    expect(txt).toContain("Local: Mafamude e Vilar do Paraiso, Vila Nova de Gaia");
    const page = parseZomePage(ZURL, PAGE_MD, PAGE_TITLE)!;
    expect(sp(formatProposal(fromPortalListing(zomeToPortalListing(page), brief, "14/11"), 1))).toContain("269 500 € (verificado no anúncio a 14/11)");
  });
});

const prop = (over: Partial<ListingProposal>): ListingProposal => ({
  url: IDEALISTA, source: "portal", sourceLabel: "idealista.pt", title: "T1", zmptRef: null, price: 139000, typology: "T1",
  location: "Gaia", metroDistance: null, availability: null, matchReasons: ["T1 como pedido"], caveats: [], ...over,
});

describe("deduplicação entre portais", () => {
  it("mesma referência ZMPT em dois sites = um imóvel, com o outro link em 'Também em'", () => {
    const out = dedupeListings([
      prop({ zmptRef: "ZMPT-590001" }),
      prop({ url: ZT1, sourceLabel: ZOME_SOURCE_LABEL, zmptRef: "ZMPT590001", location: "Mafamude, Vila Nova de Gaia" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.alsoAt).toHaveLength(1);
    expect(sp(formatProposal(out[0]!, 1))).toMatch(/Também em: .*https:\/\//);
  });
  it("sem referência: junta só com tipologia, preço ±1%, local e área ±3% a bater", () => {
    const a = prop({ areaM2: 55 });
    const b = prop({ url: "https://www.imovirtual.com/pt/anuncio/x-ID1A2B3", sourceLabel: "imovirtual.com", price: 139500, areaM2: 56 });
    expect(sameProperty(a, b)).toBe(true);
    expect(dedupeListings([a, b])).toHaveLength(1);
  });
  it("'T1 em Gaia a 139k' sem área não chega para juntar", () => {
    const b = prop({ url: ZT1, sourceLabel: ZOME_SOURCE_LABEL, zmptRef: "ZMPT590001", location: "Mafamude, Vila Nova de Gaia" });
    expect(sameProperty(prop({}), b)).toBe(false);
    expect(dedupeListings([prop({}), b])).toHaveLength(2);
  });
  it("referências diferentes nunca se juntam, mesmo com o mesmo preço e área", () => {
    expect(sameProperty(prop({ zmptRef: "ZMPT1111", areaM2: 55 }), prop({ url: ZT1, zmptRef: "ZMPT2222", areaM2: 55 }))).toBe(false);
  });
  it("preço muito diferente ou área diferente: imóveis diferentes", () => {
    expect(sameProperty(prop({ areaM2: 55 }), prop({ url: ZT1, price: 150000, areaM2: 55 }))).toBe(false);
    expect(sameProperty(prop({ areaM2: 55 }), prop({ url: ZT1, areaM2: 70 }))).toBe(false);
  });
});

describe("ranking neutro", () => {
  const zome = prop({ url: ZT1, sourceLabel: ZOME_SOURCE_LABEL, price: 135000 });
  const ideal = prop({ price: 130000 });
  it("a ordem não depende da ordem de entrada nem da fonte", () => {
    expect(rankProposals([zome, ideal]).map((p) => p.url)).toEqual(rankProposals([ideal, zome]).map((p) => p.url));
  });
  it("com o mesmo encaixe ganha o preço mais baixo, seja de onde for", () => {
    expect(rankProposals([zome, ideal])[0]!.sourceLabel).toBe("idealista.pt");
    expect(rankProposals([ideal, { ...zome, price: 125000 }])[0]!.sourceLabel).toBe(ZOME_SOURCE_LABEL);
  });
  it("encaixe vem primeiro: um zome.pt com aviso fica atrás de um portal sem aviso", () => {
    expect(rankProposals([{ ...zome, price: 100000, caveats: ["acima do orçamento"] }, ideal])[0]!.url).toBe(IDEALISTA);
  });
});

function buyerDeps(over: Partial<QualificationDeps> = {}): QualificationDeps {
  return {
    loadRecent: async () => [],
    loadProperties: async () => [],
    searchPortals: async () => ({ status: "ok", results: [{ url: IDEALISTA, title: "Apartamento T1 em Gaia, 119.000 €", description: "55 m2", host: "idealista.pt" }] }),
    searchZome: async () => ({ status: "ok", results: filterZomeResults([{ url: ZT1, title: "Apartamento T1 em Mafamude", description: "122.000 €" }]) }),
    ...over,
  };
}
const buyer = async (text: string, deps = buyerDeps()) =>
  sp((await runBuyerQualification({ supabase: {}, userId: "u", channel: "whatsapp", trimmed: text, now: NOW, deps, skipFlagCheck: true }))!.reply);

describe("comprador com o site público zome.pt", () => {
  it("mostra portais e zome.pt juntos, e diz que pesquisou nos dois", async () => {
    const r = await buyer(MIGUEL_30);
    expect(r).toContain(IDEALISTA);
    expect(r).toContain(ZT1);
    expect(r).toMatch(/Anúncios publicados \(portais e site público zome\.pt; ordenados só por encaixe/);
    expect(r).toMatch(/\*Executado:\* .*pesquisa nos portais \(1 anúncio\); pesquisa no site público zome\.pt \(1 anúncio\)/);
    expect(r).toContain(REDE_NO_ACCESS_REPLY);
    expect(r).toMatch(/\*Sem acesso:\* carteira interna da Rede\/Zome \(só vejo o site público\)/);
  });
  it("zome.pt indisponível: diz a limitação, não mostra nada dali e não o dá como executado", async () => {
    const r = await buyer(MIGUEL_30, buyerDeps({ searchZome: async () => { throw new Error("firecrawl 503"); } }));
    expect(r).toContain("A consulta ao site público da Zome falhou agora");
    expect(r).not.toContain("zome.pt/pt/");
    expect(r).not.toMatch(/pesquisa no site público zome\.pt \(/);
    expect(r).toContain(IDEALISTA);
  });
  it("tudo indisponível: nenhum anúncio inventado", async () => {
    const r = await buyer(MIGUEL_30, buyerDeps({ searchPortals: async () => ({ status: "failed", results: [] }), searchZome: async () => ({ status: "failed", results: [] }) }));
    expect(r).not.toMatch(/https?:\/\/(?!app\.meuafonso)/);
    expect(r).not.toMatch(/\*Executado:\*.*pesquisa/);
  });
  it("servidor: falha da fonte → 'failed'; limite diário → 'rate_limited' sem chamar a rede", async () => {
    let calls = 0;
    const net: ZomeNet = { search: async () => { calls++; throw new Error("403"); }, scrape: async () => ({ markdown: "", title: null }) };
    expect((await searchZomePublic({ supabase: fakeSupabase(), userId: "u" }, { typology: "T1", location: "Gaia" }, net)).status).toBe("failed");
    expect((await searchZomePublic({ supabase: fakeSupabase({ count: 10 }), userId: "u" }, { typology: "T1", location: "Gaia" }, net)).status).toBe("rate_limited");
    expect(calls).toBe(1);
  });
  it("servidor: guarda só anúncios zome.pt da zona pedida e regista a pesquisa no limite diário", async () => {
    const sb = fakeSupabase();
    const net: ZomeNet = {
      search: async () => [{ url: ZT1, title: "T1 Mafamude" }, { url: ZURL, title: "T2 Ermesinde" }, { url: IDEALISTA, title: "x" }],
      scrape: async () => ({ markdown: "", title: null }),
    };
    const r = await searchZomePublic({ supabase: sb, userId: "u" }, { typology: "T1", location: "Gaia" }, net);
    expect(r.results.map((x) => x.url)).toEqual([ZT1]);
    expect(sb.inserts[0]).toMatchObject({ cache_key: "zome|gaia|t1", cache_hit: false });
  });
  it("servidor: consulta de referência lê a página; se a página falhar fica só o link, preço por confirmar", async () => {
    const ok: ZomeNet = { search: async () => [{ url: ZURL, title: PAGE_TITLE }], scrape: async () => ({ markdown: PAGE_MD, title: PAGE_TITLE }) };
    expect((await lookupZomeRef({ supabase: fakeSupabase(), userId: "u" }, "ZMPT594983", ok)).listing).toMatchObject({ price: 269500, verification: "page" });
    const broken: ZomeNet = { search: ok.search, scrape: async () => { throw new Error("timeout"); } };
    expect((await lookupZomeRef({ supabase: fakeSupabase(), userId: "u" }, "ZMPT594983", broken)).listing).toMatchObject({ url: ZURL, price: null, verification: "search_result" });
    const none: ZomeNet = { search: async () => [], scrape: ok.scrape };
    expect(await lookupZomeRef({ supabase: fakeSupabase(), userId: "u" }, "ZMPT594983", none)).toEqual({ status: "ok", listing: null });
  });
  it("afirmar pesquisa no site da Zome só passa se a pesquisa correu; carteira interna nunca", () => {
    expect(guardSearchAndLinks("Pesquisei no site da Zome e há 2 T1.", []).replaced).toBe(true);
    expect(guardSearchAndLinks("Pesquisei no site da Zome e há 2 T1.", [{ name: "search_zome_public", ok: true, data: {} }]).replaced).toBe(false);
    expect(guardSearchAndLinks("Pesquisei na carteira interna da Zome.", [{ name: "search_zome_public", ok: true, data: {} }]).reply).toBe(REDE_NO_ACCESS_REPLY);
  });
});

describe("orçamento provisório e fiscalidade jovem", () => {
  it("Miguel, 30 anos, 1.ª HPP: isenção declarada mas não verificada; teto a 90% ~125k, sem ela ~114k, garantia pública até ~162k", () => {
    const b = extractBuyerBrief(MIGUEL_30, NOW);
    expect(b.age?.value).toBe(30);
    expect(b.firstHome?.value).toBe(true);
    expect(b.use?.value).toBe("hpp");
    expect(b.budget).toMatchObject({ fiscal: "young_declared", base: 125000, withoutYoung: 114000, guarantee: 162000, loanCap: 150000, ownFunds: 15000 });
    expect(b.budgetMax).toMatchObject({ value: 125000, status: "assumed" });
    // Custos parametrizados, não uma percentagem fixa: IMT e Selo da compra a 0 com a isenção.
    const costs = Object.fromEntries(b.budget!.baseSim!.costs.map((c) => [c.label, c.value]));
    expect(costs).toMatchObject({ IMT: 0, "Selo da compra": 0, "Selo do crédito": 675 });
  });
  it("a resposta separa crédito, capitais, entrada, custos e elegibilidade; nenhum teto de 152k nem 8% fixo", async () => {
    const r = await buyer(MIGUEL_30);
    expect(r).toMatch(/- Crédito: pré-aprovação de 150 000 € — não é aprovação final; o banco empresta sobre o menor entre preço e avaliação/);
    expect(r).toContain("- Capitais: 15 000 €.");
    expect(r).toMatch(/- Com crédito a 90%: teto ~125 000 € → entrada 12 500 € \+ custos ~2475 € \(IMT 0 €, Selo da compra 0 €, Selo do crédito 675 €, escritura e registo ~1000 €, custos do banco ~800 €\)/);
    expect(r).toMatch(/Isenção IMT\/IS Jovem: elegibilidade declarada, \*não verificada\* \(até 35 anos \(declarado: 30\); 1\.ª compra de habitação \(declarado\); habitação própria e permanente \(declarado\); não ser dependente no IRS \(por confirmar\)\)\. Sem ela, o teto a 90% desce para ~114 000 €/);
    expect(r).toMatch(/Com garantia pública jovem \(até 100% de crédito, decide o banco\): até ~162 000 €/);
    expect(r).not.toMatch(/152[\s.]?000|152k|8\s?%/);
    expect(r).toMatch(/\[média\] isenção IMT\/IS Jovem declarada, não verificada/);
    expect(r).toMatch(/\*Próximo passo:\* pedes ao banco a simulação do Miguel com um imóvel concreto, a 90% e com garantia pública, e confirmas a elegibilidade para a isenção IMT\/IS Jovem/);
  });
  it("idade não dita: contas normais e a isenção como hipótese, sem a assumir", () => {
    const b = extractBuyerBrief(MIGUEL, NOW);
    expect(b.budget).toMatchObject({ fiscal: "unknown", base: 114000, withYoung: 125000, guarantee: 162000 });
  });
  it("mais de 35 anos ou investimento: sem isenção nem garantia jovem", () => {
    expect(extractBuyerBrief(MIGUEL.replace("o Miguel:", "o Miguel, 41 anos:"), NOW).budget).toMatchObject({ fiscal: "not_eligible", base: 114000, guarantee: null });
    const inv = extractBuyerBrief(`${MIGUEL} É para investimento.`, NOW);
    expect(inv.use?.value).toBe("secondary");
    expect(inv.budget?.fiscal).toBe("not_eligible");
    expect(inv.budget!.base).toBeLessThan(114000); // secundária paga IMT desde o 1.º euro
  });
  it("prazos de crédito não são confundidos com a idade", () => {
    expect(extractBuyerBrief(`${MIGUEL} Crédito a 40 anos.`, NOW).age).toBeNull();
  });
  it("orçamento dito pelo consultor ganha: sem bloco provisório", () => {
    const { brief } = briefFromMessages([MIGUEL_30, "o orçamento máximo é 140 mil"], NOW);
    expect(brief.budgetMax).toMatchObject({ value: 140000, status: "confirmed" });
    expect(budgetBlock(brief)).toBeNull();
  });
});

function listingDeps(over: Partial<ListingDeps> = {}): ListingDeps {
  return {
    loadRecent: async () => [],
    findOwnListing: async () => ({ found: false, price: null, url: null }),
    searchComparables: async () => ({ status: "ok", results: [] }),
    ...over,
  };
}
const B = "Tenho a angariação exclusiva ZMPT593612, moradia T3 em Serzedo e Perosinho a 449k. Está há 6 semanas no mercado, zero visitas, só 2 contactos de colegas. Concorrente: ZMPT593954. Estratégia orgânica, com margem para pago.";
const OWN_URL = "https://www.zome.pt/pt/moradia-t3-porto-vila_nova_de_gaia-serzedo_e_perosinho-ZMPT593612";
const COMP_URL = "https://www.zome.pt/pt/moradia-t3-porto-vila_nova_de_gaia-serzedo_e_perosinho-ZMPT593954";
const page = (url: string, ref: string, price: number, area: number): ZomeListing =>
  ({ ...parseZomeListingUrl(url)!, host: "zome.pt", title: `Moradia T3 ${ref}`, description: null, price, areaM2: area, verification: "page" });
const listing = async (deps: ListingDeps) =>
  sp((await runListingDiagnosis({ supabase: {}, userId: "u", channel: "whatsapp", trimmed: B, now: NOW, deps, skipFlagCheck: true }))!.reply);

describe("angariação com o site público zome.pt", () => {
  it("concorrente lido na página: compara com link e data, sem concluir competitividade", async () => {
    const r = await listing(listingDeps({
      lookupZomeRef: async (ref) => ref === "ZMPT593954" ? { status: "ok", listing: page(COMP_URL, ref, 430000, 180) } : { status: "ok", listing: null },
    }));
    expect(r).toContain(`*Concorrente ZMPT593954:* 430 000 € · 180 m² úteis no site público zome.pt (lido a 14/11): ${COMP_URL} — o teu está 19 000 € acima.`);
    expect(r).toContain("Isto sozinho não prova que o teu está caro ou competitivo");
    expect(r).toMatch(/consulta de ZMPT593954 no site público zome\.pt \(anúncio lido\)/);
    expect(r).not.toMatch(/\*Sem acesso:\*[^\n]*anúncio do concorrente/);
    expect(r).toMatch(/- ZMPT593612 \(o teu imóvel\): não o encontrei publicado no site público da Zome/);
  });
  it("preço do próprio anúncio diferente no site público: divergência a verificar, não facto", async () => {
    const r = await listing(listingDeps({
      lookupZomeRef: async (ref) => ref === "ZMPT593612" ? { status: "ok", listing: page(OWN_URL, ref, 455000, 200) } : { status: "ok", listing: null },
    }));
    expect(r).toContain(`*Preço divergente:* disseste 449 000 €, mas em zome.pt (site público) aparece 455 000 € (visto a 14/11: ${OWN_URL})`);
    expect(r).toContain('Até lá trabalho com 449 000 € como "informado por ti"');
  });
  it("site público indisponível: diz a limitação e não compara", async () => {
    const r = await listing(listingDeps({ lookupZomeRef: async () => { throw new Error("503"); } }));
    expect(r).toMatch(/ZMPT593954 \(o concorrente\): a consulta ao site público da Zome falhou agora/);
    expect(r).toMatch(/\*Concorrente ZMPT593954:\* sem o anúncio não tenho preço/);
    expect(r).not.toContain("zome.pt/pt/");
  });
});

describe("zome.pt — casos reais vistos a 14/11/2026", () => {
  const SOLD_MD = [
    "## **Apartamento T1**  para venda", "", "Mafamude e Vilar do Paraíso", "›", "Vila Nova de Gaia", "›", "Porto", "", "",
    "ID **ZMPT589413**", "", "[Empreendimento \" **Eleven**\"](https://www.zome.pt/pt/EMPT195136)", "", "Vendido", "", "- 45m² área útil",
  ].join("\n");
  it("links curtos e noutras línguas viram o link /pt/ verificável, com a localização do endereço", () => {
    expect(parseZomeListingUrl("https://www.zome.pt/ZMPT593954")).toMatchObject({ ref: "ZMPT593954", url: "https://www.zome.pt/pt/ZMPT593954", location: null });
    expect(parseZomeListingUrl("https://www.zome.pt/en/house-t3_1-porto-vila_nova_de_gaia-serzedo_e_perosinho-ZMPT593954")).toMatchObject({
      ref: "ZMPT593954", url: "https://www.zome.pt/pt/ZMPT593954", typology: "T3", location: "Serzedo e Perosinho, Vila Nova de Gaia",
    });
    expect(parseZomeListingUrl("https://www.zome.pt/pt/claudiosilva-U95517")).toBeNull();
  });
  it("anúncio vendido: estado lido na página, sem preço, e nunca proposto", async () => {
    const url = "https://www.zome.pt/pt/apartamento-t1-porto-vila_nova_de_gaia-mafamude_e_vilar_do_paraiso-ZMPT589413";
    const l = parseZomePage(url, SOLD_MD, "Zome Portugal - Apartamento T1, pronto a habitar em Mafamude, Vila Nova de Gaia. - ZMPT589413")!;
    expect(l).toMatchObject({ status: "vendido", price: null, areaM2: 45 });
    const net: ZomeNet = { search: async () => [{ url, title: "T1 Mafamude" }, { url: ZT1, title: "T1 Mafamude 2" }], scrape: async (u) => (u === url ? { markdown: SOLD_MD, title: null } : { markdown: "", title: null }) };
    const r = await searchZomePublic({ supabase: fakeSupabase(), userId: "u" }, { typology: "T1", location: "Gaia" }, net);
    expect(r.results.map((x) => x.ref)).toEqual(["ZMPT590001"]);
  });
  it("página sem localização no URL: lê a localização e a tipologia do cabeçalho da página", () => {
    const l = parseZomePage("https://www.zome.pt/pt/ZMPT589413", SOLD_MD.replace("Vendido", "Reservado").replace("ID **ZMPT589413**", "ID **ZMPT589413**\n\n145.000 €"), null)!;
    expect(l).toMatchObject({ location: "Mafamude e Vilar do Paraíso, Vila Nova de Gaia", typology: "T1", status: "reservado", price: 145000 });
    const p = fromPortalListing(zomeToPortalListing(l), extractBuyerBrief(MIGUEL_30, NOW), "14/11");
    const txt = sp(formatProposal(p, 1));
    expect(txt).toContain("Estado: reservado no anúncio a 14/11 (negociação por confirmar)");
    expect(txt).toContain("reservado no anúncio");
  });
});
