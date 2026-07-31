import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { auditAccess } from "./acessos.functions";
import { getEmailProvider, isEmailProviderConfigured } from "@/lib/email/provider";

// Estado do provider de email, para a UI dizer a verdade em vez de assumir
// que está sempre bloqueado.
export const getEmailProviderStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const provider = await getEmailProvider();
    return { configured: isEmailProviderConfigured(), provider: provider.name };
  });

type Role = "consultant" | "support_admin" | "super_admin";

async function getRoles(supabase: any, userId: string): Promise<Role[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r: any) => r.role as Role);
}
async function assertAdmin(supabase: any, userId: string) {
  const roles = await getRoles(supabase, userId);
  if (!roles.includes("super_admin") && !roles.includes("support_admin")) {
    throw new Error("Forbidden: admin only");
  }
}
async function assertSuperAdmin(supabase: any, userId: string) {
  const roles = await getRoles(supabase, userId);
  if (!roles.includes("super_admin")) throw new Error("Forbidden: super admin only");
}

export const SEGMENTS = [
  "all",
  "tier:base",
  "tier:consultor",
  "tier:pro",
  "tier:hub",
  "beta",
  "channel:whatsapp",
  "channel:telegram",
] as const;
export type Segment = (typeof SEGMENTS)[number];

const segmentSchema = z.enum(SEGMENTS);
const channelSchema = z.enum(["email", "dashboard", "whatsapp"]);

async function resolveSegment(supabaseAdmin: any, segment: Segment): Promise<string[]> {
  if (segment.startsWith("channel:")) {
    const ch = segment.split(":")[1];
    if (ch === "telegram") {
      const { data } = await supabaseAdmin.from("channel_links").select("user_id").eq("channel", "telegram");
      const ids = Array.from(new Set((data ?? []).map((r: any) => r.user_id))) as string[];
      if (!ids.length) return ids;
      // Regra de prioridade de canal: quem tem WhatsApp ligado recebe por lá.
      // Fica fora do segmento Telegram para não duplicar a mesma mensagem.
      const { data: waProfiles } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .in("id", ids)
        .eq("primary_channel", "whatsapp");
      const excluded = new Set(((waProfiles ?? []) as any[]).map((p) => p.id));
      return ids.filter((id) => !excluded.has(id));
    }
    const { data } = await supabaseAdmin.from("profiles").select("id").eq("whatsapp_link_status", "linked");
    return (data ?? []).map((r: any) => r.id);
  }
  let q = supabaseAdmin.from("profiles").select("id");
  if (segment === "beta") q = q.eq("is_beta_tester", true);
  if (segment.startsWith("tier:")) q = q.eq("subscription_tier", segment.split(":")[1]);
  const { data } = await q;
  return (data ?? []).map((r: any) => r.id);
}

export const countSegment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ segment: segmentSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ids = await resolveSegment(supabaseAdmin, data.segment);
    return { count: ids.length };
  });

export type BroadcastRow = {
  id: string;
  channel: string;
  segment: string;
  subject: string | null;
  body: string;
  recipients_count: number;
  status: string;
  created_at: string;
};

export const listBroadcasts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BroadcastRow[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("admin_broadcasts")
      .select("id, channel, segment, subject, body, recipients_count, status, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    return (data ?? []) as BroadcastRow[];
  });

// Envio real. Regras acordadas:
// - email: bloqueado até existir provider ligado (Resend/SendGrid/outro).
// - dashboard: cria um anúncio que o AppShell do consultor mostra.
// - whatsapp/telegram: bloqueado enquanto não houver template aprovado.
export const sendBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        channel: channelSchema,
        segment: segmentSchema,
        subject: z.string().trim().max(160).optional(),
        body: z.string().trim().min(3).max(4000),
        expires_at: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ids = await resolveSegment(supabaseAdmin, data.segment);

    if (data.channel === "email") {
      // Todo o envio de email passa sempre por esta interface — nunca por uma
      // API de provider hardcoded. Ver src/lib/email/provider.ts.
      const provider = await getEmailProvider();
      const { data: recipients } = await supabaseAdmin
        .from("profiles")
        .select("id, email")
        .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const emails = ((recipients ?? []) as { email: string | null }[])
        .map((r) => r.email)
        .filter((e): e is string => !!e);

      const subject = data.subject || data.body.split("\n")[0].slice(0, 120);
      let sent = 0;
      let lastError: string | undefined;
      for (const to of emails) {
        const res = await provider.send({ to, subject, body: data.body });
        if (res.success) sent += 1;
        else lastError = res.error ?? "envio falhou";
      }

      // Com provider ligado, o histórico grava o resultado real do envio.
      // "bloqueado_sem_provider" fica reservado para o caso de não haver chave.
      const noProvider = provider.name === "null";
      const failedAll = sent === 0 && emails.length > 0;
      const status = noProvider
        ? "bloqueado_sem_provider"
        : sent === 0
          ? "falhou"
          : sent < emails.length
            ? "enviado_parcial"
            : "sent";
      const blocked = noProvider || failedAll || emails.length === 0;
      await supabaseAdmin.from("admin_broadcasts").insert({
        channel: "email",
        segment: data.segment,
        subject: data.subject || null,
        body: data.body,
        recipients_count: emails.length || ids.length,
        status,
        created_by: context.userId,
      } as never);

      await auditAccess(context.userId, "broadcast.email", {
        resource_type: "admin_broadcast",
        before: null,
        after: {
          segment: data.segment,
          recipients: ids.length,
          provider: provider.name,
          status,
          sent,
          error: lastError ?? null,
        },
      });

      return {
        ok: sent > 0,
        blocked: noProvider,
        recipients: emails.length || ids.length,
        sent,
        error:
          sent === emails.length && sent > 0
            ? undefined
            : (lastError ?? (emails.length === 0 ? "nenhum destinatário com email" : "provider não configurado")),
      };
    }
    if (data.channel === "whatsapp") {
      throw new Error(
        "Sem templates aprovados na Meta. Fora da janela de 24h não é possível enviar texto livre — nada foi enviado.",
      );
    }

    const title = (data.subject || data.body.split("\n")[0]).slice(0, 120);
    const { error } = await supabaseAdmin.from("dashboard_announcements").insert({
      title,
      body: data.body,
      segment: data.segment,
      expires_at: data.expires_at || null,
      created_by: context.userId,
    } as never);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("admin_broadcasts").insert({
      channel: "dashboard",
      segment: data.segment,
      subject: data.subject || null,
      body: data.body,
      recipients_count: ids.length,
      status: "sent",
      created_by: context.userId,
    } as never);

    await auditAccess(context.userId, "broadcast.sent", {
      resource_type: "dashboard_announcement",
      before: null,
      after: { segment: data.segment, recipients: ids.length, title },
    });
    return { ok: true, blocked: false, recipients: ids.length };
  });

// Anúncios ativos relevantes para o consultor autenticado.
export const getMyAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("subscription_tier, is_beta_tester, whatsapp_link_status")
      .eq("id", context.userId)
      .maybeSingle();
    const p = (profile ?? {}) as any;
    const { data } = await context.supabase
      .from("dashboard_announcements")
      .select("id, title, body, segment, created_at")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(10);
    const rows = (data ?? []) as { id: string; title: string; body: string; segment: string; created_at: string }[];
    return rows.filter((a) => {
      if (a.segment === "all") return true;
      if (a.segment === "beta") return !!p.is_beta_tester;
      if (a.segment.startsWith("tier:")) return p.subscription_tier === a.segment.split(":")[1];
      if (a.segment === "channel:whatsapp") return p.whatsapp_link_status === "linked";
      return false;
    });
  });