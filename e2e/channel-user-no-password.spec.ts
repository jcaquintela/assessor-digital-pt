import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

/**
 * Contas criadas pelo canal (WhatsApp/Telegram) têm email sintético.
 * Não faz sentido pedir-lhes palavra-passe do painel: entram sempre pelo
 * link que o Afonso envia na conversa.
 *
 * Valida que o passo "definir palavra-passe" nunca aparece a estas contas e
 * que a entrada pelo link do canal continua a funcionar.
 */
const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

let admin: SupabaseClient;
let userId = "";
let chatId = "";

async function novoToken(): Promise<string> {
  const token = `lg_${randomBytes(24).toString("hex")}`;
  const { error } = await admin.from("dashboard_login_tokens").insert({
    token,
    user_id: userId,
    channel: "telegram",
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) throw new Error(`Não consegui criar o link de entrada: ${error.message}`);
  return token;
}

test.describe.configure({ mode: "serial" });

test.describe("Conta de canal não vê o passo da palavra-passe", () => {
  test.skip(!URL || !SERVICE, "Sem service role: E2E de autenticação indisponível.");

  test.beforeAll(async () => {
    admin = createClient(URL!, SERVICE!, { auth: { persistSession: false } });
    chatId = `-99${Date.now()}`;
    const email = `tg-${chatId}@shadow.assessor.local`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: "Conta E2E Canal" },
    });
    if (error || !data.user) throw new Error(`Não consegui criar a conta de teste: ${error?.message}`);
    userId = data.user.id;
    await admin.from("profiles").update({ email, primary_channel: "telegram" }).eq("id", userId);
    await admin.from("channel_links").insert({
      user_id: userId,
      channel: "telegram",
      external_id: chatId,
      display_name: "Conta E2E Canal",
    });
  });

  test.afterAll(async () => {
    if (!userId) return;
    await admin.from("dashboard_login_tokens").delete().eq("user_id", userId);
    await admin.from("channel_links").delete().eq("user_id", userId);
    await admin.from("assessor_messages").delete().eq("user_id", userId);
    await admin.from("consultant_preferences").delete().eq("user_id", userId);
    await admin.from("user_roles").delete().eq("user_id", userId);
    await admin.auth.admin.deleteUser(userId);
  });

  test("entra pelo link do canal e não vê o passo da palavra-passe", async ({ page }) => {
    await page.goto(`/entrar?token=${await novoToken()}`);

    await expect(page).not.toHaveURL(/\/entrar/, { timeout: 30_000 });
    await expect(page).not.toHaveURL(/\/definir-password/);
    await expect(page).not.toHaveURL(/\/auth/);

    const sessão = await page.evaluate(() =>
      Object.keys(window.localStorage).some((k) => /^sb-.*-auth-token$/.test(k)),
    );
    expect(sessão).toBe(true);

    // O passo continua por marcar: não foi mostrado nem saltado à socapa.
    const { data } = await admin
      .from("profiles")
      .select("password_set_at, password_prompt_skipped_at")
      .eq("id", userId)
      .maybeSingle();
    expect(data?.password_set_at).toBeFalsy();
  });

  test("segundo link do canal também entra direto", async ({ page }) => {
    await page.goto(`/entrar?token=${await novoToken()}`);
    await expect(page).not.toHaveURL(/\/entrar/, { timeout: 30_000 });
    await expect(page).not.toHaveURL(/\/definir-password/);
    await expect(page).not.toHaveURL(/\/auth/);
  });
});
