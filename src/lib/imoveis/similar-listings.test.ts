import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildListingQuery, filterListings, formatSimilarListings,
  isIndividualListing, similarListingsCacheKey, priceBand,
} from "./similar-listings";
import { fetchListingsFromGateway, parseGatewayResults, FIRECRAWL_SEARCH_URL } from "./similar-listings.server";

const ads = [
  { url: "https://www.idealista.pt/imovel/33445566/", title: "T3 em Gaia", description: "Apartamento T3" },
  { url: "https://www.imovirtual.com/pt/anuncio/t3-gaia-ID12345678.html", title: "T3 Canidelo" },
  { url: "https://casa.sapo.pt/comprar-apartamento-t3-gaia/?id=90887766", title: "T3 Mafamude" },
  { url: "https://www.remax.pt/imovel/121091012-34", title: "T3 Oliveira do Douro" },
  { url: "https://www.era.pt/imovel/1234567", title: "T3 Vilar do Paraíso" },
  { url: "https://www.idealista.pt/comprar-casas/vila-nova-de-gaia/com-t3/", title: "Listagem" },
  { url: "https://www.olx.pt/imovel/99887766/", title: "Fora da whitelist" },
  { url: "https://www.idealista.pt/imovel/33445566/?utm=x", title: "Duplicado" },
];

describe("comparáveis de mercado", () => {
  it("1) imóvel completo → 5 anúncios com enquadramento correto", () => {
    const plan = buildListingQuery({ typology: "T3", location: "Vila Nova de Gaia", asking_price: 250000 });
    expect(plan.canSearch).toBe(true);
    expect(plan.partial).toBe(false);
    expect(plan.query).toContain("T3");
    expect(plan.query).toContain("site:idealista.pt");
    expect(priceBand(250000)).toEqual({ min: 212500, max: 287500 });

    const results = filterListings(ads, 5);
    expect(results).toHaveLength(5);
    const out = formatSimilarListings({ results, partial: false });
    expect(out).toContain("não é uma avaliação, é só referência rápida");
    expect(out).toContain("idealista.pt");
    expect(out).not.toContain("olx.pt");
  });

  it("2) só zona (ou só tipologia) → pesquisa e avisa da limitação", () => {
    const soZona = buildListingQuery({ location: "Matosinhos" });
    expect(soZona.canSearch).toBe(true);
    expect(soZona.partial).toBe(true);
    const soTipologia = buildListingQuery({ typology: "T2" });
    expect(soTipologia.canSearch).toBe(true);
    const out = formatSimilarListings({ results: filterListings(ads, 5), partial: true });
    expect(out).toContain("dados deste imóvel estão incompletos");
  });

  it("3) sem zona nem tipologia → não pesquisa, pede o que falta", () => {
    const plan = buildListingQuery({ asking_price: 300000 });
    expect(plan.canSearch).toBe(false);
    expect(plan.missing).toEqual(["zona", "tipologia"]);
    const out = formatSimilarListings({ needs_field: true, missing: plan.missing });
    expect(out).toContain("pelo menos a zona ou a tipologia");
    expect(out).not.toContain("http");
  });

  it("4) sem resultados relevantes → diz isso sem inventar", () => {
    const results = filterListings([
      { url: "https://www.idealista.pt/comprar-casas/porto/" },
      { url: "https://www.olx.pt/imovel/123456/" },
    ]);
    expect(results).toHaveLength(0);
    const out = formatSimilarListings({ results });
    expect(out).toContain("Não encontrei anúncios semelhantes publicados agora");
  });

  it("5) guardrail de linguagem: nunca 'vale' nem 'valor de mercado'", () => {
    const variants = [
      formatSimilarListings({ results: filterListings(ads, 5), partial: false }),
      formatSimilarListings({ results: [], partial: true }),
      formatSimilarListings({ needs_field: true, missing: ["zona"] }),
      formatSimilarListings({ rate_limited: true }),
    ];
    for (const out of variants) {
      expect(out.toLowerCase()).not.toMatch(/\bvale\b/);
      expect(out.toLowerCase()).not.toContain("valor de mercado");
      expect(out.toLowerCase()).not.toContain("avaliação de");
    }
  });

  it("heurísticas de anúncio individual e dedup por id", () => {
    expect(isIndividualListing("https://www.idealista.pt/imovel/33445566/")).toBe(true);
    expect(isIndividualListing("https://www.idealista.pt/comprar-casas/gaia/com-t3/")).toBe(false);
    expect(similarListingsCacheKey(buildListingQuery({ typology: "T3", location: "Gaia", asking_price: 200000 })))
      .toBe("gaia|t3|170000-230000");
  });
});

describe("chamada real ao connector-gateway", () => {
  const OLD = { ...process.env };
  beforeEach(() => {
    process.env["LOVABLE_API_KEY"] = "lov-test";
    process.env["FIRECRAWL_API_KEY"] = "lovc_test";
  });
  afterEach(() => { process.env = { ...OLD }; });

  // Corpo real devolvido pelo gateway (HTTP 200) na verificação manual.
  const realBody = {
    success: true,
    data: {
      web: [
        {
          url: "https://www.idealista.pt/comprar-casas/vila-nova-de-gaia/com-apartamentos,t3/",
          title: "Apartamentos T3 em Vila Nova de Gaia, Porto",
          description: "1.424 apartamentos T3 à venda em Vila Nova de Gaia",
          position: 1,
        },
        {
          url: "https://www.idealista.pt/imovel/34567890/",
          title: "Apartamento T3 em Mafamude",
          description: "T3 com garagem",
          position: 2,
        },
      ],
    },
  };

  it("6) headers e endpoint corretos, resposta 200 processada", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(realBody), { status: 200 }));
    const raw = await fetchListingsFromGateway("T3 Gaia venda", 15, fetchMock as unknown as typeof fetch);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(FIRECRAWL_SEARCH_URL);
    expect(url).toContain("connector-gateway.lovable.dev/firecrawl/v2/search");
    expect(url).not.toContain("api.firecrawl.dev");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer lov-test");
    expect(headers["X-Connection-Api-Key"]).toBe("lovc_test");
    expect(JSON.parse(String(init.body))).toEqual({ query: "T3 Gaia venda", limit: 15 });

    expect(parseGatewayResults(realBody)).toHaveLength(2);
    const results = filterListings(raw, 5);
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe("https://www.idealista.pt/imovel/34567890/");
    expect(formatSimilarListings({ results })).toContain("não é uma avaliação");
  });
});
