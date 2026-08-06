// Vista interna: estado das entradas no painel (magic links) de um consultor.
// Só leitura — nunca devolve o token completo, apenas um prefixo para
// correspondência com logs de suporte.
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

export type LoginLinkRow = {
  tokenPrefix: string;
  channel: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  estado: "usado" | "expirado" | "ativo" | "substituido";
  motivo: string | null;
  emitidoPorEquipa: boolean;
};

export type LoginLinkConsultant = {
  id: string;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  betaTester: boolean;
  links: LoginLinkRow[];
  totalEmitidos: number;
  ultimoEmitido: string | null;
  reenvios: number;
};

export const listLoginLinkStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { query?: string; apenasBeta?: boolean }) =>
    z.object({ query: z.string().max(120).optional(), apenasBeta: z.boolean().optional() }).parse(d ?? {}),
  )
  .handler(async ({ context, data }): Promise<{ consultores: LoginLinkConsultant[] }> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let profilesQuery = supabaseAdmin
      .from("profiles")
      .select("id, name, email, phone, is_beta_tester")
      .limit(50);

    const q = (data.query ?? "").trim();
    if (q) {
      const like = `%${q.replace(/[%,]/g, "")}%`;
      profilesQuery = profilesQuery.or(`name.ilike.${like},email.ilike.${like},phone.ilike.${like}`);
    }
    if (data.apenasBeta) profilesQuery = profilesQuery.eq("is_beta_tester", true);

    const { data: profiles, error } = await profilesQuery;
    if (error) throw new Error(error.message);
    const ids = (profiles ?? []).map((p: any) => p.id);
    if (!ids.length) return { consultores: [] };

    const { data: tokens, error: tErr } = await supabaseAdmin
      .from("dashboard_login_tokens")
      .select("token, user_id, channel, created_at, expires_at, used_at, reason, issued_by")
      .in("user_id", ids)
      .order("created_at", { ascending: false })
      .limit(500);
    if (tErr) throw new Error(tErr.message);

    const now = Date.now();
    const consultores: LoginLinkConsultant[] = (profiles ?? []).map((p: any) => {
      const rows = (tokens ?? []).filter((t: any) => t.user_id === p.id);
      const links: LoginLinkRow[] = rows.map((t: any, i: number) => {
        const usado = !!t.used_at;
        const expirado = new Date(t.expires_at).getTime() < now;
        // Emitir um link novo invalida os anteriores por usar: marcamos esses
        // como "substituído" para o suporte perceber porque falharam.
        const substituido = usado && i > 0 && rows.some((o: any, j: number) => j < i && !o.used_at);
        return {
          tokenPrefix: String(t.token).slice(0, 10),
          channel: t.channel,
          createdAt: t.created_at,
          expiresAt: t.expires_at,
          usedAt: t.used_at,
          estado: usado ? (substituido ? "substituido" : "usado") : expirado ? "expirado" : "ativo",
          motivo: (t.reason as string | null) ?? null,
          emitidoPorEquipa: !!t.issued_by,
        };
      });
      return {
        id: p.id,
        nome: p.name ?? null,
        email: p.email ?? null,
        telefone: p.phone ?? null,
        betaTester: !!p.is_beta_tester,
        links,
        totalEmitidos: links.length,
        ultimoEmitido: links[0]?.createdAt ?? null,
        reenvios: Math.max(0, links.length - 1),
      };
    });

    consultores.sort((a, b) => (b.ultimoEmitido ?? "").localeCompare(a.ultimoEmitido ?? ""));
    return { consultores };
  });

/* -------------------- Reenvio manual pela equipa ------------------------- */

export type ResendLoginLinkResult =
  | { ok: true; canal: string; expiraEm: string }
  | { ok: false; erro: string };

export const resendLoginLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; canal?: "whatsapp" | "telegram"; motivo: string }) =>
    z
      .object({
        userId: z.string().uuid(),
        canal: z.enum(["whatsapp", "telegram"]).optional(),
        motivo: z.string().trim().min(3, "Indica o motivo do reenvio.").max(300),
      })
      .parse(d),
  )
  .handler(async ({ context, data }): Promise<ResendLoginLinkResult> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { LOGIN_TOKEN_TTL_MIN } = await import("@/lib/auth/dashboard-login.server");

    // Canal: o pedido manda um, senão usamos o último usado e por fim WhatsApp.
    let canal = data.canal ?? null;
    if (!canal) {
      const { data: last } = await supabaseAdmin
        .from("dashboard_login_tokens")
        .select("channel")
        .eq("user_id", data.userId)
        .order("created_at", { ascending: false })
        .limit(1);
      const prev = (last as { channel: string }[] | null)?.[0]?.channel;
      canal = prev === "telegram" ? "telegram" : "whatsapp";
    }

    const { data: link } = await supabaseAdmin
      .from("channel_links")
      .select("external_id")
      .eq("user_id", data.userId)
      .eq("channel", canal)
      .maybeSingle();
    const externalId = (link as { external_id?: string } | null)?.external_id;
    if (!externalId) {
      return { ok: false, erro: `Este consultor não tem ${canal} ligado à conta.` };
    }

    // Reenviar é reenviar o convite inteiro: link, número do Afonso e código.
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("name")
      .eq("id", data.userId)
      .maybeSingle();
    const { buildInviteMessage } = await import("@/lib/admin/invite-message.server");
    const convite = await buildInviteMessage(supabaseAdmin, {
      userId: data.userId,
      canal,
      nome: (prof as { name?: string | null } | null)?.name ?? null,
      phone: canal === "whatsapp" ? externalId : null,
      reason: data.motivo,
      issuedBy: context.userId,
    });
    const expiresAt = new Date(Date.now() + LOGIN_TOKEN_TTL_MIN * 60_000).toISOString();

    const { sendReplyForChannel } = await import("@/lib/assessor/channels.server");
    await sendReplyForChannel(canal as any, externalId, convite.texto);

    await supabaseAdmin.from("admin_audit_logs").insert({
      admin_user_id: context.userId,
      action: "login_link.resent",
      target_user_id: data.userId,
      resource_type: "dashboard_login_token",
      resource_id: data.userId,
      reason: data.motivo,
      metadata: { channel: canal, expires_at: expiresAt },
    });

    return { ok: true, canal, expiraEm: expiresAt };
  });
