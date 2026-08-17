// Leitura dos factos para a Deteção de Oportunidades. Só busca dados e
// entrega-os ao motor puro (`detector.ts`), que decide.

import {
  applyMutes, dealCoolingAlerts, matchAlerts, propertyStalledAlerts, sortAlerts,
  type AlertMute, type DealInput, type LeadInput, type OpportunityAlert,
  type PropertyInput, type PropertyMatchInput,
} from "./detector";
import { isDealClosed } from "@/lib/deals/stages";
import { normalizeTier, tierAtLeast } from "@/lib/subscription/tiers";

const IMOVEL_FORA = new Set(["vendido", "arquivado", "reservado"]);
// "Por angariar" é território exclusivo do Mentor (régua de 10 dias). Fica fora
// deste motor para o consultor não ver dois avisos parecidos sobre o mesmo imóvel.
const IMOVEL_SO_MENTOR = new Set(["por_angariar"]);
/** Só cruzamos entradas recentes — evita repetir matches antigos todos os dias. */
const JANELA_MATCH_DIAS = 21;

function maisRecente(...vals: (string | null | undefined)[]): string | null {
  const ts = vals.filter(Boolean).map((v) => new Date(v as string).getTime()).filter((n) => !Number.isNaN(n));
  return ts.length ? new Date(Math.max(...ts)).toISOString() : null;
}

export async function computeOpportunityAlerts(
  supabase: any,
  userId: string,
  now = new Date(),
): Promise<OpportunityAlert[]> {
  // Gate Pro — mesmo `effective_tier()` do resto da análise proativa.
  const { data: tierRaw } = await supabase.rpc("effective_tier", { _user_id: userId });
  if (!tierAtLeast(normalizeTier(tierRaw as string | null), "pro")) return [];

  const nowMs = now.getTime();
  const recente = new Date(nowMs - JANELA_MATCH_DIAS * 864e5).toISOString();

  const [props, deals, ints, people, mutes] = await Promise.all([
    supabase
      .from("properties")
      .select("id, title, typology, status, location, parish, city, asking_price, value, created_at, archived_at")
      .eq("user_id", userId)
      .limit(500),
    supabase
      .from("opportunities")
      .select("id, title, stage, status, person_id, created_at, stage_changed_at, archived_at")
      .eq("user_id", userId)
      .limit(500),
    supabase
      .from("interactions")
      .select("property_id, opportunity_id, person_id, occurred_at")
      .eq("user_id", userId)
      .limit(2000),
    supabase
      .from("people")
      .select("id, name, roles, search_location, search_property_type, budget_min, budget_max, created_at, updated_at, archived_at")
      .eq("user_id", userId)
      .limit(500),
    supabase.from("alert_mutes").select("alert_key, muted_until").eq("user_id", userId),
  ]);

  // "Interação registada" = contacto real registado em `interactions`.
  const porImovel = new Map<string, string | null>();
  const porNegocio = new Map<string, string | null>();
  const porPessoa = new Map<string, string | null>();
  for (const r of ((ints.data as any[]) ?? [])) {
    if (r.property_id) porImovel.set(r.property_id, maisRecente(porImovel.get(r.property_id), r.occurred_at));
    if (r.opportunity_id) porNegocio.set(r.opportunity_id, maisRecente(porNegocio.get(r.opportunity_id), r.occurred_at));
    if (r.person_id) porPessoa.set(r.person_id, maisRecente(porPessoa.get(r.person_id), r.occurred_at));
  }

  const imoveisAtivos = ((props.data as any[]) ?? []).filter(
    (p) => !p.archived_at && !IMOVEL_FORA.has(String(p.status ?? "").toLowerCase()),
  );

  const parados: PropertyInput[] = imoveisAtivos
    .filter((p) => !IMOVEL_SO_MENTOR.has(String(p.status ?? "").toLowerCase()))
    .map((p) => ({
      id: p.id,
      title: String(p.title ?? ""),
      typology: p.typology ?? null,
      lastMovementAt: porImovel.get(p.id) ?? p.created_at ?? null,
    }));

  const negocios: DealInput[] = ((deals.data as any[]) ?? [])
    .filter((d) => !d.archived_at && !isDealClosed(d))
    .map((d) => ({
      id: d.id,
      label: String(d.title ?? "").trim() || "Negócio",
      stage: String(d.stage ?? "preparacao"),
      lastInteractionAt:
        porNegocio.get(d.id) ??
        (d.person_id ? porPessoa.get(d.person_id) ?? d.created_at ?? null : d.created_at ?? null),
    }));

  const leads: LeadInput[] = ((people.data as any[]) ?? [])
    .filter((p) => !p.archived_at)
    .filter((p) => (p.roles ?? []).some((r: string) => r === "buyer" || r === "potential_buyer"))
    .filter((p) => String(p.updated_at ?? p.created_at ?? "") >= recente)
    .map((p) => ({
      id: p.id,
      name: String(p.name ?? "Contacto"),
      searchLocation: p.search_location ?? null,
      searchTypology: p.search_property_type ?? null,
      budgetMin: p.budget_min ?? null,
      budgetMax: p.budget_max ?? null,
    }));

  const paraMatch: PropertyMatchInput[] = imoveisAtivos.map((p) => ({
    id: p.id,
    title: String(p.title ?? "Imóvel"),
    typology: p.typology ?? null,
    location: p.location ?? p.parish ?? p.city ?? null,
    price: p.asking_price ?? p.value ?? null,
  }));

  const silenciados: AlertMute[] = (((mutes as any).data as any[]) ?? []).map((m) => ({
    alertKey: String(m.alert_key),
    mutedUntil: String(m.muted_until),
  }));

  const todos = [
    ...propertyStalledAlerts(parados, nowMs),
    ...matchAlerts(leads, paraMatch),
    ...dealCoolingAlerts(negocios, nowMs),
  ];
  return sortAlerts(applyMutes(todos, silenciados, nowMs));
}