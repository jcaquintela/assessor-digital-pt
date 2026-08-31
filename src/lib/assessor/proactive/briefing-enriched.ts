// Briefing matinal enriquecido — camada de APRESENTAÇÃO.
//
// Regra estrutural: aqui não se consulta nada. `computePriorities` continua a
// decidir o QUÊ, `day-agenda-facts` continua dono de "livre/ocupado" e
// `findTightGaps`/`findConflicts` continuam donos dos intervalos. Este módulo
// só agrupa, ordena e escreve.

import { entityUrl } from "@/lib/nav/entity-url";
import { tightGapMessage } from "@/lib/agenda/conflict-message";
import { findTightGapsInWindows, type TightGap } from "@/lib/agenda/conflicts";
import type { AgendaFactEvent } from "./day-agenda-facts";
import { lisbonYmd } from "../lisbon-day";

export interface BriefingPriority {
  subject_type: string;
  subject_id: string;
  action: string;
  entity_label: string | null;
  priority_score: number;
  deal_id?: string | null;
  event_start_at?: string | null;
}

/**
 * Folgas curtas a partir da agenda do dia já carregada — mesma fonte, sem
 * query nova. Só compromissos com hora entram.
 */
export function tightGapsFromAgenda(events: AgendaFactEvent[], now: Date = new Date()): TightGap[] {
  const nowMs = now.getTime();
  const windows = events
    .filter((e) => e.startIso && e.endIso && new Date(e.endIso).getTime() >= nowMs)
    .map((e) => ({
      id: e.id,
      title: String(e.title ?? "").trim() || "Compromisso",
      startMs: new Date(e.startIso as string).getTime(),
      endMs: new Date(e.endIso as string).getTime(),
      series_id: null as string | null,
    }))
    .filter((w) => Number.isFinite(w.startMs) && Number.isFinite(w.endMs));
  return findTightGapsInWindows(windows);
}

export type PriorityBucket = "P1" | "P2" | "P3";

/** Limites de leitura no canal — o painel tem sempre a versão completa. */
export const MAX_P1 = 3;
export const MAX_P2 = 2;
export const BRIEFING_MAX_CHARS = 1200;
export const PANEL_URL = "app.meuafonso.com/hoje";
export const TRUNCATION_NOTE = `… (resto no painel: ${PANEL_URL})`;

const P1_MIN_SCORE = 80;
const P2_MIN_SCORE = 55;

/** Compromisso de hoje que ainda vai acontecer — é sempre P1, venha o score que vier. */
export function isTodayUpcomingEvent(item: BriefingPriority, now: Date = new Date()): boolean {
  if (!item.event_start_at) return false;
  const t = new Date(item.event_start_at).getTime();
  if (!Number.isFinite(t) || t < now.getTime()) return false;
  return lisbonYmd(item.event_start_at) === lisbonYmd(now);
}

export function bucketOf(item: BriefingPriority, now: Date = new Date()): PriorityBucket {
  if (isTodayUpcomingEvent(item, now)) return "P1";
  const score = Number(item.priority_score ?? 0);
  if (score >= P1_MIN_SCORE) return "P1";
  if (score >= P2_MIN_SCORE) return "P2";
  return "P3";
}

export interface BucketedPriorities {
  p1: BriefingPriority[];
  p2: BriefingPriority[];
  p3: BriefingPriority[];
}

export function bucketPriorities(
  items: BriefingPriority[],
  now: Date = new Date(),
): BucketedPriorities {
  const out: BucketedPriorities = { p1: [], p2: [], p3: [] };
  for (const it of items) {
    const b = bucketOf(it, now);
    if (b === "P1") out.p1.push(it);
    else if (b === "P2") out.p2.push(it);
    else out.p3.push(it);
  }
  return out;
}

/** Link do registo referido pelo item (nunca inventa: sem rota, sem link). */
export function priorityUrl(item: BriefingPriority, base?: string | null): string | null {
  if (item.subject_type === "deal_deadline") return entityUrl("deal", item.deal_id ?? null, { base });
  return entityUrl(item.subject_type, item.subject_id, { base });
}

/** As próximas 3 ações — texto tal e qual vem das prioridades, sem reescrita. */
export function nextThreeActions(items: BriefingPriority[]): string[] {
  return items.slice(0, 3).map((it) => it.action);
}

function line(item: BriefingPriority, base?: string | null): string {
  const url = priorityUrl(item, base);
  const who = item.entity_label ? ` — ${item.entity_label}` : "";
  return `• ${item.action}${who}${url ? ` ${url}` : ""}`;
}

export interface EnrichedBriefingOptions {
  firstName?: string;
  now?: Date;
  tightGaps?: TightGap[];
  /** Conflitos dos próximos 7 dias — o aviso separado cobre 8–14. */
  conflicts?: ConflictPair[];
  /** Base absoluta dos links (canal); vazio no painel. */
  base?: string | null;
  maxChars?: number;
}

/** Máximo de conflitos escritos por extenso no briefing. */
export const MAX_BRIEFING_CONFLICTS = 3;


/**
 * Briefing curto para o canal: máx. 3 P1 + 2 P2 explícitos, P3 só como
 * contagem. Se ainda assim exceder o limite, corta pelo fim e diz que cortou.
 */
export function composeEnrichedBriefing(
  priorities: BriefingPriority[],
  opts: EnrichedBriefingOptions = {},
): string {
  const now = opts.now ?? new Date();
  const base = opts.base ?? "";
  const max = opts.maxChars ?? BRIEFING_MAX_CHARS;
  const { p1, p2, p3 } = bucketPriorities(priorities, now);

  const shownP1 = p1.slice(0, MAX_P1);
  const shownP2 = p2.slice(0, MAX_P2);
  const restCount = p1.length - shownP1.length + (p2.length - shownP2.length) + p3.length;

  const head = `Bom dia${opts.firstName ? `, ${opts.firstName}` : ""}. O que interessa hoje:`;
  const blocks: Array<{ text: string; removable: boolean }> = [{ text: head, removable: false }];

  if (shownP1.length) {
    blocks.push({ text: `🔴 P1\n${shownP1.map((i) => line(i, base)).join("\n")}`, removable: false });
  }
  if (shownP2.length) {
    blocks.push({ text: `🟠 P2\n${shownP2.map((i) => line(i, base)).join("\n")}`, removable: false });
  }
  if (restCount > 0) {
    blocks.push({
      text: `Mais ${restCount} no painel: ${base ? `${base.replace(/\/+$/, "")}/hoje` : PANEL_URL}`,
      removable: false,
    });
  }
  for (const gap of opts.tightGaps ?? []) {
    blocks.push({ text: tightGapMessage(gap), removable: true });
  }
  const steps = nextThreeActions([...shownP1, ...shownP2, ...p3]);
  if (steps.length) {
    blocks.push({
      text: `Próximas ações: ${steps.map((s, i) => `${i + 1}) ${s}`).join(" ")}`,
      removable: true,
    });
  }

  const join = (list: typeof blocks) => list.map((b) => b.text).join("\n");
  let list = [...blocks];
  let cut = false;
  while (join(list).length > max) {
    const idx = [...list].reverse().findIndex((b) => b.removable);
    if (idx === -1) break;
    list.splice(list.length - 1 - idx, 1);
    cut = true;
  }
  let text = join(list);
  if (text.length > max) {
    const budget = Math.max(0, max - TRUNCATION_NOTE.length - 1);
    text = `${text.slice(0, budget).replace(/[\s•·-]+$/, "")} ${TRUNCATION_NOTE}`.trim();
    cut = true;
  } else if (cut) {
    const withNote = `${text}\n${TRUNCATION_NOTE}`;
    text = withNote.length <= max ? withNote : text;
  }
  return text;
}
