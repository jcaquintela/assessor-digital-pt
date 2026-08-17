// Factos de paragem de imóveis — mesma fonte da régua já usada em /hoje:
// última interação real ou seguimento fechado ligado ao imóvel; sem isso,
// conta desde a criação. Nunca prevê nada.

import type { StalledItem } from "@/lib/insights/factual";

/** Imóveis ainda a trabalhar (vendidos e arquivados não contam). */
const FORA = new Set(["vendido", "arquivado"]);

export async function computePropertyStalledItems(
  supabase: any,
  userId: string,
): Promise<StalledItem[]> {
  const now = Date.now();
  const dias = (iso: string | null) => (iso ? Math.floor((now - new Date(iso).getTime()) / 864e5) : 0);
  const maisRecente = (...vals: (string | null | undefined)[]) => {
    const ts = vals.filter(Boolean).map((v) => new Date(v as string).getTime()).filter((n) => !Number.isNaN(n));
    return ts.length ? new Date(Math.max(...ts)).toISOString() : null;
  };

  const [props, ints, done] = await Promise.all([
    supabase.from("properties").select("id, title, status, created_at, archived_at").eq("user_id", userId).limit(500),
    supabase.from("interactions").select("property_id, occurred_at").eq("user_id", userId),
    supabase.from("follow_ups").select("related_property_id, outcome_recorded_at")
      .eq("user_id", userId).not("outcome_recorded_at", "is", null),
  ]);

  const last = new Map<string, string | null>();
  for (const r of ((ints.data as any[]) ?? [])) {
    if (r.property_id) last.set(r.property_id, maisRecente(last.get(r.property_id), r.occurred_at));
  }
  for (const r of ((done.data as any[]) ?? [])) {
    const id = r.related_property_id;
    if (id) last.set(id, maisRecente(last.get(id), r.outcome_recorded_at));
  }

  return ((props.data as any[]) ?? [])
    .filter((p) => !p.archived_at && !FORA.has(String(p.status ?? "").toLowerCase()))
    .map((p) => {
      const desde = last.get(p.id) ?? p.created_at ?? null;
      return {
        id: p.id as string,
        label: String(p.title ?? "").trim() || "Imóvel sem título",
        days: dias(desde),
        since: desde,
      };
    });
}