import { test, expect, type Page } from "@playwright/test";

/**
 * Categorias do Drive Inteligente no URL: abrir por link direto (?cat= e ?exp=),
 * back/forward do browser e reposição do scroll ao voltar aos cartões.
 */
const SESSION = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
const COOKIES = process.env.LOVABLE_BROWSER_SUPABASE_COOKIES_JSON;

async function guardarSessao(page: Page) {
  if (!STORAGE_KEY || !SESSION) return;
  await page.evaluate(
    ([k, v]) => window.localStorage.setItem(k as string, v as string),
    [STORAGE_KEY, SESSION],
  );
}

async function autenticar(page: Page) {
  const base = process.env.E2E_BASE_URL ?? "http://localhost:8080";
  if (COOKIES) {
    const cookies = JSON.parse(COOKIES).map((c: Record<string, unknown>) => ({ ...c, url: base }));
    await page.context().addCookies(cookies);
  }
  await page.goto("/");
  await guardarSessao(page);
}

async function irPara(page: Page, url: string) {
  for (let i = 0; i < 3; i++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
    } catch {
      await page.waitForTimeout(500);
      continue;
    }
    await page.waitForLoadState("networkidle");
    if (!page.url().includes("/auth")) break;
    await guardarSessao(page);
    await page.waitForTimeout(300);
  }
  await page.waitForLoadState("networkidle");
}

const cartoes = (page: Page) => page.locator("[data-categoria]");
const aberta = (page: Page) => page.locator("[data-categoria-aberta]");

test.beforeEach(async ({ page }) => {
  await autenticar(page);
  await irPara(page, "/drive");
});

test("clicar num cartão escreve a categoria no URL e o back volta aos cartões", async ({ page }) => {
  const primeiro = cartoes(page).first();
  test.skip((await cartoes(page).count()) === 0, "sem ficheiros no Drive desta conta");

  const chave = await primeiro.getAttribute("data-categoria");
  await primeiro.getByRole("button").first().click();
  await expect
    .poll(() => new URL(page.url()).search)
    .toContain(encodeURIComponent(chave!).replace(/%3A/g, "%3A"));

  await page.goBack();
  await page.waitForLoadState("networkidle");
  const search = new URL(page.url()).searchParams;
  expect(search.get("cat")).toBeNull();
  expect(search.get("exp")).toBeNull();
  await expect(cartoes(page).first()).toBeVisible();

  // Forward reabre exactamente a mesma categoria.
  await page.goForward();
  await page.waitForLoadState("networkidle");
  const depois = new URL(page.url()).searchParams;
  expect(depois.get("cat") ?? depois.get("exp")).toBe(chave);
});

test("link direto ?cat= abre a vista dedicada com 'Voltar às categorias'", async ({ page }) => {
  test.skip((await cartoes(page).count()) === 0, "sem ficheiros no Drive desta conta");
  const chave = (await cartoes(page).first().getAttribute("data-categoria"))!;

  await irPara(page, `/drive?cat=${encodeURIComponent(chave)}`);
  await expect(aberta(page)).toHaveAttribute("data-categoria-aberta", chave);

  await page.getByRole("button", { name: "Voltar às categorias" }).click();
  await expect(cartoes(page).first()).toBeVisible();
  expect(new URL(page.url()).searchParams.get("cat")).toBeNull();
});

test("link direto ?exp= mantém a grelha com o cartão expandido", async ({ page }) => {
  test.skip((await cartoes(page).count()) === 0, "sem ficheiros no Drive desta conta");
  const chave = (await cartoes(page).first().getAttribute("data-categoria"))!;

  await irPara(page, `/drive?exp=${encodeURIComponent(chave)}`);
  const cartao = page.locator(`[data-categoria="${chave}"]`);
  await expect(cartao.getByRole("button", { expanded: true }).first()).toBeVisible();
  await expect(cartoes(page).first()).toBeVisible();
});

test("pesquisa é transversal e ignora a categoria aberta", async ({ page }) => {
  test.skip((await cartoes(page).count()) === 0, "sem ficheiros no Drive desta conta");
  const chave = (await cartoes(page).first().getAttribute("data-categoria"))!;
  await irPara(page, `/drive?cat=${encodeURIComponent(chave)}&q=a`);
  await expect(aberta(page)).toHaveCount(0);
});

test("voltar aos cartões repõe a posição na página", async ({ page }) => {
  test.skip((await cartoes(page).count()) < 4, "poucos cartões para haver scroll");
  await page.evaluate(() => window.scrollTo({ top: 400 }));
  const antes = await page.evaluate(() => window.scrollY);
  test.skip(antes < 50, "a página não tem scroll suficiente");

  await cartoes(page).nth(1).getByRole("button").first().click();
  await page.waitForLoadState("networkidle");
  await page.goBack();
  await page.waitForLoadState("networkidle");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(antes - 120);
});
