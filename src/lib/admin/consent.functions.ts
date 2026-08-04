import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data as any[]) ?? []).map((r) => r.role);
  if (!roles.includes("super_admin") && !roles.includes("support_admin")) {
    throw new Error("Forbidden: admin only");
  }
}

/** Admin pede acesso ao conteúdo de uma conversa concreta. Sem isto, não vê. */
export const requestContentAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        targetUserId: z.string().uuid(),
        resourceId: z.string().min(1),
        reason: z.string().min(10, "Explica em uma frase porque precisas de ver esta conversa."),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("content_access_consents")
      .insert({
        user_id: data.targetUserId,
        requested_by: context.userId,
        scope: "conversation",
        resource_id: data.resourceId,
        reason: data.reason,
        status: "pending",
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("admin_audit_logs").insert({
      admin_user_id: context.userId,
      action: "content.access_requested",
      target_user_id: data.targetUserId,
      resource_type: "assessor_reasoning_traces",
      resource_id: data.resourceId,
      reason: data.reason,
    } as never);
    return { ok: true, id: (row as any).id };
  });

/** Pedidos abertos, para o admin acompanhar o estado. */
export const listContentAccessRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("content_access_consents")
      .select("id, user_id, resource_id, reason, status, expires_at, created_at, scope")
      .order("created_at", { ascending: false })
      .limit(50);
    return ((data as any[]) ?? []) as {
      id: string;
      user_id: string;
      resource_id: string | null;
      reason: string;
      status: string;
      expires_at: string | null;
      created_at: string;
      scope: string;
    }[];
  });

/** O consultor (e só ele) aprova ou recusa. RLS garante o resto. */
export const decideContentAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), decision: z.enum(["approved", "denied", "revoked"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("content_access_consents")
      .update({ status: data.decision, decided_at: new Date().toISOString() } as never)
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    // Cada decisão do consultor fica registada: autorizar, recusar, retirar.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { auditConsentDecision } = await import("./consent.server");
    await auditConsentDecision(supabaseAdmin, {
      consentId: data.id,
      targetUserId: context.userId,
      decision: data.decision,
    });
    return { ok: true };
  });

/** Pedidos dirigidos ao consultor autenticado (para decidir na sua área). */
export const listMyConsentRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("content_access_consents")
      .select("id, reason, status, resource_id, expires_at, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(20);
    return ((data as any[]) ?? []);
  });
