// Leitura dos factos para a PRÓXIMA MELHOR AÇÃO (nível 2).
//
// Não inventa réguas novas: reaproveita os motores puros do Detector de
// Oportunidades (`propertyStalledAlerts`, `dealCoolingAlerts`) e as contagens
// canónicas de Diversos. Só acrescenta o valor potencial e a marca de
// "envolve terceiros", que o Detector não precisa de conhecer.

import {
  applyMutes,
  daysBetween,
  dealCoolingAlerts,
  propertyStalledAlerts,
  type AlertMute,
  type DealInput,
  type PropertyInput,
} from "@/lib/opportunities/detector";
import { isDealClosed } from "@/lib/deals/stages";
import { computeLastContact } from "@/lib/insights/last-contact.server";
import { isMiscInbox } from "@/lib/misc/archived";
import { lisbonYmd } from "@/lib/assessor/lisbon-day";
import {
  isWeekendYmd,
  selectNextBestAction,
  type NbaCandidate,
  type NbaPrevious,
  type NbaSuggestion,
} from "./next-best-action";

const IMOVEL_FORA = new Set(["vendido", "arquivado", "reservado"]);
/** Nível 2 para negócios é mais paciente do que o Detector: 14 dias. */
const NEGOCIO_DIAS_MINIMOS = 14;
/** Uma nota só entra em nível 2 quando já ficou por tratar uma semana. */
const DIVERSOS_DIAS_MINIMOS = 7;

/** A ação implica falar com alguém de fora (proprietário, comprador, lead). */
function envolveTerceiros(texto: string): boolean {
  return /propriet|comprador|vendedor|cliente|lead|ligar|telefon|contact|avisar|as duas partes|colegas/i.test(
    texto,
  );
}

function frasePropriedade(dias: number): string {
  return `está parado há ${dias} dias, sem visitas nem alterações`;
}

export async function computeNextBestAction(
  supabase: any,
  userId: string,
  now = new Date(),
): Promise<NbaSuggestion | null> {
  const nowMs = now.getTime();

  const [props, deals, contacto, mutes, misc] = await Promise.all([
    supabase
      .from("properties")
      .select("id, title, typology, status, asking_price, value, created_at, archived_at")
      .eq("user_id", userId)
      .limit(500),
    supabase
      .from("opportunities")
      .select("id, title, stage, status, value, person_id, created_at, archived_at")
      .eq("user_id", userId)
      .limit(500),
    computeLastContact(supabase, userId),
    supabase.from("alert_mutes").select("alert_key, muted_until").eq("user_id", userId),
    supabase
      .from("miscellaneous_items")
      .select("id, title, status, created_at")
      .eq("user_id", userId)
      .limit(500),
  ]);

  const porImovel = contacto.maps.byProperty;
  const porNegocio = contacto.maps.byDeal;
  const porPessoa = contacto.maps.byPerson;

  const imoveis = ((props.data as any[]) ?? []).filter(
    (p) => !p.archived_at && !IMOVEL_FORA.has(String(p.status ?? "").toLowerCase()),
  );
  const negocios = ((deals.data as any[]) ?? []).filter((d) => !d.archived_at && !isDealClosed(d));

  const propInputs: PropertyInput[] = imoveis.map((p) => ({
    id: p.id,
    title: String(p.title ?? ""),
    typology: p.typology ?? null,
    lastMovementAt: porImovel.get(p.id) ?? p.created_at ?? null,
  }));
  const dealInputs: DealInput[] = negocios.map((d) => ({
    id: d.id,
    label: String(d.title ?? "").trim() || "Negócio",
    stage: String(d.stage ?? "preparacao"),
    lastInteractionAt:
      porNegocio.get(d.id) ??
      (d.person_id ? porPessoa.get(d.person_id) ?? d.created_at ?? null : d.created_at ?? null),
  }));

  const silenciados: AlertMute[] = (((mutes as any).data as any[]) ?? []).map((m) => ({
    alertKey: String(m.alert_key),
    mutedUntil: String(m.muted_until),
  }));

  const alertas = applyMutes(
    [...propertyStalledAlerts(propInputs, nowMs), ...dealCoolingAlerts(dealInputs, nowMs)],
    silenciados,
    nowMs,
  );

  const porId = new Map(propInputs.map((p) => [p.id, p]));
  const negocioPorId = new Map(negocios.map((d) => [d.id, d]));
  const imovelPorId = new Map(imoveis.map((p) => [p.id, p]));

  const candidatos: NbaCandidate[] = [];

  for (const a of alertas) {
    const id = a.key.split(":")[1] ?? "";
    if (a.engine === "imovel_parado") {
      const base = porId.get(id);
      const row = imovelPorId.get(id);
      if (!base || !row) continue;
      const dias = daysBetween(base.lastMovementAt, nowMs);
      candidatos.push({
        key: a.key,
        kind: "imovel_parado",
        label: a.title,
        reason: frasePropriedade(dias),
        action: a.action,
        days: dias,
        value: (row.asking_price ?? row.value ?? null) as number | null,
        to: a.to,
        contactsThirdParty: envolveTerceiros(a.action),
      });
    } else if (a.engine === "negocio_arrefecer") {
      const base = dealInputs.find((d) => d.id === id);
      const row = negocioPorId.get(id);
      if (!base || !row) continue;
      const dias = daysBetween(base.lastInteractionAt, nowMs);
      if (dias < NEGOCIO_DIAS_MINIMOS) continue;
      candidatos.push({
        key: a.key,
        kind: "negocio_frio",
        label: a.title,
        reason: `está sem contacto registado há ${dias} dias`,
        action: a.action,
        days: dias,
        value: (row.value ?? null) as number | null,
        // Retomar um negócio parado é sempre falar com alguém.
        contactsThirdParty: true,
        to: a.to,
      });
    }
  }

  // Diversos por tratar: agregado (variante B) ou, se for só um, individualizado.
  const porTratar = ((misc.data as any[]) ?? [])
    .filter((m) => isMiscInbox(m))
    .map((m) => ({ ...m, dias: daysBetween(m.created_at, nowMs) }))
    .filter((m) => m.dias >= DIVERSOS_DIAS_MINIMOS)
    .sort((a, b) => b.dias - a.dias);

  if (porTratar.length === 1) {
    const m = porTratar[0]!;
    candidatos.push({
      key: `diversos:${m.id}`,
      kind: "diversos",
      label: `a nota "${String(m.title ?? "sem título").slice(0, 60)}"`,
      reason: `está por classificar há ${m.dias} dias`,
      action: "Classificar a nota em Diversos.",
      days: m.dias,
      value: null,
      to: "/diversos",
      contactsThirdParty: false,
    });
  } else if (porTratar.length > 1) {
    const maisAntiga = porTratar[0]!;
    candidatos.push({
      key: "diversos:inbox",
      kind: "diversos",
      label: null,
      reason: `tens ${porTratar.length} notas por classificar, a mais antiga há ${maisAntiga.dias} dias`,
      action: "Classificar as notas em Diversos.",
      days: maisAntiga.dias,
      value: null,
      to: "/diversos",
      contactsThirdParty: false,
    });
  }

  const previous = await lastSuggestion(supabase, userId, now);
  return selectNextBestAction({
    candidates: candidatos,
    previous,
    isWeekend: isWeekendYmd(lisbonYmd(now)),
  });
}

/**
 * A última sugestão mostrada num dia anterior e se foi clicada.
 * Registo simples em `product_telemetry_events` — chega para a regra de
 * não-repetição e não obriga a tabela nova.
 */
export async function lastSuggestion(
  supabase: any,
  userId: string,
  now: Date,
): Promise<NbaPrevious | null> {
  const hoje = lisbonYmd(now);
  const desde = new Date(now.getTime() - 7 * 864e5).toISOString();
  const { data } = await supabase
    .from("product_telemetry_events")
    .select("event, properties, occurred_at")
    .eq("user_id", userId)
    .in("event", ["hoje_nba_visto", "hoje_nba_clicado"])
    .gte("occurred_at", desde)
    .order("occurred_at", { ascending: false })
    .limit(50);

  const linhas = ((data as any[]) ?? []).filter((r) => lisbonYmd(r.occurred_at) !== hoje);
  const visto = linhas.find((r) => r.event === "hoje_nba_visto");
  if (!visto) return null;
  const key = String(visto.properties?.chave ?? "");
  if (!key) return null;
  const clicked = linhas.some(
    (r) =>
      r.event === "hoje_nba_clicado" &&
      String(r.properties?.chave ?? "") === key &&
      r.occurred_at >= visto.occurred_at,
  );
  return { key, clicked };
}
