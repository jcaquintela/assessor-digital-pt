import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Modo suporte: o admin abre a app tal como o consultor a vê, para corrigir dados
// em nome dele. Nunca dá acesso a credenciais, pagamentos ou tokens do utilizador —
// só ao mesmo âmbito de dados que o próprio consultor já tem.

async function roles(supabase: any, userId: string): Promise<string[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r: any) => r.role as string);
}

export type StartSupportSessionResult = {
  session_id: string;
  token_hash: string;
  target_name: string;
  target_user_id: string;
};

export const startSupportSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        target_user_id: z.string().uuid(),
        reason: z.string().trim().min(3, "Indica o motivo do apoio.").max(300),
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<StartSupportSessionResult> => {
    const mine = await roles(context.supabase, context.userId);
    if (!mine.includes("super_admin")) throw new Error("Forbidden: super admin only");
    if (data.target_user_id === context.userId) throw new Error("Já estás na tua própria conta.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: targetRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.target_user_id);
    if ((targetRoles ?? []).some((r: any) => r.role === "super_admin")) {
      throw new Error("Não é possível entrar na conta de outro super admin.");
    }

    const { data: userRes, error: userErr } = await supabaseAdmin.auth.admin.getUserById(
      data.target_user_id,
    );
    const email = userRes?.user?.email;
    if (userErr || !email) throw new Error("Este utilizador não tem email associado.");

    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("name")
      .eq("id", data.target_user_id)
      .maybeSingle();

    const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    const tokenHash = (link as any)?.properties?.hashed_token as string | undefined;
    if (linkErr || !tokenHash) throw new Error("Não foi possível abrir a sessão de suporte.");

    const { data: sess, error: sessErr } = await supabaseAdmin
      .from("support_sessions")
      .insert({
        admin_user_id: context.userId,
        target_user_id: data.target_user_id,
        reason: data.reason,
      } as never)
      .select("id")
      .single();
    if (sessErr || !sess) throw new Error("Não foi possível registar a sessão de suporte.");

    const sessionId = (sess as { id: string }).id;

    await supabaseAdmin.from("admin_audit_logs").insert({
      admin_user_id: context.userId,
      action: "support_session.start",
      target_user_id: data.target_user_id,
      resource_type: "support_session",
      resource_id: sessionId,
      reason: data.reason,
      metadata: { modo: "admin agiu em nome do utilizador" },
    } as never);

    return {
      session_id: sessionId,
      token_hash: tokenHash,
      target_name: ((prof as any)?.name as string | null) || email,
      target_user_id: data.target_user_id,
    };
  });

export const endSupportSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ session_id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("support_sessions")
      .select("id, admin_user_id, target_user_id, ended_at")
      .eq("id", data.session_id)
      .maybeSingle();
    const sess = row as
      | { id: string; admin_user_id: string; target_user_id: string; ended_at: string | null }
      | null;
    if (!sess) throw new Error("Sessão de suporte não encontrada.");
    if (sess.admin_user_id !== context.userId) throw new Error("Forbidden");
    if (sess.ended_at) return { ok: true };

    await supabaseAdmin
      .from("support_sessions")
      .update({ ended_at: new Date().toISOString() } as never)
      .eq("id", sess.id);

    await supabaseAdmin.from("admin_audit_logs").insert({
      admin_user_id: context.userId,
      action: "support_session.end",
      target_user_id: sess.target_user_id,
      resource_type: "support_session",
      resource_id: sess.id,
      metadata: {},
    } as never);

    return { ok: true };
  });

// Chamada já autenticada como o utilizador apoiado: só regista auditoria,
// nunca concede permissões extra. A linha fica sempre em nome do admin.
export const logSupportAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        session_id: z.string().uuid(),
        action: z.string().trim().min(1).max(200),
        route: z.string().trim().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("support_sessions")
      .select("id, admin_user_id, target_user_id, ended_at")
      .eq("id", data.session_id)
      .maybeSingle();
    const sess = row as
      | { id: string; admin_user_id: string; target_user_id: string; ended_at: string | null }
      | null;
    if (!sess || sess.ended_at) return { ok: false };
    if (sess.target_user_id !== context.userId) return { ok: false };

    await supabaseAdmin
      .from("support_sessions")
      .update({ last_seen_at: new Date().toISOString() } as never)
      .eq("id", sess.id);

    await supabaseAdmin.from("admin_audit_logs").insert({
      admin_user_id: sess.admin_user_id,
      action: `support.${data.action}`,
      target_user_id: sess.target_user_id,
      resource_type: "support_session",
      resource_id: sess.id,
      reason: "admin agiu em nome do utilizador",
      metadata: { rota: data.route ?? null },
    } as never);

    return { ok: true };
  });