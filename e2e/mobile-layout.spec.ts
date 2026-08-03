import { test, expect, type Page } from "@playwright/test";

/**
 * Regra do produto: em telemóvel nada transborda para o lado. As listagens
 * (Pessoas, Negócios/Oportunidades, Seguimentos e Imóveis) têm de manter o
 * mesmo layout em lista e em grelha, sem scroll horizontal nem cartões
 * cortados.
 *
 * Precisa de uma sessão do consultor. Sem sessão, os testes são saltados em
 * vez de falhar (ex.: correr localmente sem login).
 */
const SESSION = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
const COOKIES = process.env.LOVABLE_BROWSER_SUPABASE_COOKIES_JSON;

/** Larguras reais: iPhone SE (a mais apertada) e iPhone 14. */
const LARGURAS = [
  { nome: "iPhone SE", width: 320, height: 780 },
  { nome: "iPhone 14", width: 390, height: 844 },
];

const ROTAS = [
  { nome: "Pessoas", url: "/pessoas" },
  { nome: "Negócios", url: "/negocios" },
  { nome: "Seguimentos", url: "/seguimentos" },
  { nome: "Imóveis", url: "/imoveis" },
];

async function autenticar(page: Page) {
  const base = process.env.E2E_BASE_URL ?? "http://localhost:8080";
  if (COOKIES) {
    const cookies = JSON.parse(COOKIES).map((c: Record<string, unknown>) => ({ ...c, url: base }));
    await page.context().addCookies(cookies);
  }
  await page.goto("/");
  if (STORAGE_KEY && SESSION) {
    await page.evaluate(
      ([k, v]) => window.localStorage.setItem(k as string, v as string),
      [STORAGE_KEY, SESSION],
    );
  }
}

/** Elementos visíveis que ultrapassam a largura do ecrã. */
async function transbordos(page: Page) {
  return page.evaluate(() => {
    const limite = document.documentElement.clientWidth + 1;
    const fora: string[] = [];
    // Carrosséis horizontais intencionais (separadores, filtros) não contam.
    const dentroDeCarrossel = (el: HTMLElement) => {
      let p: HTMLElement | null = el.parentElement;
      while (p && p !== document.body) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === "auto" || ox === "scroll") return true;
        p = p.parentElement;
      }
      return false;
    };
    document.querySelectorAll<HTMLElement>("main *").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      if (getComputedStyle(el).position === "fixed") return;
      if (dentroDeCarrossel(el)) return;
      if (r.right > limite || r.left < -1) {
        const cls = typeof el.className === "string" ? el.className.slice(0, 60) : "";
        fora.push(`${el.tagName.toLowerCase()}.${cls} [${Math.round(r.left)}→${Math.round(r.right)}]`);
      }
    });
    return {
      fora: fora.slice(0, 8),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });
}

async function validarLayout(page: Page, contexto: string) {
  const r = await transbordos(page);
  expect(r.scrollWidth, `${contexto}: página com scroll horizontal`).toBeLessThanOrEqual(r.clientWidth + 1);
  expect(r.fora, `${contexto}: elementos a transbordar`).toEqual([]);
}

test.describe("Layout móvel sem transbordo nas listagens", () => {
  test.skip(!SESSION, "Sem sessão do consultor: E2E autenticado indisponível.");

  for (const ecra of LARGURAS) {
    for (const rota of ROTAS) {
      test(`${rota.nome} em ${ecra.nome} (${ecra.width}px)`, async ({ page }) => {
        await page.setViewportSize({ width: ecra.width, height: ecra.height });
        await autenticar(page);
        await page.goto(rota.url);
        await page.waitForLoadState("networkidle");

        await validarLayout(page, `${rota.nome} · vista inicial`);

        // Quando existe alternância lista/grelha, ambas têm de aguentar.
        const grelha = page.getByRole("button", { name: "Grelha" });
        if (await grelha.count()) {
          await grelha.first().click();
          await page.waitForTimeout(300);
          await validarLayout(page, `${rota.nome} · grelha`);

          await page.getByRole("button", { name: "Lista" }).first().click();
          await page.waitForTimeout(300);
          await validarLayout(page, `${rota.nome} · lista`);
        }
      });
    }
  }
});
