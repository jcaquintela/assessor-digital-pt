// Deteção de Oportunidades Proativa — motor puro, determinístico.
//
// Três motores: imóveis parados, match lead↔imóvel e negócios a arrefecer.
// Nunca lê da base de dados e nunca prevê nada: só afirma o que é
// verificável e termina sempre com uma ação sugerida (nunca só o aviso).

import { foldText } from "@/lib/search/normalize";
import { normalizeStage, STAGE_LABEL, type DealStage } from "@/lib/deals/stages";

export type AlertEngine = "imovel_parado" | "match_lead_imovel" | "negocio_arrefecer";
export type AlertUrgency = "alta" | "media" | "baixa";

export interface OpportunityAlert {
  /** Chave estável — serve de dedupe e de identificador para silenciar. */
  key: string;
  engine: AlertEngine;
  title: string;
  /** O facto: o que aconteceu (ou deixou de acontecer) e há quanto tempo. */
  detail: string;
  /** A ação sugerida. Obrigatória em todos os alertas. */
  action: string;
  urgency: AlertUrgency;
  /** Onde o consultor vai tratar disto. */
  to: string;
}

// ---- Limiares (perfil "equilibrado", confirmado com o consultor) ------

/** Imóvel parado: 30 dias até T2, 45 dias de T3 para cima. */
export const PROPERTY_STALL_DAYS = { pequeno: 30, grande: 45 } as const;
/** Negócio a arrefecer: 10 dias nas fases iniciais, 5 de "proposta" em diante. */
export const DEAL_COOL_DAYS = { inicial: 10, avancado: 5 } as const;
/** Só há alerta de match acima desta compatibilidade. */
export const MATCH_MIN_SCORE = 80;

const LATE_STAGES: DealStage[] = ["proposta", "cpcv", "escritura"];

export function propertyThresholdDays(typology: string | null | undefined): number {
  const t = foldText(typology);
  const m = t.match(/t\s*(\d+)/);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n >= 3 ? PROPERTY_STALL_DAYS.grande : PROPERTY_STALL_DAYS.pequeno;
}

export function dealThresholdDays(stage: unknown): number {
  return LATE_STAGES.includes(normalizeStage(stage)) ? DEAL_COOL_DAYS.avancado : DEAL_COOL_DAYS.inicial;
}

export function daysBetween(sinceIso: string | null | undefined, now: number): number {
  if (!sinceIso) return 0;
  const t = new Date(sinceIso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.floor((now - t) / 864e5);
}

// ---- 1) Imóveis parados ----------------------------------------------

export interface PropertyInput {
  id: string;
  title: string;
  typology: string | null;
  /** Última visita, interação real ou mudança de estado; se nada, a criação. */
  lastMovementAt: string | null;
}

/** Sugestão rotativa e estável por imóvel: preço, fotos ou divulgação. */
function propertyAction(p: PropertyInput, days: number): string {
  if (days >= 90) return "Rever o preço com o proprietário — 3 meses sem movimento é sinal de mercado.";
  if (days >= 60) return "Alargar a divulgação (portais, redes, colegas) e avisar o proprietário.";
  return "Atualizar as fotos e o texto do anúncio antes de mexer no preço.";
}

export function propertyStalledAlerts(props: PropertyInput[], now = Date.now()): OpportunityAlert[] {
  return props
    .map((p) => {
      const limite = propertyThresholdDays(p.typology);
      const dias = daysBetween(p.lastMovementAt, now);
      if (dias < limite) return null;
      const nome = p.title.trim() || "Imóvel sem título";
      return {
        key: `imovel_parado:${p.id}`,
        engine: "imovel_parado" as const,
        title: nome,
        detail: `Sem visita nem alteração de estado há ${dias} dias (régua: ${limite} dias${p.typology ? ` para ${p.typology}` : ""}).`,
        action: propertyAction(p, dias),
        urgency: (dias >= limite * 2 ? "alta" : "media") as AlertUrgency,
        to: `/imoveis/${p.id}`,
      };
    })
    .filter(Boolean) as OpportunityAlert[];
}

// ---- 2) Match lead ↔ imóvel -------------------------------------------

export interface LeadInput {
  id: string;
  name: string;
  searchLocation: string | null;
  searchTypology: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
}

export interface PropertyMatchInput {
  id: string;
  title: string;
  typology: string | null;
  location: string | null;
  price: number | null;
}

function zoneScore(lead: string | null, prop: string | null): number | null {
  const a = foldText(lead);
  const b = foldText(prop);
  if (!a || !b) return null;
  if (a === b) return 40;
  if (b.includes(a) || a.includes(b)) return 34;
  const palavras = a.split(" ").filter((w) => w.length >= 4);
  return palavras.some((w) => b.includes(w)) ? 28 : 0;
}

function typologyScore(lead: string | null, prop: string | null): number | null {
  const a = foldText(lead).replace(/\s+/g, "");
  const b = foldText(prop).replace(/\s+/g, "");
  if (!a || !b) return null;
  if (a === b) return 30;
  const na = Number(a.match(/t(\d+)/)?.[1] ?? NaN);
  const nb = Number(b.match(/t(\d+)/)?.[1] ?? NaN);
  if (Number.isFinite(na) && Number.isFinite(nb)) {
    if (na === nb) return 30;
    return Math.abs(na - nb) === 1 ? 18 : 0;
  }
  return 0;
}

function budgetScore(lead: LeadInput, price: number | null): number | null {
  if (price == null || (lead.budgetMin == null && lead.budgetMax == null)) return null;
  const min = lead.budgetMin ?? 0;
  const max = lead.budgetMax ?? Number.POSITIVE_INFINITY;
  if (price >= min && price <= max) return 30;
  const ref = Number.isFinite(max) ? max : min;
  if (!ref) return 0;
  const desvio = Math.abs(price - (price > max ? max : min)) / ref;
  if (desvio <= 0.05) return 22;
  if (desvio <= 0.1) return 12;
  return 0;
}

/**
 * Compatibilidade 0–100. Só conta critérios que existem dos DOIS lados —
 * um lead sem orçamento não fica com 70% só por ter zona e tipologia; a
 * pontuação é reescalada pelo peso disponível, para evitar falsos positivos.
 */
export function matchScore(lead: LeadInput, prop: PropertyMatchInput): number {
  const partes: Array<{ got: number | null; weight: number }> = [
    { got: zoneScore(lead.searchLocation, prop.location), weight: 40 },
    { got: typologyScore(lead.searchTypology, prop.typology), weight: 30 },
    { got: budgetScore(lead, prop.price), weight: 30 },
  ];
  const usados = partes.filter((p) => p.got !== null);
  // Com menos de dois critérios comparáveis não há match credível.
  if (usados.length < 2) return 0;
  const pesoTotal = usados.reduce((s, p) => s + p.weight, 0);
  const obtido = usados.reduce((s, p) => s + (p.got ?? 0), 0);
  return Math.round((obtido / pesoTotal) * 100);
}

export function matchAlerts(
  leads: LeadInput[],
  props: PropertyMatchInput[],
  minScore = MATCH_MIN_SCORE,
): OpportunityAlert[] {
  const out: OpportunityAlert[] = [];
  for (const lead of leads) {
    for (const prop of props) {
      const score = matchScore(lead, prop);
      if (score < minScore) continue;
      out.push({
        key: `match_lead_imovel:${lead.id}:${prop.id}`,
        engine: "match_lead_imovel",
        title: `${lead.name} ↔ ${prop.title}`,
        detail: `Compatibilidade de ${score}% em zona, tipologia e orçamento.`,
        action: `Propor visita a ${lead.name} a este imóvel esta semana.`,
        urgency: score >= 90 ? "alta" : "media",
        to: `/imoveis/${prop.id}`,
      });
    }
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

// ---- 3) Negócios a arrefecer ------------------------------------------

export interface DealInput {
  id: string;
  label: string;
  stage: string;
  /** Data da última interação REAL registada (chamada, visita, email, mensagem). */
  lastInteractionAt: string | null;
}

const NEXT_STEP: Record<DealStage, string> = {
  preparacao: "Fechar o que falta para avançar e marcar o próximo contacto.",
  angariacao: "Ligar ao proprietário para fechar as condições da angariação.",
  promocao: "Fazer ponto de situação da divulgação com o proprietário.",
  visitas: "Pedir feedback das últimas visitas e marcar a próxima.",
  proposta: "Ligar ao comprador para saber da proposta e propor um caminho.",
  cpcv: "Confirmar datas e documentos do CPCV com as duas partes.",
  escritura: "Confirmar a marcação da escritura e o que falta entregar.",
  concluido: "Fechar o negócio no sistema.",
  perdido: "Registar o motivo e arquivar.",
};

export function dealCoolingAlerts(deals: DealInput[], now = Date.now()): OpportunityAlert[] {
  return deals
    .map((d) => {
      const stage = normalizeStage(d.stage);
      const limite = dealThresholdDays(stage);
      const dias = daysBetween(d.lastInteractionAt, now);
      if (dias < limite) return null;
      const avancado = LATE_STAGES.includes(stage);
      return {
        key: `negocio_arrefecer:${d.id}`,
        engine: "negocio_arrefecer" as const,
        title: d.label.trim() || "Negócio sem título",
        detail: `Fase ${STAGE_LABEL[stage]} — sem contacto registado há ${dias} dias (régua: ${limite} dias).`,
        action: NEXT_STEP[stage],
        urgency: (avancado || dias >= limite * 2 ? "alta" : "media") as AlertUrgency,
        to: `/negocios/${d.id}`,
      };
    })
    .filter(Boolean) as OpportunityAlert[];
}

// ---- Silenciar e ordenar ----------------------------------------------

export interface AlertMute {
  alertKey: string;
  mutedUntil: string;
}

export function applyMutes(
  alerts: OpportunityAlert[],
  mutes: AlertMute[],
  now = Date.now(),
): OpportunityAlert[] {
  const ativos = new Set(
    mutes.filter((m) => new Date(m.mutedUntil).getTime() > now).map((m) => m.alertKey),
  );
  return alerts.filter((a) => !ativos.has(a.key));
}

const ORDEM: Record<AlertUrgency, number> = { alta: 0, media: 1, baixa: 2 };

export function sortAlerts(alerts: OpportunityAlert[]): OpportunityAlert[] {
  return [...alerts].sort((a, b) => ORDEM[a.urgency] - ORDEM[b.urgency] || a.key.localeCompare(b.key));
}

/** Resumo diário agregado — uma mensagem, nunca um alerta a cada minuto. */
export function composeDigestText(alerts: OpportunityAlert[]): string | null {
  if (!alerts.length) return null;
  const ord = sortAlerts(alerts);
  const top = ord[0]!;
  const resto = ord.length - 1;
  const linha = `${top.title}: ${top.detail} ${top.action}`;
  return resto > 0
    ? `Encontrei ${ord.length} oportunidades para hoje. A mais urgente — ${linha} As outras ${resto} estão no painel.`
    : `Encontrei uma oportunidade para hoje. ${linha}`;
}