import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

describe("confirmacoes", () => {
  it("2) telegram chat_id novo", async () => {
    const { runTelegramOnboardingE2E } = await import("@/lib/assessor/channel-gateway/telegram-onboarding-e2e.server");
    const r = await runTelegramOnboardingE2E(admin as any);
    console.log("TELEGRAM_E2E", JSON.stringify(r, null, 2));
  }, 60000);

  it("1) login link telegram-only", async () => {
    const email = `tg-${Date.now()}@shadow.assessor.local`;
    const { data: u, error: ue } = await admin.auth.admin.createUser({ email, email_confirm: true });
    expect(ue).toBeNull();
    const userId = u!.user!.id;
    try {
      const { issueDashboardLoginLink } = await import("@/lib/auth/dashboard-login.server");
      const link = await issueDashboardLoginLink(admin as any, userId, "telegram");
      console.log("LINK", link.url);
      const token = new URL(link.url).searchParams.get("token")!;
      const { redeemDashboardLoginToken } = await import("@/lib/auth/dashboard-login.server");
      const r = await redeemDashboardLoginToken(token);
      console.log("REDEEM", JSON.stringify(r).slice(0, 200));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const anon = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, {
        auth: { persistSession: false },
      });
      const { data: s, error: se } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: r.tokenHash });
      console.log("SESSION", se ? `ERRO ${se.message}` : `ok user=${s.user?.id} expires=${s.session?.expires_at}`);
      expect(se).toBeNull();
      expect(s.user?.id).toBe(userId);
      const again = await redeemDashboardLoginToken(token);
      console.log("REUSO", JSON.stringify(again));
      expect(again.ok).toBe(false);
    } finally {
      await admin.auth.admin.deleteUser(userId);
    }
  }, 60000);
});
