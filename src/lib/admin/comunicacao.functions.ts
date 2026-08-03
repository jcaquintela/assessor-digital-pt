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

// ---------------------------------------------------------------------------
// Público-alvo: quem é, se é conta de teste, e se está ativo.
//
// Nada disto é cosmético — é o que impede um envio em massa para 200 contas
// de CI ou para gente que nunca mais abriu o Assessor.
// ---------------------------------------------------------------------------

export type RecipientKind = "real" | "teste" | "shadow" | "demo";

export type RecipientRow = {
  userId: string;
  name: string | null;
  email: string | null;
  kind: RecipientKind;
  active: boolean;
  lastActivity: string | null;
};

function classifyKind(p: { email: string | null; account_kind: string | null }): RecipientKind {
  const email = String(p.email ?? "").toLowerCase();
  if (email.includes("shadow.assessor.local")) return "shadow";
  if (email.startsWith("ci-") || email.includes("@test.assessor.local")) return "teste";
  if (p.account_kind === "demo") return "demo";
  return "real";
}

/**
 * Contas que nunca devem entrar num envio real sem opção explícita.
 * `demo` fica de fora desta regra: são contas de pessoas reais com dados de
 * demonstração, não contas de CI.
 */
export function isTestAccount(kind: RecipientKind) {
  return kind === "teste" || kind === "shadow";
}

const ACTIVE_WINDOW_DAYS = 30;

async function resolveRecipients(supabaseAdmin: any, segment: Segment): Promise<RecipientRow[]> {
  const ids = await resolveSegment(supabaseAdmin, segment);
  if (!ids.length) return [];

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, name, email, account_kind")
    .in("id", ids);

  const since = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 864e5).toISOString();
  const { data: recent } = await supabaseAdmin
    .from("assessor_messages")
    .select("user_id, created_at")
    .in("user_id", ids)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5000);

  const lastByUser = new Map<string, string>();
  for (const r of ((recent ?? []) as any[])) {
    if (r.user_id && !lastByUser.has(r.user_id)) lastByUser.set(r.user_id, r.created_at);
  }

  return ((profiles ?? []) as any[]).map((p) => ({
    userId: p.id as string,
    name: (p.name ?? null) as string | null,
    email: (p.email ?? null) as string | null,
    kind: classifyKind(p),
    active: lastByUser.has(p.id),
    lastActivity: lastByUser.get(p.id) ?? null,
  }));
}

/**
 * Pré-visualização completa antes de enviar: quem recebe, quem fica de fora e
 * porquê. Contas de teste/CI ficam excluídas por defeito.
 */
export const previewBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        segment: segmentSchema,
        channel: channelSchema,
        includeTestAccounts: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const all = await resolveRecipients(supabaseAdmin, data.segment);

    const testAccounts = all.filter((r) => isTestAccount(r.kind));
    const pool = data.includeTestAccounts ? all : all.filter((r) => !isTestAccount(r.kind));
    // No email, quem não tem endereço não é destinatário — é exclusão, não falha.
    const noEmail = data.channel === "email" ? pool.filter((r) => !r.email) : [];
    const final = data.channel === "email" ? pool.filter((r) => !!r.email) : pool;

    return {
      segmentTotal: all.length,
      excludedTest: data.includeTestAccounts ? 0 : testAccounts.length,
      excludedNoEmail: noEmail.length,
      finalCount: final.length,
      activeCount: final.filter((r) => r.active).length,
      inactiveCount: final.filter((r) => !r.active).length,
      activeWindowDays: ACTIVE_WINDOW_DAYS,
      recipients: final.slice(0, 200),
      truncated: final.length > 200,
    };
  });

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
        includeTestAccounts: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const all = await resolveRecipients(supabaseAdmin, data.segment);
    const pool = data.includeTestAccounts ? all : all.filter((r) => !isTestAccount(r.kind));
    const ids = pool.map((r) => r.userId);

    if (data.channel === "email") {
      // Todo o envio de email passa sempre por esta interface — nunca por uma
      // API de provider hardcoded. Ver src/lib/email/provider.ts.
      const provider = await getEmailProvider();
      const targets = pool.filter((r) => !!r.email);
      const subject = data.subject || data.body.split("\n")[0].slice(0, 120);
      const noProvider = provider.name === "null";

      const results: { userId: string; email: string; ok: boolean; error?: string }[] = [];
      for (const r of targets) {
        if (noProvider) {
          results.push({ userId: r.userId, email: r.email!, ok: false, error: "provider não configurado" });
          continue;
        }
        const res = await provider.send({ to: r.email!, subject, body: data.body });
        results.push({
          userId: r.userId,
          email: r.email!,
          ok: res.success,
          ...(res.success ? {} : { error: res.error ?? "envio falhou" }),
        });
      }
      const sent = results.filter((r) => r.ok).length;
      const lastError = results.find((r) => !r.ok)?.error;

      const status = noProvider
        ? "bloqueado_sem_provider"
        : targets.length === 0
          ? "sem_destinatarios"
          : sent === 0
            ? "falhou"
            : sent < targets.length
              ? "enviado_parcial"
              : "sent";
      const { data: inserted } = await supabaseAdmin
        .from("admin_broadcasts")
        .insert({
          channel: "email",
          segment: data.segment,
          subject: data.subject || null,
          body: data.body,
          recipients_count: targets.length,
          status,
          created_by: context.userId,
        } as never)
        .select("id")
        .maybeSingle();
      const broadcastId = (inserted as any)?.id as string | undefined;
      if (broadcastId && results.length) {
        await supabaseAdmin.from("admin_broadcast_recipients").insert(
          results.map((r) => ({
            broadcast_id: broadcastId,
            user_id: r.userId,
            email: r.email,
            status: r.ok ? "entregue" : "falhou",
            error: r.error ?? null,
          })) as never,
        );
      }

      await auditAccess(context.userId, "broadcast.email", {
        resource_type: "admin_broadcast",
        before: null,
        after: {
          segment: data.segment,
          recipients: targets.length,
          include_test_accounts: data.includeTestAccounts,
          provider: provider.name,
          status,
          sent,
          error: lastError ?? null,
        },
      });

      return {
        ok: sent > 0,
        blocked: noProvider,
        broadcastId: broadcastId ?? null,
        recipients: targets.length,
        sent,
        failed: targets.length - sent,
        error:
          sent === targets.length && sent > 0
            ? undefined
            : (lastError ?? (targets.length === 0 ? "nenhum destinatário com email" : "provider não configurado")),
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

    const { data: insertedDash } = await supabaseAdmin
      .from("admin_broadcasts")
      .insert({
        channel: "dashboard",
        segment: data.segment,
        subject: data.subject || null,
        body: data.body,
        recipients_count: ids.length,
        status: "sent",
        created_by: context.userId,
      } as never)
      .select("id")
      .maybeSingle();
    const dashId = (insertedDash as any)?.id as string | undefined;
    if (dashId && pool.length) {
      // O aviso de dashboard é publicado de uma vez: para cada consultor do
      // público-alvo fica registado que o aviso passou a estar disponível.
      await supabaseAdmin.from("admin_broadcast_recipients").insert(
        pool.map((r) => ({
          broadcast_id: dashId,
          user_id: r.userId,
          email: r.email,
          status: "entregue",
        })) as never,
      );
    }

    await auditAccess(context.userId, "broadcast.sent", {
      resource_type: "dashboard_announcement",
      before: null,
      after: { segment: data.segment, recipients: ids.length, include_test_accounts: data.includeTestAccounts, title },
    });
    return { ok: true, blocked: false, broadcastId: dashId ?? null, recipients: ids.length, sent: ids.length, failed: 0 };
  });

// Anúncios ativos relevantes para o consultor autenticado.
export type BroadcastRecipientRow = {
  id: string;
  user_id: string | null;
  email: string | null;
  status: string;
  error: string | null;
  attempted_at: string;
};

/** Estado real por destinatário de um envio. */
export const listBroadcastRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ broadcastId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<BroadcastRecipientRow[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("admin_broadcast_recipients")
      .select("id, user_id, email, status, error, attempted_at")
      .eq("broadcast_id", data.broadcastId)
      .order("status", { ascending: true })
      .limit(500);
    return (rows ?? []) as BroadcastRecipientRow[];
  });

/**
 * Repete o envio APENAS aos destinatários que falharam. Quem já recebeu não
 * volta a receber — as linhas com estado "entregue" nunca são tocadas.
 */
export const retryFailedRecipients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ broadcastId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: bc } = await supabaseAdmin
      .from("admin_broadcasts")
      .select("id, channel, subject, body, segment")
      .eq("id", data.broadcastId)
      .maybeSingle();
    if (!bc) throw new Error("Envio não encontrado.");
    const broadcast = bc as any;
    if (broadcast.channel !== "email") throw new Error("Só envios por email podem ser repetidos.");

    const { data: failedRows } = await supabaseAdmin
      .from("admin_broadcast_recipients")
      .select("id, user_id, email")
      .eq("broadcast_id", data.broadcastId)
      .eq("status", "falhou");
    const failed = (failedRows ?? []) as { id: string; user_id: string | null; email: string | null }[];
    if (!failed.length) return { retried: 0, sent: 0, stillFailed: 0 };

    const provider = await getEmailProvider();
    if (provider.name === "null") throw new Error("Provider de email não ligado — nada foi reenviado.");
    const subject = broadcast.subject || String(broadcast.body).split("\n")[0].slice(0, 120);

    let sent = 0;
    for (const r of failed) {
      if (!r.email) continue;
      const res = await provider.send({ to: r.email, subject, body: broadcast.body });
      if (res.success) sent += 1;
      await supabaseAdmin
        .from("admin_broadcast_recipients")
        .update({
          status: res.success ? "entregue" : "falhou",
          error: res.success ? null : (res.error ?? "envio falhou"),
          attempted_at: new Date().toISOString(),
        } as never)
        .eq("id", r.id);
    }

    const { count: remaining } = await supabaseAdmin
      .from("admin_broadcast_recipients")
      .select("id", { count: "exact", head: true })
      .eq("broadcast_id", data.broadcastId)
      .eq("status", "falhou");
    const stillFailed = remaining ?? 0;

    await supabaseAdmin
      .from("admin_broadcasts")
      .update({ status: stillFailed === 0 ? "sent" : "enviado_parcial" } as never)
      .eq("id", data.broadcastId);

    await auditAccess(context.userId, "broadcast.retry", {
      resource_type: "admin_broadcast",
      before: null,
      after: { broadcast_id: data.broadcastId, retried: failed.length, sent, still_failed: stillFailed },
    });

    return { retried: failed.length, sent, stillFailed };
  });

export const getMyAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("subscription_tier, is_beta_tester, whatsapp_link_status")
      .eq("id", context.userId)
      .maybeSingle();
    const p = (profile ?? {}) as any;
    const now = new Date().toISOString();
    const { data } = await context.supabase
      .from("dashboard_announcements")
      .select("id, title, body, segment, created_at, expires_at")
      .eq("active", true)
      // Um aviso com data de fim deixa de aparecer sozinho quando essa hora passa.
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order("created_at", { ascending: false })
      .limit(10);
    const rows = (data ?? []) as {
      id: string; title: string; body: string; segment: string; created_at: string; expires_at: string | null;
    }[];

    // "Fechar" fica gravado por consultor — não volta a aparecer noutra visita
    // nem noutro dispositivo.
    const { data: dismissedRows } = await context.supabase
      .from("announcement_dismissals")
      .select("announcement_id")
      .eq("user_id", context.userId);
    const dismissed = new Set(((dismissedRows ?? []) as any[]).map((r) => r.announcement_id as string));

    return rows.filter((a) => {
      if (dismissed.has(a.id)) return false;
      if (a.segment === "all") return true;
      if (a.segment === "beta") return !!p.is_beta_tester;
      if (a.segment.startsWith("tier:")) return p.subscription_tier === a.segment.split(":")[1];
      if (a.segment === "channel:whatsapp") return p.whatsapp_link_status === "linked";
      return false;
    });
  });

/** Guarda que este consultor fechou o aviso — para sempre, não só nesta sessão. */
export const dismissAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ announcementId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("announcement_dismissals")
      .upsert(
        { user_id: context.userId, announcement_id: data.announcementId } as never,
        { onConflict: "user_id,announcement_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });