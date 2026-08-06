import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

/**
 * Fluxo completo da palavra-passe do painel:
 *  1. entrada por link mágico → passo opcional "definir palavra-passe";
 *  2. depois de definida, o login com email + palavra-passe funciona;
 *  3. o link mágico continua a funcionar (e já não pede palavra-passe).
 *
 * Precisa do service role para criar/limpar a conta de teste. Sem ele o teste
 * é saltado em vez de falhar.
 */
const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = "Afonso!teste2026";

let admin: SupabaseClient;
let userId = "";
let email = "";

/** Cria um link de entrada válido (mesmo mecanismo do Afonso nos canais). */
async function novoToken(): Promise<string> {
  const token = `lg_${randomBytes(24).toString("hex")}`;
  await admin
    .from("dashboard_login_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("used_at", null);
  const { error } = await admin.from("dashboard_login_tokens").insert({
    token,
    user_id: userId,
    channel: "e2e",
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) throw new Error(`Não consegui criar o link de entrada: ${error.message}`);
  return token;
}

test.describe.configure({ mode: "serial" });

test.describe("Palavra-passe do painel e link mágico", () => {
  test.skip(!URL || !SERVICE, "Sem service role: E2E de autenticação indisponível.");

  test.beforeAll(async () => {
    admin = createClient(URL!, SERVICE!, { auth: { persistSession: false } });
    email = `e2e.password.${Date.now()}@meuafonso.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: "Conta E2E Palavra-passe" },
    });
    if (error || !data.user) throw new Error(`Não consegui criar a conta de teste: ${error?.message}`);
    userId = data.user.id;
  });

  test.afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  test("link mágico oferece o passo da palavra-passe e guarda-a", async ({ page }) => {
    await page.goto(`/entrar?token=${await novoToken()}`);

    await expect(page).toHaveURL(/\/definir-password/, { timeout: 30_000 });
    await page.locator("#pw").fill(PASSWORD);
    await page.locator("#pw2").fill(PASSWORD);
    await page.getByRole("button", { name: "Definir palavra-passe" }).click();

    await expect(page).not.toHaveURL(/\/definir-password/, { timeout: 30_000 });
    await expect(page).not.toHaveURL(/\/auth/);

    const { data } = await admin
      .from("profiles")
      .select("password_set_at")
      .eq("id", userId)
      .maybeSingle();
    expect(data?.password_set_at).toBeTruthy();
  });

  test("entra com email e palavra-passe", async ({ page }) => {
    await page.goto("/auth");
    const form = page.locator("form").first();
    await form.locator('input[type="email"]').fill(email);
    await form.locator('input[type="password"]').fill(PASSWORD);
    await form.getByRole("button", { name: "Entrar" }).click();

    await expect(page).not.toHaveURL(/\/auth/, { timeout: 30_000 });
    const sessão = await page.evaluate(() =>
      Object.keys(window.localStorage).some((k) => /^sb-.*-auth-token$/.test(k)),
    );
    expect(sessão).toBe(true);
  });

  test("link mágico continua a funcionar depois da palavra-passe", async ({ page }) => {
    await page.goto(`/entrar?token=${await novoToken()}`);

    // Já tem palavra-passe: entra direto, sem repetir o passo opcional.
    await expect(page).not.toHaveURL(/\/entrar/, { timeout: 30_000 });
    await expect(page).not.toHaveURL(/\/definir-password/);
    await expect(page).not.toHaveURL(/\/auth/);
    const sessão = await page.evaluate(() =>
      Object.keys(window.localStorage).some((k) => /^sb-.*-auth-token$/.test(k)),
    );
    expect(sessão).toBe(true);
  });
});
