import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Self-test do onboarding aberto do Telegram, executado contra a BD real.
// Só super_admin/support_admin — cria e apaga uma conta sintética.
export const runTelegramOnboardingSelfTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = ((data as any[]) ?? []).map((r) => r.role);
    if (!roles.includes("super_admin") && !roles.includes("support_admin")) {
      throw new Error("Forbidden: admin only");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runTelegramOnboardingE2E } = await import("./telegram-onboarding-e2e.server");
    return runTelegramOnboardingE2E(supabaseAdmin as any);
  });