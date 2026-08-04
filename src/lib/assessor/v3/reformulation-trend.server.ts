// Comparativo de tendência da métrica de reformulação: critério antigo
// (só tempo: nova mensagem a menos de 60 s da anterior) vs critério novo
// (repetição/correção genuína), sobre exactamente os mesmos turnos e a
// mesma janela de 14 dias usada no resto de Qualidade.

export interface TrendRow {
  created_at: string;
  user_id: string | null;
  channel: string | null;
  reformulated: boolean | null;
}

export interface TrendDay {
  day: string;
  n: number;
  legacy: number;
  current: number;
}

export interface ReformulationTrend {
  total: number;
  legacyTotal: number;
  currentTotal: number;
  legacyRate: number | null;
  currentRate: number | null;
  daily: TrendDay[];
}

/**
 * Critério antigo, reconstruído: um turno contava como reformulação sempre
 * que o turno anterior do MESMO consultor e canal tinha menos de 60 s.
 */
export function computeReformulationTrend(rows: TrendRow[]): ReformulationTrend {
  const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const lastByKey = new Map<string, number>();
  const byDay = new Map<string, TrendDay>();

  for (const r of sorted) {
    const day = r.created_at.slice(0, 10);
    const bucket = byDay.get(day) ?? { day, n: 0, legacy: 0, current: 0 };
    bucket.n += 1;

    const key = `${r.user_id ?? "?"}|${r.channel ?? "?"}`;
    const ts = new Date(r.created_at).getTime();
    const prev = lastByKey.get(key);
    if (prev != null && ts - prev < 60_000) bucket.legacy += 1;
    lastByKey.set(key, ts);

    if (r.reformulated) bucket.current += 1;
    byDay.set(day, bucket);
  }

  const daily = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
  const total = sorted.length;
  const legacyTotal = daily.reduce((a, d) => a + d.legacy, 0);
  const currentTotal = daily.reduce((a, d) => a + d.current, 0);

  return {
    total,
    legacyTotal,
    currentTotal,
    legacyRate: total ? Number((legacyTotal / total).toFixed(4)) : null,
    currentRate: total ? Number((currentTotal / total).toFixed(4)) : null,
    daily,
  };
}
