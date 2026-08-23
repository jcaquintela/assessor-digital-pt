// Utilização por rota durante o beta do redesenho v2.
//
// Só contagens de eventos de interface (`product_telemetry_events`): nunca
// conteúdo de mensagens nem dados pessoais. A coorte de cada consultor vem da
// feature flag `assessor.design.v2` — quem a tem activa conta como v2, os
// restantes como v1.

import { DESIGN_V2_FLAG_KEY } from "@/lib/design/design-v2.server";

export type Cohort = "v1" | "v2";

export interface RouteRow {
  rota: string;
  v1: { visits: number; users: number };
  v2: { visits: number; users: number };
}

export interface CohortTotals {
  users: number;
  visits: number;
  hojeViews: number;
  ctaClicks: number;
  /** Cliques no CTA por 100 aberturas do painel Hoje. */
  clickRate: number | null;
}

export interface RotasUsageReport {
  days: number;
  globalFlag: boolean;
  totals: Record<Cohort, CohortTotals>;
  routes: RouteRow[];
}

function emptyTotals(): CohortTotals {
  return { users: 0, visits: 0, hojeViews: 0, ctaClicks: 0, clickRate: null };
}

export async function rotasUsage(supabaseAdmin: any, days: number): Promise<RotasUsageReport> {
  const since = new Date(Date.now() - days * 864e5).toISOString();

  const [{ data: flag }, { data: flagUsers }, { data, error }] = await Promise.all([
    supabaseAdmin
      .from("feature_flags")
      .select("enabled_globally")
      .eq("key", DESIGN_V2_FLAG_KEY)
      .maybeSingle(),
    supabaseAdmin.from("feature_flag_users").select("user_id").eq("flag_key", DESIGN_V2_FLAG_KEY),
    supabaseAdmin
      .from("product_telemetry_events")
      .select("event, user_id, properties, occurred_at")
      .in("event", ["nav_rota", "hoje_visto", "hoje_cta_afonso"])
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: true })
      .limit(50000),
  ]);
  if (error) throw new Error(error.message);

  const globalFlag = !!flag?.enabled_globally;
  const v2Users = new Set<string>((flagUsers ?? []).map((r: any) => r.user_id));
  const cohortOf = (userId: string): Cohort =>
    globalFlag || v2Users.has(userId) ? "v2" : "v1";

  const rows: any[] = data ?? [];
  const totals: Record<Cohort, CohortTotals> = { v1: emptyTotals(), v2: emptyTotals() };
  const seenUsers: Record<Cohort, Set<string>> = { v1: new Set(), v2: new Set() };
  const routes = new Map<string, { v1: { visits: number; users: Set<string> }; v2: { visits: number; users: Set<string> } }>();

  for (const r of rows) {
    const userId = String(r.user_id ?? "");
    if (!userId) continue;
    const c = cohortOf(userId);
    seenUsers[c].add(userId);

    if (r.event === "hoje_visto") {
      totals[c].hojeViews += 1;
      continue;
    }
    if (r.event === "hoje_cta_afonso") {
      totals[c].ctaClicks += 1;
      continue;
    }
    // nav_rota
    const rota = String(r.properties?.rota ?? "desconhecida");
    totals[c].visits += 1;
    const bucket =
      routes.get(rota) ??
      { v1: { visits: 0, users: new Set<string>() }, v2: { visits: 0, users: new Set<string>() } };
    bucket[c].visits += 1;
    bucket[c].users.add(userId);
    routes.set(rota, bucket);
  }

  for (const c of ["v1", "v2"] as Cohort[]) {
    totals[c].users = seenUsers[c].size;
    totals[c].clickRate =
      totals[c].hojeViews > 0
        ? Math.round((totals[c].ctaClicks / totals[c].hojeViews) * 1000) / 10
        : null;
  }

  return {
    days,
    globalFlag,
    totals,
    routes: [...routes.entries()]
      .map(([rota, b]) => ({
        rota,
        v1: { visits: b.v1.visits, users: b.v1.users.size },
        v2: { visits: b.v2.visits, users: b.v2.users.size },
      }))
      .sort((a, b) => b.v1.visits + b.v2.visits - (a.v1.visits + a.v2.visits)),
  };
}
