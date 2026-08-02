import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Conversão manual do período experimental (o Stripe ainda não está ligado):
// o admin confirma que o pagamento foi feito e o trial deixa de expirar.
export const confirmTrialPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { target_user_id: string }) =>
    z.object({ target_user_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const list = ((roles as any[]) ?? []).map((r) => r.role);
    if (!list.includes("super_admin")) throw new Error("Forbidden: super admin only");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { markTrialConverted } = await import("./trial.server");
    const r = await markTrialConverted(
      supabaseAdmin,
      data.target_user_id,
      "Pagamento confirmado manualmente no admin.",
    );
    if (!r.converted) throw new Error("Esta conta não tem período experimental a decorrer.");
    return { ok: true };
  });