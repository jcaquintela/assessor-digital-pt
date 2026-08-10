import { test, expect, type Page } from "@playwright/test";

/**
 * Golden tests: em mobile a barra de pesquisa fixa não tapa o conteúdo e o
 * botão "Falar com Afonso" aparece uma única vez, fixo acima da tab bar.
 */
const SESSION = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
const COOKIES = process.env.LOVABLE_BROWSER_SUPABASE_COOKIES_JSON;

/** Com notch (iPhone 14) e sem notch (iPhone SE). */
const ECRAS = [
  { nome: "com notch", width: 390, height: 844 },
  { nome: "sem notch", width: 320, height: 568 },
];

const ROTAS = ["/definicoes", "/hoje", "/pessoas", "/imoveis", "/diversos"];

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

test.describe("Mobile: barra fixa e botão flutuante", () => {
  test.skip(!SESSION, "Sem sessão do consultor: E2E autenticado indisponível.");

  for (const ecra of ECRAS) {
    for (const rota of ROTAS) {
      test(`${rota} (${ecra.nome}): barra de pesquisa não tapa o conteúdo`, async ({ page }) => {
        await page.setViewportSize({ width: ecra.width, height: ecra.height });
        await autenticar(page);
        await page.goto(rota);
        await page.waitForLoadState("networkidle");

        const barra = page.locator("main .c-search").first();
        if (!(await barra.count())) test.skip();
        const b = await barra.boundingBox();
        expect(b, "barra de pesquisa visível").toBeTruthy();
        expect(b!.y, "barra abaixo da safe area do topo").toBeGreaterThanOrEqual(0);

        const h1 = page.locator("main h1").first();
        if (await h1.count()) {
          const t = await h1.boundingBox();
          expect(t!.y, "título não fica por baixo da barra fixa").toBeGreaterThanOrEqual(b!.y + b!.height - 1);
        }
      });
    }

    test(`Hoje (${ecra.nome}): "Falar com" fixo e único durante o scroll`, async ({ page }) => {
      await page.setViewportSize({ width: ecra.width, height: ecra.height });
      await autenticar(page);
      await page.goto("/hoje");
      await page.waitForLoadState("networkidle");

      const fab = page.locator(".mobile-fab a");
      await expect(fab).toHaveCount(1);
      const antes = await fab.boundingBox();

      await page.mouse.wheel(0, 2000);
      await page.waitForTimeout(400);
      const depois = await fab.boundingBox();
      expect(Math.abs(depois!.y - antes!.y), "o botão mantém-se fixo no fundo").toBeLessThan(2);

      const alturaEcra = ecra.height;
      expect(depois!.y, "o botão fica no fundo, não a meio").toBeGreaterThan(alturaEcra * 0.5);
    });
  }
});
