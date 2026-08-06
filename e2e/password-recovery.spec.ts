import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Recuperação de palavra-passe de quem tem email real:
 *  1. pede a recuperação no ecrã de entrada;
 *  2. abre o link de nova palavra-passe (o mesmo que chega por email);
 *  3. define uma nova palavra-passe;
 *  4. entra com email + a nova palavra-passe.
 *
 * O link é gerado pelo service role (equivalente ao que o email transporta),
 * porque não há caixa de correio no ambiente de teste.
 */
const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTIGA = "Afonso!antiga2026";
const NOVA = "Afonso!nova2026";

let admin: SupabaseClient;
let userId = "";
let email = "";

test.describe.configure({ mode: "serial" });

test.describe("Recuperar palavra-passe com email real", () => {
  test.skip(!URL || !SERVICE, "Sem service role: E2E de autenticação indisponível.");

  test.beforeAll(async () => {
    admin = createClient(URL!, SERVICE!, { auth: { persistSession: false } });
    email = `e2e.recovery.${Date.now()}@meuafonso.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: ANTIGA,
      email_confirm: true,
      user_metadata: { full_name: "Conta E2E Recuperação" },
    });
    if (error || !data.user) throw new Error(`Não consegui criar a conta de teste: ${error?.message}`);
    userId = data.user.id;
    await admin.from("profiles").update({ email }).eq("id", userId);
  });

  test.afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  test("pedir recuperação no ecrã de entrada", async ({ page }) => {
    await page.goto("/auth");
    await page.getByRole("tab", { name: "Recuperar" }).click();
    const enviar = page.getByRole("button", { name: /Enviar link de recuperação/i });
    const form = page.locator("form").filter({ has: enviar }).first();
    await form.locator('input[type="email"]').fill(email);
    await enviar.click();

    // Resposta neutra: nunca revela se a conta existe.
    await expect(page.getByText(/enviámos instruções/i)).toBeVisible({ timeout: 30_000 });

    // Conta com email real: o link segue por email, não pelo canal.
    const { data } = await admin
      .from("dashboard_login_tokens")
      .select("id")
      .eq("user_id", userId)
      .is("used_at", null);
    expect((data ?? []).length).toBe(0);
  });

  test("abre o link e define uma nova palavra-passe", async ({ page, baseURL, request }) => {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${baseURL}/reset-password` },
    });
    if (error || !data.properties) throw new Error(`Não consegui gerar o link: ${error?.message}`);

    const verify = new global.URL(`${URL}/auth/v1/verify`);
    verify.searchParams.set("token", data.properties.hashed_token);
    verify.searchParams.set("type", "recovery");
    verify.searchParams.set("redirect_to", `${baseURL}/reset-password`);

    // O redirect do email traz a sessão de recuperação no fragmento. Em local
    // o destino permitido é o site publicado, por isso reaproveitamos aqui só
    // o fragmento e abrimos o mesmo ecrã na app em teste.
    const res = await request.get(verify.toString(), { maxRedirects: 0 });
    const destino = res.headers()["location"] ?? "";
    const hash = destino.slice(destino.indexOf("#"));
    expect(hash).toContain("access_token=");
    await page.goto(`${baseURL}/reset-password${hash}`);

    await expect(page).toHaveURL(/\/reset-password/, { timeout: 30_000 });
    const campo = page.locator('input[type="password"]');
    await expect(campo).toBeVisible({ timeout: 30_000 });
    await campo.fill(NOVA);
    await page.getByRole("button", { name: "Guardar" }).click();

    await expect(page).not.toHaveURL(/\/reset-password/, { timeout: 30_000 });
    await expect(page).not.toHaveURL(/\/auth/);
  });

  test("entra com email e a nova palavra-passe", async ({ page }) => {
    await page.goto("/auth");
    await page.evaluate(() => window.localStorage.clear());
    await page.goto("/auth");

    const form = page.locator("form").first();
    await form.locator('input[type="email"]').fill(email);
    await form.locator('input[type="password"]').fill(NOVA);
    await form.getByRole("button", { name: "Entrar" }).click();

    await expect(page).not.toHaveURL(/\/auth/, { timeout: 30_000 });
    const sessão = await page.evaluate(() =>
      Object.keys(window.localStorage).some((k) => /^sb-.*-auth-token$/.test(k)),
    );
    expect(sessão).toBe(true);

    // A antiga já não serve.
    const anonKey = process.env.SUPABASE_ANON_KEY;
    if (anonKey) {
      const anon = createClient(URL!, anonKey, { auth: { persistSession: false } });
      const { error } = await anon.auth.signInWithPassword({ email, password: ANTIGA });
      expect(error).toBeTruthy();
    }
  });
});
