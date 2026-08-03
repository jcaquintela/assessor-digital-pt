import { test, expect, type Page } from "@playwright/test";

/**
 * Regra do produto: o título é sempre o ASSUNTO e a ação sugerida vive dentro
 * da frase. Este teste navega de Atrasados/Esta semana para a ficha e confirma
 * que assunto e ação sugerida NÃO divergem entre lista e ficha.
 *
 * Precisa de uma sessão do consultor. Quando não existe, o teste é saltado em
 * vez de falhar (ex.: correr localmente sem login).
 */
const SESSION = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
const COOKIES = process.env.LOVABLE_BROWSER_SUPABASE_COOKIES_JSON;

/** Extrai a frase "Vale a pena X." de um texto, se existir. */
function acaoSugerida(texto: string): string | null {
  const m = texto.match(/Vale a pena [^.]+\./i);
  return m ? m[0].trim() : null;
}

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

test.describe("Assunto e ação sugerida coerentes entre lista e ficha", () => {
  test.skip(!SESSION, "Sem sessão do consultor: E2E autenticado indisponível.");

  for (const separador of ["Atrasados", "Esta semana"] as const) {
    test(`${separador} → ficha do seguimento`, async ({ page }) => {
      await autenticar(page);
      await page.goto("/seguimentos");

      await page.getByRole("tab", { name: separador }).click();

      const primeiro = page.locator('a[aria-label^="Abrir seguimento"]').first();
      if ((await primeiro.count()) === 0) test.skip(true, `Sem seguimentos em ${separador}.`);

      const tituloLista = (await primeiro.getAttribute("aria-label"))!
        .replace(/^Abrir seguimento /, "")
        .trim();
      const textoLista = (await primeiro.innerText()).trim();
      const acaoLista = acaoSugerida(textoLista);

      await primeiro.click();
      await expect(page).toHaveURL(/\/seguimentos\/[0-9a-f-]{36}/);

      // Título da ficha = mesmo assunto da lista, nunca a ação genérica.
      const tituloFicha = (await page.getByRole("heading", { level: 1 }).first().innerText()).trim();
      expect(tituloFicha).toBe(tituloLista);
      expect(acaoSugerida(tituloFicha)).toBeNull();

      // Ação sugerida: a mesma frase, dentro do texto explicativo.
      const proximoPasso = (await page.getByText("Próximo passo").locator("..").innerText()).trim();
      if (acaoLista) expect(acaoSugerida(proximoPasso)).toBe(acaoLista);
    });
  }

  test("Lista → ficha do negócio mantém o assunto no título", async ({ page }) => {
    await autenticar(page);
    await page.goto("/negocios");

    const primeiro = page.locator('a[href^="/negocios/"]').first();
    if ((await primeiro.count()) === 0) test.skip(true, "Sem negócios registados.");

    const tituloLista = (await primeiro.innerText()).split("\n")[0].trim();
    await primeiro.click();
    await expect(page).toHaveURL(/\/negocios\/[0-9a-f-]{36}/);

    const tituloFicha = (await page.getByRole("heading", { level: 1 }).first().innerText()).trim();
    expect(tituloFicha).toBe(tituloLista);
    expect(acaoSugerida(tituloFicha)).toBeNull();
  });
});
