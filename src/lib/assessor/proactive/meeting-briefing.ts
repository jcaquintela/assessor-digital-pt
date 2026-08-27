// Cartela de Briefing: 15 minutos antes de um compromisso com pessoa
// associada, o Afonso manda sozinho o que interessa saber sobre ela.
//
// Este ficheiro é puro (sem I/O): decide o que é um compromisso elegível e
// como se escreve a cartela. O runner vive em `meeting-briefing.server.ts`.

import { boldWa } from "../culture/whatsapp-format";
import { formatPersonBrief, type PersonBrief } from "../v3/person-brief";
import { classifyEvent } from "../event-class";
import { STAGE_LABEL, type DealStage } from "@/lib/deals/stages";

export const BRIEFING_LEAD_MINUTES = 15;
/** Tolerância para trás: cobre corridas atrasadas sem mandar tarde demais. */
export const BRIEFING_GRACE_MINUTES = 5;

export interface BriefingEvent {
  id: string;
  title: string;
  due_date: string;
  due_time?: string | null;
  type?: string | null;
  status?: string | null;
  person_id: string | null;
  related_property_id?: string | null;
  opportunity_id?: string | null;
  related_prospecting_lead_id?: string | null;
  /** Reclassificação/classificação gravada na criação. */
  event_class?: string | null;
  created_at?: string | null;
  briefing_sent_at?: string | null;
}

/** Contexto do próprio compromisso (imóvel e negócio ligados ao evento). */
export interface EventBriefContext {
  property?: {
    title?: string | null;
    address?: string | null;
    typology?: string | null;
    price?: number | null;
  } | null;
  deal?: { label?: string | null; stage?: string | null } | null;
}

// Estado aberto/fechado: regra canónica única.
import { isFollowUpClosed } from "@/lib/follow-ups/state";

function norm(v: unknown): string {
  return String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Instante de início do compromisso, respeitando `due_time` quando existe. */
export function eventStartMs(ev: Pick<BriefingEvent, "due_date" | "due_time">): number {
  const base = new Date(ev.due_date);
  if (Number.isNaN(base.getTime())) return NaN;
  const hhmm = String(ev.due_time ?? "").trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return base.getTime();
  // Data (em Lisboa) do due_date + hora de due_time, interpretada em Lisboa.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(base);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const dayIso = `${map.year}-${map.month}-${map.day}`;
  // Offset de Lisboa nesse dia (0 ou -1h face a UTC no verão).
  const guess = new Date(`${dayIso}T${m[1].padStart(2, "0")}:${m[2]}:00Z`);
  const offsetMin =
    (new Date(guess.toLocaleString("en-US", { timeZone: "UTC" })).getTime() -
      new Date(guess.toLocaleString("en-US", { timeZone: "Europe/Lisbon" })).getTime()) / 60000;
  return guess.getTime() + offsetMin * 60000;
}

/**
 * Só compromissos de negócio (com pessoa, imóvel, negócio ou lead ligados)
 * geram cartela. Reuniões internas e eventos sem qualquer ligação ficam de
 * fora — não há contexto relevante a mostrar.
 */
export function isBriefingEligible(ev: BriefingEvent): boolean {
  return classifyEvent(ev as any) === "negocio";
}

/**
 * Compromisso criado (ou alterado) já em cima da hora não recebe cartela:
 * um briefing tardio não ajuda ninguém.
 */
export function wasCreatedTooLate(ev: BriefingEvent): boolean {
  const created = ev.created_at ? new Date(ev.created_at).getTime() : NaN;
  if (!Number.isFinite(created)) return false;
  const start = eventStartMs(ev);
  if (!Number.isFinite(start)) return false;
  return start - created < BRIEFING_LEAD_MINUTES * 60_000;
}

/** Está dentro da janela dos próximos 15 minutos (com tolerância)? */
export function isBriefingDue(ev: BriefingEvent, nowMs: number): boolean {
  if (!isBriefingEligible(ev)) return false;
  if (ev.briefing_sent_at) return false;
  if (isFollowUpClosed(ev as any)) return false;
  if (wasCreatedTooLate(ev)) return false;
  const start = eventStartMs(ev);
  if (!Number.isFinite(start)) return false;
  const delta = start - nowMs;
  return delta <= BRIEFING_LEAD_MINUTES * 60_000 && delta >= -BRIEFING_GRACE_MINUTES * 60_000;
}

function moneyEur(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "";
  return new Intl.NumberFormat("pt-PT", {
    style: "currency", currency: "EUR", maximumFractionDigits: 0,
  }).format(n);
}

/** Linhas do contexto do compromisso: imóvel e estado do negócio. */
export function formatEventContext(ctx: EventBriefContext | null | undefined): string {
  if (!ctx) return "";
  const lines: string[] = [];
  const p = ctx.property;
  if (p) {
    const bits = [p.typology, p.title || p.address, moneyEur(p.price)]
      .map((b) => String(b ?? "").trim())
      .filter(Boolean);
    // Não repetir tipologia quando já vem no título ("T2 Conselhas").
    const uniq = bits.filter((b, i) => bits.findIndex((o) => o.toLowerCase() === b.toLowerCase()) === i);
    if (uniq.length) lines.push(`Imóvel: ${uniq.join(", ")}`);
  }
  const d = ctx.deal;
  if (d) {
    const stage = d.stage ? (STAGE_LABEL[d.stage as DealStage] ?? d.stage) : "";
    const label = String(d.label ?? "").trim();
    const text = [label, stage ? `em ${stage}` : ""].filter(Boolean).join(" — ");
    if (text) lines.push(`Negócio: ${text}`);
  }
  return lines.join("\n");
}

/** Há mesmo alguma coisa para mostrar (pessoa ou contexto do evento)? */
export function hasAnyBriefingContent(
  brief: PersonBrief | null | undefined,
  ctx?: EventBriefContext | null,
): boolean {
  if (brief && hasBriefContent(brief)) return true;
  return Boolean(formatEventContext(ctx));
}

export function hasBriefContent(b: PersonBrief): boolean {
  return Boolean(
    b.lastInteraction?.text?.trim() ||
    b.properties.length ||
    b.deals.length ||
    b.nextAction?.text?.trim(),
  );
}

export function timePt(ms: number): string {
  return lisbonHhMm(ms);
}

/** Texto final da cartela. Cabeçalho = motivo do compromisso + pessoa. */
export function formatMeetingBriefing(
  ev: BriefingEvent,
  brief: PersonBrief | null,
  nowMs: number,
  ctx?: EventBriefContext | null,
): string {
  const start = eventStartMs(ev);
  const minutes = Math.max(1, Math.round((start - nowMs) / 60_000));
  const head =
    `Daqui a ${minutes} min: ${boldWa(String(ev.title).trim())}` +
    (brief ? `, com ${boldWa(brief.name)}` : "") +
    (Number.isFinite(start) ? ` (${timePt(start)}).` : ".");
  const body = [brief ? formatPersonBrief(brief) : "", formatEventContext(ctx)]
    .filter((s) => s.trim())
    .join("\n");
  return `${head}\n\n${body}`.trimEnd();
}
/** Uma linha só, sem quebras nem marcações — exigência da Meta nos params. */
export function flattenForTemplate(text: string): string {
  return String(text ?? "")
    .replace(/[*_~`]/g, "")
    .replace(/\s*\n+\s*/g, " · ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[-·\s]+/, "")
    .trim()
    .slice(0, 900);
}

/**
 * Parâmetros do template de briefing, pela ordem {{1}}, {{2}}, {{3}}:
 * nome do consultor, compromisso (título + pessoa), resumo numa linha.
 */
export function briefingTemplateParams(
  ev: BriefingEvent,
  brief: PersonBrief | null,
  consultantFirstName: string,
  ctx?: EventBriefContext | null,
): string[] {
  const meeting = `${String(ev.title).trim()}${brief ? `, com ${brief.name}` : ""}`;
  const summary = [brief ? formatPersonBrief(brief).replace(/^.*?\n/, "") : "", formatEventContext(ctx)]
    .filter((s) => s.trim())
    .join("\n");
  return [
    flattenForTemplate(consultantFirstName) || "Olá",
    flattenForTemplate(meeting),
    flattenForTemplate(summary) ||
      flattenForTemplate(brief ? formatPersonBrief(brief) : String(ev.title ?? "")),
  ];
}
