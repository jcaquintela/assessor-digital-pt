import { test, expect, type Page } from "@playwright/test";

/**
 * Regressão visual e responsiva de /ligar-canal: o destaque do WhatsApp e a
 * alternativa Telegram têm de ficar lado a lado e legíveis em tablet/desktop,
 * e empilhados a toda a largura, sem cortes, em telemóvel.
 *
 * Precisa de sessão do consultor; sem sessão os testes são saltados.
 */
const SESSION = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
const COOKIES = process.env.LOVABLE_BROWSER_SUPABASE_COOKIES_JSON;

const ECRAS = [
  { nome: "iPhone SE", width: 320, height: 780, lado_a_lado: false },
  { nome: "iPhone 14", width: 390, height: 844, lado_a_lado: false },
  { nome: "iPhone Plus", width: 414, height: 896, lado_a_lado: false },
  { nome: "Tablet retrato", width: 768, height: 1024, lado_a_lado: true },
  { nome: "Tablet paisagem", width: 1024, height: 768, lado_a_lado: true },
  { nome: "Desktop", width: 1440, height: 900, lado_a_lado: true },
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

/** Caixa de um cartão + verificação de conteúdo cortado. */
async function medir(page: Page, testId: string) {
  return page.evaluate((id) => {
    const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cortados: string[] = [];
    el.querySelectorAll<HTMLElement>("*").forEach((c) => {
      const cr = c.getBoundingClientRect();
      if (cr.width === 0 || cr.height === 0) return;
      // Conteúdo fora da caixa do cartão = corte/transbordo.
      if (cr.right > r.right + 1 || cr.left < r.left - 1) {
        cortados.push(`${c.tagName.toLowerCase()} [${Math.round(cr.left)}→${Math.round(cr.right)}]`);
      }
      // Texto escondido por altura insuficiente.
      if (c.scrollHeight > c.clientHeight + 2 && getComputedStyle(c).overflowY === "hidden") {
        cortados.push(`${c.tagName.toLowerCase()} texto cortado em altura`);
      }
    });
    return { left: r.left, right: r.right, top: r.top, width: r.width, cortados: cortados.slice(0, 5) };
  }, testId);
}

test.describe("/ligar-canal · WhatsApp e Telegram legíveis em qualquer ecrã", () => {
  for (const ecra of ECRAS) {
    test(`${ecra.nome} (${ecra.width}px)`, async ({ page }) => {
      await page.setViewportSize({ width: ecra.width, height: ecra.height });
      // Harness determinístico: mesmo componente da rota /ligar-canal, sem
      // sessão nem dados, para que a baseline visual não oscile.
      if (SESSION) await autenticar(page);
      await page.goto("/dev/ligar-canal");
      await page.waitForLoadState("networkidle");

      const escolha = page.getByTestId("escolha-canal");
      await expect(escolha, "as duas opções têm de aparecer sem redirecionamento").toBeVisible();

      // Ambas as opções visíveis, com os respetivos botões acessíveis.
      await expect(page.getByRole("heading", { name: "WhatsApp" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Telegram" })).toBeVisible();
      await expect(page.getByRole("button", { name: /14 dias no WhatsApp/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /Ligar Telegram/i })).toBeVisible();

      const wa = await medir(page, "canal-whatsapp");
      const tg = await medir(page, "canal-telegram");
      expect(wa && tg, "cartões em falta").toBeTruthy();
      if (!wa || !tg) return;

      // Sem cortes dentro de cada cartão.
      expect(wa.cortados, `${ecra.nome}: conteúdo cortado no cartão WhatsApp`).toEqual([]);
      expect(tg.cortados, `${ecra.nome}: conteúdo cortado no cartão Telegram`).toEqual([]);

      // Sem scroll horizontal na página.
      const doc = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(doc.scrollWidth, `${ecra.nome}: scroll horizontal`).toBeLessThanOrEqual(doc.clientWidth + 1);

      if (ecra.lado_a_lado) {
        // Lado a lado: mesma linha, larguras equilibradas e sem sobreposição.
        expect(Math.abs(wa.top - tg.top), `${ecra.nome}: cartões não estão na mesma linha`).toBeLessThanOrEqual(4);
        expect(wa.right, `${ecra.nome}: cartões sobrepostos`).toBeLessThanOrEqual(tg.left + 1);
        expect(Math.abs(wa.width - tg.width), `${ecra.nome}: larguras desequilibradas`).toBeLessThanOrEqual(8);
        expect(wa.width, `${ecra.nome}: cartão demasiado estreito para ler`).toBeGreaterThanOrEqual(280);
      } else {
        // Empilhados: mesma coluna, largura total e Telegram por baixo.
        expect(Math.abs(wa.left - tg.left), `${ecra.nome}: cartões desalinhados`).toBeLessThanOrEqual(2);
        expect(tg.top, `${ecra.nome}: Telegram não ficou por baixo do WhatsApp`).toBeGreaterThan(wa.top);
        expect(wa.width, `${ecra.nome}: cartão não ocupa a largura disponível`).toBeGreaterThanOrEqual(
          ecra.width * 0.8,
        );
      }

      // Legibilidade mínima do texto descritivo (>= 12px).
      const menorFonte = await page.evaluate(() => {
        let min = 99;
        document
          .querySelectorAll<HTMLElement>('[data-testid="escolha-canal"] p, [data-testid="escolha-canal"] li span, [data-testid="escolha-canal"] button')
          .forEach((el) => {
            if (!el.textContent?.trim()) return;
            min = Math.min(min, parseFloat(getComputedStyle(el).fontSize));
          });
        return min;
      });
      expect(menorFonte, `${ecra.nome}: texto abaixo de 12px`).toBeGreaterThanOrEqual(12);

      // Regressão visual: instantâneo por ecrã.
      await expect(escolha).toHaveScreenshot(`ligar-canal-${ecra.width}.png`, {
        maxDiffPixelRatio: 0.02,
        animations: "disabled",
      });
    });
  }
});
