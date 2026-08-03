import { test, expect, type Page } from "@playwright/test";

/**
 * Fluxo real do consultor: parte de "Hoje", regista um seguimento e confirma
 * que ele aparece no separador certo em "Seguimentos" (Hoje, Esta semana e
 * Atrasados). Cada teste limpa o que criou.
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

/** Navegação estável: o router do lado do cliente pode abortar o primeiro goto. */
async function irPara(page: Page, url: string) {
  for (let i = 0; i < 3; i++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
    } catch {
      await page.waitForTimeout(500);
      continue;
    }
    // A guarda de sessão corre no cliente; se cair no ecrã de entrada,
    // repõe a sessão e tenta outra vez.
    if (!page.url().includes("/auth")) break;
    await guardarSessao(page);
    await page.waitForTimeout(300);
  }
  await page.waitForLoadState("networkidle");
}

/** Data em formato do input (YYYY-MM-DD), com deslocamento em dias. */
function dataISO(offsetDias: number) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDias);
  return d.toISOString().slice(0, 10);
}

/**
 * A partir de "Hoje": navega para uma pessoa e regista lá o seguimento
 * (é o sítio onde o consultor o cria sem passar pelo Assessor).
 */
async function registarSeguimentoDesdeHoje(page: Page, titulo: string, quando: string) {
  await irPara(page, "/hoje");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.getByRole("link", { name: "Pessoas", exact: true }).first().click();
  await page.waitForURL("**/pessoas");
  await page.waitForLoadState("networkidle");

  const pessoa = page.locator('a[href^="/pessoas/"]').first();
  await expect(pessoa, "é preciso pelo menos uma pessoa para registar o seguimento").toBeVisible();
  await pessoa.click();
  await page.waitForURL(/\/pessoas\/[^/]+$/);

  await page.getByRole("button", { name: "Mais ações" }).click();
  await page.getByRole("menuitem", { name: "Adicionar seguimento" }).click();

  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByText("Adicionar seguimento")).toBeVisible();
  await dialogo.locator("#seg-t").fill(titulo);
  await dialogo.locator("#seg-d").fill(quando);
  await dialogo.getByRole("button", { name: "Criar" }).click();
  await expect(dialogo).toBeHidden();
}

/** Abre o seguimento pelo título e apaga-o, para não deixar lixo na conta. */
async function apagarSeguimento(page: Page, titulo: string) {
  await irPara(page, "/seguimentos");
  for (const sep of ["Atrasados", "Esta semana", "Hoje"]) {
    const aba = page.getByRole("tab", { name: new RegExp(`^${sep}`) });
    if (!(await aba.count())) continue;
    await aba.click();
    const cartao = page.getByRole("link", { name: new RegExp(titulo) }).first();
    if (await cartao.count()) {
      await cartao.click();
      await page.waitForURL(/\/seguimentos\/[^/]+$/);
      page.once("dialog", (d) => void d.accept());
      await page.getByRole("button", { name: "Apagar" }).click();
      await page.waitForURL("**/seguimentos");
      return;
    }
  }
}

/** Confirma que o seguimento está no separador esperado. */
async function verNoSeparador(page: Page, separador: string, titulo: string) {
  await irPara(page, "/seguimentos");
  await page.getByRole("tab", { name: new RegExp(`^${separador}`) }).click();
  await expect(
    page.getByRole("link", { name: new RegExp(titulo) }).first(),
    `${titulo} devia aparecer em ${separador}`,
  ).toBeVisible();
}

test.describe("Registar seguimento a partir de Hoje", () => {
  test.skip(!SESSION, "Sem sessão do consultor: E2E autenticado indisponível.");

  const casos = [
    { separador: "Hoje", offset: 0 },
    { separador: "Esta semana", offset: 3 },
    { separador: "Atrasados", offset: -2 },
  ];

  for (const caso of casos) {
    test(`aparece em ${caso.separador}`, async ({ page }) => {
      const titulo = `E2E seguimento ${caso.separador} ${Date.now()}`;
      try {
        await registarSeguimentoDesdeHoje(page, titulo, dataISO(caso.offset));
        await verNoSeparador(page, caso.separador, titulo);
      } finally {
        await apagarSeguimento(page, titulo);
      }
    });
  }
});
