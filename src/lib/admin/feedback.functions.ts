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
    const { data, error } = await supabaseAdmin
      .from("product_feedback")
      .select("id, user_id, kind, body, channel, status, internal_note, created_at, handled_at")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const ids = Array.from(new Set(rows.map((r: any) => r.user_id)));
    const names: Record<string, { name: string | null; email: string | null }> = {};
    if (ids.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, name, email")
        .in("id", ids);
      for (const p of (profs as any[]) ?? []) names[p.id] = { name: p.name, email: p.email };
    }
    return {
      items: rows.map((r: any) => ({
        ...r,
        consultant_name: names[r.user_id]?.name ?? null,
        consultant_email: names[r.user_id]?.email ?? null,
      })),
    };
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
