// Relatório agregado de consumo por plano.
//
// Regras: tier efectivo (beta activo => hub), custo de IA calculado com as
// tarifas de `ai_model_rates` e euros só quando o preço do crédito está
// definido. WhatsApp não tem utilizador nos registos de envio, por isso o
// custo do canal entra como total da plataforma, nunca imputado a um plano.

import { normalizeTier, type SubscriptionTier } from "@/lib/subscription/tiers";
import { loadRates, creditPriceEur, planPricesByTier } from "./ai-costs.server";

export type PlanUsage = {
  tier: SubscriptionTier;
  users: number;
  activeUsers: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  credits: number;
  costEur: number | null;
  revenueEur: number | null;
  marginEur: number | null;
  creditsPerActiveUser: number;
};

export type WhatsappUsage = {
  messages: number;
  billable: number;
  costEur: number;
  unpriced: number;
};

export type UsageWindow = {
  plans: PlanUsage[];
  totals: {
    users: number;
    activeUsers: number;
    calls: number;
    credits: number;
    aiCostEur: number | null;
    revenueEur: number | null;
    marginEur: number | null;
  };
  whatsapp: WhatsappUsage;
};

export type UsageReport = {
  days: number;
  creditPriceEur: number | null;
  current: UsageWindow;
  previous: UsageWindow;
};

const DEFAULT_MODEL = "google/gemini-3.6-flash";
const FALLBACK_RATE = { input: 6, output: 30 };

function effectiveTier(p: any): SubscriptionTier {
  const betaActive =
    !!p.is_beta_tester && (!p.beta_expires_at || Date.parse(p.beta_expires_at) > Date.now());
  return betaActive ? "hub" : normalizeTier(p.subscription_tier);
}

async function pagedAiLogs(supabaseAdmin: any, since: string, until: string) {
  const rows: any[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("assessor_ai_logs")
      .select("user_id, billed_model, model, input_tokens, output_tokens")
      .gte("created_at", since)
      .lt("created_at", until)
      .range(from, from + pageSize - 1);
    if (error) break;
    const chunk = (data ?? []) as any[];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return rows;
}

async function buildWindow(
  supabaseAdmin: any,
  profiles: any[],
  since: string,
  until: string,
  rates: Map<string, { input: number; output: number }>,
  price: number | null,
  planPrices: Map<string, number | null>,
): Promise<UsageWindow> {
  const tierOf = new Map<string, SubscriptionTier>();
  for (const p of profiles) tierOf.set(p.id, effectiveTier(p));

  const buckets = new Map<SubscriptionTier, PlanUsage>();
  const active = new Map<SubscriptionTier, Set<string>>();
  const ensure = (t: SubscriptionTier) => {
    let b = buckets.get(t);
    if (!b) {
      b = {
        tier: t,
        users: 0,
        activeUsers: 0,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        credits: 0,
        costEur: null,
        revenueEur: null,
        marginEur: null,
        creditsPerActiveUser: 0,
      };
      buckets.set(t, b);
      active.set(t, new Set());
    }
    return b;
  };

  for (const t of ["base", "consultor", "pro", "hub"] as SubscriptionTier[]) ensure(t);
  for (const p of profiles) ensure(tierOf.get(p.id)!).users += 1;

  const logs = await pagedAiLogs(supabaseAdmin, since, until);
  for (const r of logs) {
    const uid = r.user_id as string | null;
    if (!uid) continue;
    const t = tierOf.get(uid);
    if (!t) continue;
    const b = ensure(t);
    const modelKey = r.billed_model ?? (r.model?.includes("/") ? r.model : DEFAULT_MODEL);
    const rate = rates.get(modelKey) ?? rates.get(DEFAULT_MODEL) ?? FALLBACK_RATE;
    const inTok = Number(r.input_tokens) || 0;
    const outTok = Number(r.output_tokens) || 0;
    b.calls += 1;
    b.inputTokens += inTok;
    b.outputTokens += outTok;
    b.credits += (inTok / 1e6) * rate.input + (outTok / 1e6) * rate.output;
    active.get(t)!.add(uid);
  }

  for (const b of buckets.values()) {
    b.activeUsers = active.get(b.tier)!.size;
    b.creditsPerActiveUser = b.activeUsers ? b.credits / b.activeUsers : 0;
    b.costEur = price == null ? null : b.credits * price;
    const planPrice = planPrices.get(b.tier);
    b.revenueEur = planPrice == null ? null : planPrice * b.users;
    b.marginEur = b.costEur == null || b.revenueEur == null ? null : b.revenueEur - b.costEur;
  }

  const { data: wa } = await supabaseAdmin
    .from("whatsapp_send_logs")
    .select("billable, cost_eur, cost_source")
    .gte("created_at", since)
    .lt("created_at", until);
  const waRows = (wa ?? []) as any[];
  const whatsapp: WhatsappUsage = {
    messages: waRows.length,
    billable: waRows.filter((r) => r.billable).length,
    costEur: waRows.reduce((s, r) => s + (Number(r.cost_eur) || 0), 0),
    unpriced: waRows.filter((r) => r.billable && !Number(r.cost_eur)).length,
  };

  const plans = [...buckets.values()].sort((a, b) => b.credits - a.credits);
  const sum = (f: (p: PlanUsage) => number) => plans.reduce((s, p) => s + f(p), 0);
  const anyRevenue = plans.some((p) => p.revenueEur != null);

  return {
    plans,
    totals: {
      users: sum((p) => p.users),
      activeUsers: sum((p) => p.activeUsers),
      calls: sum((p) => p.calls),
      credits: sum((p) => p.credits),
      aiCostEur: price == null ? null : sum((p) => p.costEur ?? 0),
      revenueEur: anyRevenue ? sum((p) => p.revenueEur ?? 0) : null,
      marginEur:
        price == null || !anyRevenue
          ? null
          : sum((p) => p.revenueEur ?? 0) - sum((p) => p.costEur ?? 0) - whatsapp.costEur,
    },
    whatsapp,
  };
}

/** Consumo agregado por plano na janela actual e na janela anterior (comparação). */
export async function usageByPlan(supabaseAdmin: any, days = 30): Promise<UsageReport> {
  const now = Date.now();
  const startCur = new Date(now - days * 864e5).toISOString();
  const startPrev = new Date(now - 2 * days * 864e5).toISOString();
  const nowIso = new Date(now).toISOString();

  const [{ data: profs }, rates, price, planPrices] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, subscription_tier, is_beta_tester, beta_expires_at, account_kind"),
    loadRates(supabaseAdmin),
    creditPriceEur(supabaseAdmin),
    planPricesByTier(supabaseAdmin),
  ]);
  const profiles = ((profs ?? []) as any[]).filter((p) => p.account_kind !== "merged");

  const [current, previous] = await Promise.all([
    buildWindow(supabaseAdmin, profiles, startCur, nowIso, rates, price, planPrices),
    buildWindow(supabaseAdmin, profiles, startPrev, startCur, rates, price, planPrices),
  ]);

  return { days, creditPriceEur: price, current, previous };
}
