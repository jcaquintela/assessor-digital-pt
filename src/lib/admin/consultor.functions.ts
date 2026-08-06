import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Role = "consultant" | "support_admin" | "super_admin";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles: Role[] = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("super_admin") && !roles.includes("support_admin")) {
    throw new Error("Forbidden: admin only");
  }
  return roles;
}

export type ConsultantDetail = {
  profile: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    tier: string;
    createdAt: string;
    accountKind: string | null;
    channels: string[];
    isBeta: boolean;
    betaExpiresAt: string | null;
    betaDaysLeft: number | null;
    assessorName: string | null;
    trialStatus: string | null;
    trialTier: string | null;
    trialExpiresAt: string | null;
    trialDaysLeft: number | null;
  };
  activity: {
    messages30d: number;
    lastContactAt: string | null;
    topChannel: string | null;
    byChannel: { channel: string; count: number }[];
  };
  volume: { people: number; properties: number; openDeals: number; pendingFollowUps: number };
  quality: { ats: number | null; aqs: number | null; samples: number };
  cost: {
    days: number;
    aiCredits: number;
    aiCalls: number;
    byModality: { modality: string; calls: number; credits: number; inputTokens: number; outputTokens: number }[];
    whatsappEur: number;
    creditPriceEur: number | null;
    aiCostEur: number | null;
    totalCostEur: number | null;
    planPriceEur: number | null;
    marginEur: number | null;
  };
  audit: {
    id: string;
    action: string;
    createdAt: string;
    reason: string | null;
    resource: string | null;
  }[];
};

export const getConsultantDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<ConsultantDetail> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const id = data.userId;
    const since30d = new Date(Date.now() - 30 * 864e5).toISOString();

    const [prof, links, msgs, people, props, deals, fups, trust, qual, audit] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, name, email, phone, subscription_tier, created_at, account_kind, is_beta_tester, beta_expires_at, assessor_name, trial_status, trial_tier, trial_expires_at")
        .eq("id", id)
        .maybeSingle(),
      supabaseAdmin.from("channel_links").select("channel").eq("user_id", id),
      // Só metadados das mensagens: nunca o conteúdo (mesma privacidade de Qualidade).
      supabaseAdmin.from("assessor_messages").select("channel, created_at").eq("user_id", id).gte("created_at", since30d),
      supabaseAdmin.from("people").select("id", { count: "exact", head: true }).eq("user_id", id),
      supabaseAdmin.from("properties").select("id", { count: "exact", head: true }).eq("user_id", id),
      supabaseAdmin.from("opportunities").select("id", { count: "exact", head: true }).eq("user_id", id).is("archived_at", null).neq("stage", "concluido"),
      supabaseAdmin.from("follow_ups").select("id", { count: "exact", head: true }).eq("user_id", id).eq("status", "pending"),
      supabaseAdmin.from("assistant_trust_scores").select("ats, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(200),
      supabaseAdmin.from("assessor_quality_scores").select("score").eq("user_id", id).order("created_at", { ascending: false }).limit(200),
      supabaseAdmin
        .from("admin_audit_logs")
        .select("id, action, created_at, reason, resource_type, resource_id")
        .eq("target_user_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const p = (prof.data ?? null) as any;
    if (!p) throw new Error("Conta não encontrada.");

    // Custo atribuível (run usage): IA + WhatsApp. Build usage fica de fora.
    const { aiCostsByUser, whatsappCostByUser, creditPriceEur, planPricesByTier } = await import(
      "@/lib/admin/ai-costs.server"
    );
    const [aiMap, waMap, price, planPrices] = await Promise.all([
      aiCostsByUser(supabaseAdmin, [id], 30),
      whatsappCostByUser(supabaseAdmin, [id], 30),
      creditPriceEur(supabaseAdmin),
      planPricesByTier(supabaseAdmin),
    ]);
    const ai = aiMap.get(id) ?? { credits: 0, calls: 0, byModality: [] };
    const whatsappEur = waMap.get(id) ?? 0;
    const aiCostEur = price != null ? ai.credits * price : null;
    const totalCostEur = aiCostEur != null ? aiCostEur + whatsappEur : null;
    const planPriceEur = planPrices.get(p.subscription_tier ?? "base") ?? null;
    const marginEur =
      totalCostEur != null && planPriceEur != null ? planPriceEur - totalCostEur : null;

    const msgRows = ((msgs.data ?? []) as any[]);
    const byChannelMap = new Map<string, number>();
    for (const m of msgRows) byChannelMap.set(m.channel ?? "—", (byChannelMap.get(m.channel ?? "—") ?? 0) + 1);
    const byChannel = [...byChannelMap.entries()]
      .map(([channel, count]) => ({ channel, count }))
      .sort((a, b) => b.count - a.count);
    const lastContactAt = msgRows.length
      ? msgRows.map((m) => m.created_at).sort().at(-1) ?? null
      : null;

    const atsRows = ((trust.data ?? []) as any[]).map((r) => Number(r.ats)).filter((n) => Number.isFinite(n));
    const aqsRows = ((qual.data ?? []) as any[]).map((r) => Number(r.score)).filter((n) => Number.isFinite(n));
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

    const betaDaysLeft = p.is_beta_tester && p.beta_expires_at
      ? Math.max(0, Math.ceil((new Date(p.beta_expires_at).getTime() - Date.now()) / 864e5))
      : null;

    return {
      profile: {
        id: p.id,
        name: p.name ?? null,
        email: p.email ?? null,
        phone: p.phone ?? null,
        tier: p.subscription_tier ?? "base",
        createdAt: p.created_at,
        accountKind: p.account_kind ?? null,
        channels: [...new Set(((links.data ?? []) as any[]).map((l) => l.channel))],
        isBeta: !!p.is_beta_tester,
        betaExpiresAt: p.beta_expires_at ?? null,
        betaDaysLeft,
        assessorName: p.assessor_name ?? null,
        trialStatus: p.trial_status ?? null,
        trialTier: p.trial_tier ?? null,
        trialExpiresAt: p.trial_expires_at ?? null,
        trialDaysLeft:
          p.trial_status === "active" && p.trial_expires_at
            ? Math.max(0, Math.ceil((new Date(p.trial_expires_at).getTime() - Date.now()) / 864e5))
            : null,
      },
      activity: {
        messages30d: msgRows.length,
        lastContactAt,
        topChannel: byChannel[0]?.channel ?? null,
        byChannel,
      },
      volume: {
        people: people.count ?? 0,
        properties: props.count ?? 0,
        openDeals: deals.count ?? 0,
        pendingFollowUps: fups.count ?? 0,
      },
      quality: {
        ats: avg(atsRows),
        aqs: avg(aqsRows),
        samples: atsRows.length + aqsRows.length,
      },
      cost: {
        days: 30,
        aiCredits: ai.credits,
        aiCalls: ai.calls,
        byModality: ai.byModality,
        whatsappEur,
        creditPriceEur: price,
        aiCostEur,
        totalCostEur,
        planPriceEur,
        marginEur,
      },
      audit: ((audit.data ?? []) as any[]).map((a) => ({
        id: a.id,
        action: a.action,
        createdAt: a.created_at,
        reason: a.reason ?? null,
        resource: a.resource_type ? `${a.resource_type}${a.resource_id ? ":" + a.resource_id : ""}` : null,
      })),
    };
  });