import { test, expect, type Page } from "@playwright/test";

/**
 * Regra do produto: todos os cartões do dashboard "Hoje" leem o MESMO conjunto
 * de negócios ativos (regra canónica `isDealActive`). Este teste compara, no
 * mesmo instante e para a mesma conta:
 *
 *   1. Quadro /negocios (verdade de referência: colunas ativas vs "Concluídos")
 *   2. Resumo geral → cartão "Negócios em curso"
 *   3. Banner "A precisar de atenção" → "N negócios sem próxima ação"
 *   4. Cartões de prioridade ("Isto merece atenção" e lista) que apontam para
 *      um negócio — nunca podem apontar para um negócio concluído/arquivado,
 *      nem mostrar o nome truncado.
 */
const SESSION = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const STORAGE_KEY = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
const COOKIES = process.env.LOVABLE_BROWSER_SUPABASE_COOKIES_JSON;

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

function idDoHref(href: string | null): string | null {
  const m = (href ?? "").match(/\/negocios\/([0-9a-f-]{36})/i);
  return m ? m[1] : null;
}

/** Lê o quadro de negócios: ids/títulos ativos e ids concluídos. */
async function lerQuadro(page: Page) {
  await page.goto("/negocios");
  await page.locator('a[href*="/negocios/"], text=Negócios').first().waitFor();

  const concluidosSec = page.locator("section", { has: page.getByRole("heading", { name: "Concluídos" }) });
  const concluidos = new Set<string>();
  if (await concluidosSec.count()) {
    for (const l of await concluidosSec.first().locator('a[href*="/negocios/"]').all()) {
      const id = idDoHref(await l.getAttribute("href"));
      if (id) concluidos.add(id);
    }
  }

  const ativos = new Map<string, string>();
  for (const l of await page.locator('a[href*="/negocios/"]').all()) {
    const id = idDoHref(await l.getAttribute("href"));
    if (!id || concluidos.has(id) || ativos.has(id)) continue;
    const titulo = (await l.locator(".font-semibold").first().innerText().catch(() => "")).trim();
    ativos.set(id, titulo);
  }
  return { ativos, concluidos };
}

test.describe("Hoje: todos os cartões contam os mesmos negócios", () => {
  test.skip(!SESSION, "Sem sessão do consultor: E2E autenticado indisponível.");

  test("resumo, banner e prioridades coerentes com o quadro de negócios", async ({ page }) => {
    await autenticar(page);
    const { ativos, concluidos } = await lerQuadro(page);

    await page.goto("/hoje");
    await page.getByText("Resumo geral").first().waitFor();

    // 2. Resumo geral: a contagem tem de bater certo com o quadro ativo.
    const sumcard = page.locator('[data-sumcard="negocios"]');
    await expect(sumcard).toBeVisible();
    const contagemResumo = Number((await sumcard.locator(".c-sum-stat").innerText()).trim());
    expect(contagemResumo).toBe(ativos.size);

    // Valor "em jogo": 0 negócios ativos ⇒ nunca dinheiro em jogo.
    const meta = (await sumcard.locator(".c-sum-meta").innerText()).trim();
    if (ativos.size === 0) expect(meta).toMatch(/^0\s*€|0,00\s*€/);

    // 3. Banner agregado: subconjunto dos ativos, nunca mais do que eles.
    const banner = page.getByText(/negócios? sem próxima ação/);
    if (await banner.count()) {
      const txt = await banner.first().innerText();
      const semAcao = Number(txt.match(/(\d+)\s+negócios?/)![1]);
      expect(semAcao).toBeGreaterThan(0);
      expect(semAcao).toBeLessThanOrEqual(ativos.size);
      // Zero ativos ⇒ o banner de negócios não pode sequer existir.
      expect(ativos.size).toBeGreaterThan(0);
    }

    // 4. Prioridades: só apontam para negócios ativos e com o nome completo.
    const links = await page.locator('a[href*="/negocios/"]').all();
    for (const l of links) {
      const id = idDoHref(await l.getAttribute("href"));
      if (!id) continue;
      expect(concluidos.has(id), `Cartão do Hoje aponta para negócio concluído ${id}`).toBe(false);
      expect(ativos.has(id), `Cartão do Hoje aponta para negócio inexistente no quadro ativo ${id}`).toBe(true);
    }

    // Nome íntegro: se o quadro diz "Venda do terreno", o Hoje não pode dizer "Venda".
    const textoHoje = await page.locator("main").innerText();
    for (const [id, titulo] of ativos) {
      if (!titulo) continue;
      const apareceNoHoje = links.length > 0 && (await page
        .locator(`a[href*="/negocios/${id}"]`)
        .count()) > 0;
      if (apareceNoHoje) {
        expect(textoHoje, `Nome truncado para o negócio ${id}`).toContain(titulo);
      }
    }
  });
});
