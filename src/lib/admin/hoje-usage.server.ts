// Agregação da telemetria de interface do painel Hoje.
// Só contagens: nunca devolve conteúdo de mensagens nem dados pessoais.

export interface HojeUsageReport {
  days: number;
  views: number;
  clicks: number;
  viewers: number;
  clickers: number;
  /** Cliques por 100 aberturas do painel. */
  clickRate: number | null;
  bySurface: { surface: string; clicks: number; users: number }[];
  daily: { day: string; views: number; clicks: number }[];
}

export async function hojeUsage(supabaseAdmin: any, days: number): Promise<HojeUsageReport> {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const { data, error } = await supabaseAdmin
    .from("product_telemetry_events")
    .select("event, user_id, properties, occurred_at")
    .in("event", ["hoje_visto", "hoje_cta_afonso"])
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: true })
    .limit(50000);
  if (error) throw new Error(error.message);

  const rows: any[] = data ?? [];
  const viewers = new Set<string>();
  const clickers = new Set<string>();
  const surfaces = new Map<string, { clicks: number; users: Set<string> }>();
  const daily = new Map<string, { views: number; clicks: number }>();
  let views = 0;
  let clicks = 0;

  for (const r of rows) {
    const day = String(r.occurred_at).slice(0, 10);
    const bucket = daily.get(day) ?? { views: 0, clicks: 0 };
    if (r.event === "hoje_visto") {
      views += 1;
      bucket.views += 1;
      viewers.add(r.user_id);
    } else {
      clicks += 1;
      bucket.clicks += 1;
      clickers.add(r.user_id);
      const key = String(r.properties?.superficie ?? "desconhecida");
      const s = surfaces.get(key) ?? { clicks: 0, users: new Set<string>() };
      s.clicks += 1;
      s.users.add(r.user_id);
      surfaces.set(key, s);
    }
    daily.set(day, bucket);
  }

  return {
    days,
    views,
    clicks,
    viewers: viewers.size,
    clickers: clickers.size,
    clickRate: views > 0 ? Math.round((clicks / views) * 1000) / 10 : null,
    bySurface: [...surfaces.entries()]
      .map(([surface, s]) => ({ surface, clicks: s.clicks, users: s.users.size }))
      .sort((a, b) => b.clicks - a.clicks),
    daily: [...daily.entries()]
      .map(([day, v]) => ({ day, ...v }))
      .sort((a, b) => (a.day < b.day ? -1 : 1)),
  };
}
