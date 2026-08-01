// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, cleanup } from "@testing-library/react";

// O <Link> do router precisa de contexto; para o teste de DOM basta um <a>.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
}));

import { HojeSumGrid, buildSumCards, type SumGridSummary } from "./sum-grid";

const resumo: SumGridSummary = {
  deals: { count: 4, value: 12000 },
  properties: { count: 7, toAcquire: 5 },
  people: { count: 31, contactedWeek: 3 },
  misc: { pending: 2 },
  agenda: { today: 1, nextLabel: "Visita Av. Roma", nextTime: "15:30" },
  billing: { forecast: 8400, open: 5 },
};

const ORDEM = ["negocios", "imoveis", "pessoas", "diversos", "neutro", "neutro"];
const DESTINOS = ["/negocios", "/imoveis", "/pessoas", "/diversos", "/calendario", "/negocio"];

/** Simula uma largura de ecrã (jsdom não faz layout: fixa window.innerWidth + matchMedia). */
function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  window.matchMedia = ((query: string) => {
    const min = Number(query.match(/min-width:\s*(\d+)px/)?.[1] ?? 0);
    return {
      matches: width >= min, media: query, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
}

function renderedOrder() {
  const grid = screen.getByTestId("sumgrid");
  return [...grid.querySelectorAll<HTMLAnchorElement>("a[data-sumcard]")].map((a) => ({
    tone: a.dataset.sumcard,
    href: a.getAttribute("href"),
    label: a.getAttribute("aria-label"),
    stat: a.querySelector(".c-sum-stat")?.textContent,
  }));
}

afterEach(cleanup);

describe("grelha de resumo — estrutura DOM", () => {
  beforeEach(() => setViewport(1440));

  it("rende 6 cartões pela ordem contratada", () => {
    render(<HojeSumGrid resumo={resumo} />);
    const cards = renderedOrder();
    expect(cards).toHaveLength(6);
    expect(cards.map((c) => c.tone)).toEqual(ORDEM);
    expect(cards.map((c) => c.href)).toEqual(DESTINOS);
  });

  it("cada cartão tem a estrutura visual completa (ícone, número, etiqueta, detalhe)", () => {
    render(<HojeSumGrid resumo={resumo} />);
    for (const a of screen.getByTestId("sumgrid").querySelectorAll("a[data-sumcard]")) {
      expect(a.className).toContain("c-sumcard");
      expect(a.querySelector("svg")).not.toBeNull();
      expect(a.querySelector(".c-sum-stat")?.textContent).toBeTruthy();
      expect(a.querySelector(".c-sum-label")?.textContent).toBeTruthy();
      expect(a.querySelector(".c-sum-meta")?.textContent).toBeTruthy();
    }
  });
});

describe("grelha de resumo — regressão entre larguras", () => {
  it("mantém ordem, destinos e conteúdo iguais em mobile (390px) e desktop (1440px)", () => {
    setViewport(390);
    render(<HojeSumGrid resumo={resumo} />);
    const mobile = renderedOrder();
    const htmlMobile = screen.getByTestId("sumgrid").innerHTML;
    cleanup();

    setViewport(1440);
    render(<HojeSumGrid resumo={resumo} />);
    const desktop = renderedOrder();
    const htmlDesktop = screen.getByTestId("sumgrid").innerHTML;

    expect(mobile).toEqual(desktop);
    expect(htmlMobile).toBe(htmlDesktop); // nenhum cartão é escondido ou reordenado por JS
  });

  it("não há cartões ocultos por classes responsivas (hidden/sm:/lg:)", () => {
    setViewport(390);
    render(<HojeSumGrid resumo={resumo} />);
    for (const a of screen.getByTestId("sumgrid").querySelectorAll("a[data-sumcard]")) {
      expect(a.className).not.toMatch(/\bhidden\b|\b(sm|md|lg):hidden\b/);
    }
  });
});

describe("grelha de resumo — contrato de layout CSS", () => {
  const css = readFileSync(resolve("src/styles.css"), "utf8");

  it("mobile: 2 colunas por omissão", () => {
    expect(css).toMatch(/\.c-sumgrid\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*1fr 1fr/);
  });

  it("desktop: 3 colunas a partir de 900px", () => {
    expect(css).toMatch(/@media \(min-width: 900px\) \{[^}]*\.c-sumgrid \{ grid-template-columns: repeat\(3, 1fr\)/);
  });
});

describe("grelha de resumo — dados", () => {
  it("formata as métricas de cada rubrica", () => {
    const cards = buildSumCards(resumo);
    expect(cards.map((c) => c.key)).toEqual([
      "negocios", "imoveis", "pessoas", "diversos", "agenda", "faturacao",
    ]);
    expect(cards[0].stat).toBe("4");
    expect(cards[3].meta).toBe("em Diversos");
    expect(cards[4].meta).toContain("15:30");
    expect(cards[5].statMono).toBe(true);
  });

  it("agenda vazia mostra 'nada marcado' e singular/plural correto", () => {
    const vazio = { ...resumo, agenda: { today: 0, nextLabel: null, nextTime: null } };
    const agenda = buildSumCards(vazio)[4];
    expect(agenda.meta).toBe("nada marcado");
    expect(agenda.label).toBe("Compromissos hoje");
  });
});
