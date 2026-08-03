import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("super_admin") && !roles.includes("support_admin")) {
    throw new Error("Forbidden: admin only");
  }
}

export const listProductFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchProductFeedbackList } = await import("./feedback-list.server");
    return fetchProductFeedbackList(supabaseAdmin);
  });

export const updateProductFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status?: string; internalNote?: string }) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["novo", "em_analise", "resolvido", "arquivado"]).optional(),
        internalNote: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = { handled_by: context.userId, handled_at: new Date().toISOString() };
    if (data.status) patch['status'] = data.status;
    if (data.internalNote !== undefined) patch['internal_note'] = data.internalNote || null;
    const { error } = await supabaseAdmin.from("product_feedback").update(patch as never).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
