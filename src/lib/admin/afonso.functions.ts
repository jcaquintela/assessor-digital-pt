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

const PAID_TIERS = ["consultor", "pro", "hub"];

// ---------------------------------------------------------------------------
// Faixa de saúde — fonte ÚNICA do estado dos sistemas.
// Nenhuma página deve recalcular isto por conta própria.
// ---------------------------------------------------------------------------
export type HealthLevel = "ok" | "warn" | "bad";
export type HealthItem = { key: string; label: string; level: HealthLevel; detail: string };

export const getSystemHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ items: HealthItem[]; checkedAt: string }> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since24h = new Date(Date.now() - 864e5).toISOString();

    const [flag, flagUsers, waMsgs, waFails, tgLinks, profilesPing] = await Promise.all([
      supabaseAdmin.from("feature_flags").select("enabled_globally").eq("key", "assessor.engine.v3").maybeSingle(),
      supabaseAdmin.from("feature_flag_users").select("user_id", { count: "exact", head: true }).eq("flag_key", "assessor.engine.v3"),
      supabaseAdmin.from("assessor_messages").select("id", { count: "exact", head: true }).eq("channel", "whatsapp").gte("created_at", since24h),
      supabaseAdmin.from("assessor_messages").select("id", { count: "exact", head: true }).eq("channel", "whatsapp").eq("status", "failed").gte("created_at", since24h),
      supabaseAdmin.from("channel_links").select("id", { count: "exact", head: true }).eq("channel", "telegram"),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
    ]);

    const v3Global = !!(flag.data as any)?.enabled_globally;
    const v3Users = flagUsers.count ?? 0;
    const engine: HealthItem = {
      key: "engine",
      label: "Motor v3",
      level: v3Global ? "ok" : v3Users > 0 ? "ok" : "warn",
      detail: v3Global ? "global" : v3Users > 0 ? `${v3Users} conta(s)` : "desligado",
    };

    const waConfigured =
      !!process.env.WHATSAPP_ACCESS_TOKEN &&
      !!process.env.WHATSAPP_PHONE_NUMBER_ID &&
      !!process.env.WHATSAPP_APP_SECRET &&
      !!process.env.WHATSAPP_VERIFY_TOKEN;
    const whatsapp: HealthItem = {
      key: "whatsapp",
      label: "WhatsApp",
      level: !waConfigured ? "bad" : (waFails.count ?? 0) > 0 ? "warn" : "ok",
      detail: !waConfigured
        ? "credenciais em falta"
        : `${waMsgs.count ?? 0} msgs/24h${(waFails.count ?? 0) > 0 ? ` · ${waFails.count} falhas` : ""}`,
    };

    const supabaseHealth: HealthItem = {
      key: "supabase",
      label: "Supabase",
      level: profilesPing.error ? "bad" : "ok",
      detail: profilesPing.error ? "sem resposta" : "a responder",
    };

    const tgKey = !!process.env.TELEGRAM_API_KEY;
    const telegram: HealthItem = {
      key: "telegram",
      label: "Telegram",
      level: !tgKey ? "bad" : (tgLinks.count ?? 0) > 0 ? "ok" : "warn",
      detail: !tgKey ? "sem token" : `${tgLinks.count ?? 0} conta(s) ligada(s)`,
    };

    return {
      items: [engine, whatsapp, supabaseHealth, telegram],
      checkedAt: new Date().toISOString(),
    };
  });

// ---------------------------------------------------------------------------
// Visão geral / Negócio
// ---------------------------------------------------------------------------
export const getAfonsoBusiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since24h = new Date(Date.now() - 864e5).toISOString();
    const since14d = new Date(Date.now() - 14 * 864e5).toISOString();

    const [profiles, tiers, beta, waMsgs24h, trust, inbox, tgLinks] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("profiles").select("subscription_tier, is_beta_tester, account_kind, email"),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).eq("is_beta_tester", true),
      supabaseAdmin.from("assessor_messages").select("id", { count: "exact", head: true }).eq("channel", "whatsapp").gte("created_at", since24h),
      supabaseAdmin.from("assistant_trust_scores").select("task_success").gte("created_at", since14d).limit(1000),
      supabaseAdmin.from("miscellaneous_items").select("id", { count: "exact", head: true }).eq("status", "inbox"),
      supabaseAdmin.from("channel_links").select("user_id").eq("channel", "telegram"),
    ]);

    const rows = ((tiers.data ?? []) as any[]);
    const byTier: Record<string, number> = {};
    for (const r of rows) {
      const t = r.subscription_tier ?? "base";
      byTier[t] = (byTier[t] ?? 0) + 1;
    }
    const paid = rows.filter((r) => PAID_TIERS.includes(r.subscription_tier) && !r.is_beta_tester).length;

    const tsRows = ((trust.data ?? []) as any[]).map((r) => r.task_success).filter((v) => typeof v === "number");
    const taskSuccess = tsRows.length ? tsRows.reduce((a, b) => a + b, 0) / tsRows.length : null;

    return {
      totalUsers: profiles.count ?? 0,
      usersBreakdown: {
        real: rows.filter((r) => r.account_kind !== "demo" && !String(r.email ?? "").includes("shadow.assessor.local") && !String(r.email ?? "").startsWith("ci-")).length,
        ci: rows.filter((r) => String(r.email ?? "").startsWith("ci-") || String(r.email ?? "").includes("@test.assessor.local")).length,
        shadow: rows.filter((r) => String(r.email ?? "").includes("shadow.assessor.local")).length,
      },
      paidSubscribers: paid,
      baseAccounts: byTier["base"] ?? 0,
      betaTesters: beta.count ?? 0,
      byTier,
      messages24h: waMsgs24h.count ?? 0,
      taskSuccess,
      taskSuccessSamples: tsRows.length,
      inboxErrors: inbox.count ?? 0,
      telegramAccounts: new Set(((tgLinks.data ?? []) as any[]).map((r) => r.user_id)).size,
    };
  });

// ---------------------------------------------------------------------------
// Aquisição
// ---------------------------------------------------------------------------
export const getAfonsoAcquisition = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since30d = new Date(Date.now() - 30 * 864e5).toISOString();
    const [tgLinks, rejected, converted, visits, baseAccounts, activeChannels, subEvents] = await Promise.all([
      supabaseAdmin.from("channel_links").select("user_id").eq("channel", "telegram"),
      // Tentativas de LIGAR- vindas de números sem conta associada.
      // ATENÇÃO: isto NÃO é um pedido de upgrade nem uma pessoa interessada em
      // pagar. É a contagem bruta de mensagens rejeitadas — o mesmo número pode
      // ter tentado várias vezes, e pode ser um erro de onboarding ou um teste.
      // Só passa a haver sinal comercial quando existirem eventos reais de funil
      // (landing → conta base → canal ativo → proposta vista → checkout → pago).
      supabaseAdmin
        .from("assessor_messages")
        .select("sender_phone, created_at")
        .eq("channel", "whatsapp")
        .eq("role", "user")
        .is("user_id", null)
        .ilike("content", "%LIGAR-%"),
      supabaseAdmin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .in("subscription_tier", PAID_TIERS)
        .eq("is_beta_tester", false),
      supabaseAdmin.from("landing_page_visits").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("channel_links").select("user_id"),
      // Eventos de subscrição separados (Trial→Consultor, Trial→Pro, …).
      supabaseAdmin.from("subscription_events").select("event, created_at"),
    ]);

    // Tentativas agregadas por número mascarado (nunca o número completo).
    const attempts = new Map<string, { count: number; last: string }>();
    for (const r of ((rejected.data ?? []) as any[])) {
      const phone: string = r.sender_phone ?? "desconhecido";
      const prev = attempts.get(phone);
      const last = r.created_at ?? "";
      attempts.set(phone, {
        count: (prev?.count ?? 0) + 1,
        last: !prev || last > prev.last ? last : prev.last,
      });
    }
    const maskPhone = (p: string) =>
      p === "desconhecido" || p.length < 5 ? "número desconhecido" : `${p.slice(0, 5)}••••${p.slice(-2)}`;

    // Contagem por tipo de evento: total e últimos 30 dias.
    const eventRows = ((subEvents.data ?? []) as any[]);
    const emptyCounts = {
      trial_started: 0,
      trial_to_consultor: 0,
      trial_to_pro: 0,
      trial_to_base: 0,
      base_to_paid: 0,
      paid_to_base: 0,
      churn: 0,
      reactivation: 0,
    };
    const subscriptionEvents = { ...emptyCounts };
    const subscriptionEvents30d = { ...emptyCounts };
    for (const r of eventRows) {
      const key = String(r.event) as keyof typeof emptyCounts;
      if (!(key in subscriptionEvents)) continue;
      subscriptionEvents[key] += 1;
      if (String(r.created_at ?? "") >= since30d) subscriptionEvents30d[key] += 1;
    }
    const trialsEnded =
      subscriptionEvents.trial_to_consultor + subscriptionEvents.trial_to_pro + subscriptionEvents.trial_to_base;
    const trialConversionRate = trialsEnded
      ? Math.round(
          ((subscriptionEvents.trial_to_consultor + subscriptionEvents.trial_to_pro) / trialsEnded) * 100,
        )
      : null;

    return {
      landingVisits: visits.count ?? 0,
      baseAccounts: baseAccounts.count ?? 0,
      activatedChannel: new Set(((activeChannels.data ?? []) as any[]).map((r) => r.user_id)).size,
      telegramStarts: new Set(((tgLinks.data ?? []) as any[]).map((r) => r.user_id)).size,
      unauthorizedWhatsappAttempts: (rejected.data ?? []).length,
      unauthorizedWhatsappNumbers: new Set(
        ((rejected.data ?? []) as any[]).map((r) => r.sender_phone).filter(Boolean),
      ).size,
      unauthorizedList: [...attempts.entries()]
        .map(([phone, v]) => ({ masked: maskPhone(phone), count: v.count, lastAt: v.last || null }))
        .sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""))
        .slice(0, 50),
      since30d,
      converted: converted.count ?? 0,
      subscriptionEvents,
      subscriptionEvents30d,
      trialConversionRate,
    };
  });

// ---------------------------------------------------------------------------
// Custos
// ---------------------------------------------------------------------------
export const getAfonsoCosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since24h = new Date(Date.now() - 864e5).toISOString();

    const since30d = new Date(Date.now() - 30 * 864e5).toISOString();
    const [waMsgs, files, aiCalls, tplSends] = await Promise.all([
      supabaseAdmin.from("assessor_messages").select("id", { count: "exact", head: true }).eq("channel", "whatsapp").gte("created_at", since24h),
      supabaseAdmin.from("uploaded_files").select("size_bytes"),
      supabaseAdmin.from("assessor_ai_logs").select("estimated_cost_usd, total_tokens").gte("created_at", since24h).limit(2000),
      supabaseAdmin
        .from("whatsapp_send_logs")
        .select("created_at, billable, cost_eur, template_name, outside_window")
        .not("template_name", "is", null)
        .gte("created_at", since30d)
        .limit(5000),
    ]);

    const storageBytes = ((files.data ?? []) as any[]).reduce((a, r) => a + Number(r.size_bytes ?? 0), 0);
    const aiRows = ((aiCalls.data ?? []) as any[]);
    const knownCost = aiRows.some((r) => typeof r.estimated_cost_usd === "number" && r.estimated_cost_usd > 0);

    // WhatsApp: só o que é mesmo faturável (template fora da janela de 24h).
    const tplRows = ((tplSends.data ?? []) as any[]);
    const billable = tplRows.filter((r) => r.billable === true);
    const priced = billable.filter((r) => typeof r.cost_eur === "number");
    const wa24h = billable.filter((r) => r.created_at >= since24h);

    return {
      // Custo real de IA: só o mostramos se o preço por token estiver confirmado.
      aiCost: knownCost ? aiRows.reduce((a, r) => a + Number(r.estimated_cost_usd ?? 0), 0) : null,
      aiCalls24h: aiRows.length,
      aiTokens24h: aiRows.reduce((a, r) => a + Number(r.total_tokens ?? 0), 0),
      storageBytes,
      whatsappMessages24h: waMsgs.count ?? 0,
      // Custo de templates fora das 24h — null quando falta tarifa registada.
      whatsappTemplateCost30d: priced.length ? priced.reduce((a, r) => a + Number(r.cost_eur), 0) : null,
      whatsappBillable30d: billable.length,
      whatsappBillable24h: wa24h.length,
      whatsappUnpriced30d: billable.length - priced.length,
    };
  });

// ---------------------------------------------------------------------------
// Planos & preços
// ---------------------------------------------------------------------------
export const listPlanConfigs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("plan_configs" as never).select("*");
    return ((data as any[]) ?? []) as {
      tier: string;
      price_month: number | null;
      status: string;
      pricing_mode: string;
      notes: string | null;
      updated_at: string;
    }[];
  });

export const savePlanConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        tier: z.enum(["base", "consultor", "pro", "hub"]),
        price_month: z.number().nullable().optional(),
        pricing_mode: z.enum(["paid", "invite_only", "free_beta", "on_request"]).optional(),
        status: z.enum(["draft", "published"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const roles = await assertAdmin(context.supabase, context.userId);
    if (!roles.includes("super_admin")) throw new Error("Forbidden: super admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: context.userId };
    if (data.price_month !== undefined) patch.price_month = data.price_month;
    if (data.pricing_mode) patch.pricing_mode = data.pricing_mode;
    if (data.status) patch.status = data.status;

    // Um plano publicado tem de dizer ao cliente quanto custa — ou dizer
    // claramente que não está à venda. Nunca publicar "pago" sem preço.
    if (data.status === "published") {
      const { data: current } = await supabaseAdmin
        .from("plan_configs" as never)
        .select("price_month, pricing_mode")
        .eq("tier", data.tier)
        .maybeSingle();
      const mode = (data.pricing_mode ?? (current as any)?.pricing_mode ?? "paid") as string;
      const price = data.price_month !== undefined ? data.price_month : ((current as any)?.price_month ?? null);
      if (mode === "paid" && price == null && data.tier !== "base") {
        throw new Error(
          'Este plano está marcado como pago e não tem preço. Define o preço, ou escolhe "Apenas por convite", "Beta gratuito" ou "Preço sob consulta" antes de publicar.',
        );
      }
    }
    const { error } = await supabaseAdmin.from("plan_configs" as never).update(patch as never).eq("tier", data.tier);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("admin_audit_logs").insert({
      admin_user_id: context.userId,
      action: "plan_config.update",
      resource_type: "plan_configs",
      resource_id: data.tier,
      metadata: patch as any,
    });
    return { ok: true };
  });
