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
