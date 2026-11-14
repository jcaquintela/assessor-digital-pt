// Métricas de autonomia comercial a partir de dados reais (puro; o I/O está
// em autonomy-metrics.server.ts). Só contagens — nunca texto de mensagens.
//
// Definições (conservadoras, documentadas para não se lerem como causalidade):
// - Conversa: mensagens da mesma conta com intervalos < 30 min entre si.
// - Primeira ação útil: primeiro registo de ação comercial bem-sucedida
//   (COMMERCIAL_ACTION_TOOLS) dentro da conversa — EXECUTADA ou PREPARADA.
// - Execução: só registos de ferramenta que correram com sucesso. Os rótulos
//   dos casos action-first (buyer_search, listing_diagnosis, deal_risk_analysis)
//   provam PREPARAÇÃO, nunca execução; tentativas falhadas ficam DECIDIDAS.
// - Próxima ação concreta: alguma resposta do Afonso na conversa propõe um
//   passo específico (hasConcreteNextStep).
// - Sugestões aceites: confirmações pedidas pelo Afonso que o consultor
//   executou ÷ (executadas + canceladas + expiradas); avisos enviados com
//   resposta registada do consultor.
// - Satisfação: não há avaliação direta; usa-se a média do índice de
//   qualidade e as correções feitas pelo consultor (proxies, não satisfação).

import { COMMERCIAL_ACTION_TOOLS, hasConcreteDelivery, hasConcreteNextStep, levelOf, type ActionLevel } from "./commercial-autonomy";
import { LISTING_DOMAINS } from "@/lib/imoveis/similar-listings";
import { ownAppHosts } from "@/lib/env/app-url";

const LINK_RE = /https?:\/\/[^\s<>()*_]+/g;
function knownSource(url: string): boolean {
  let h = "";
  try { h = new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return false; }
  return ownAppHosts().includes(h) || LISTING_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`));
}

export const SESSION_GAP_MS = 30 * 60_000;

export interface MsgRow { user_id: string; role: string; content: string | null; created_at: string }
export interface ToolLogRow { user_id: string; created_at: string; tool_name: string | null; tool_success: boolean | null }
export interface PendingRow { status: string }
export interface NudgeRow { status: string; outcome: string | null }
export interface FollowUpRow { status: string | null; created_by_assessor: boolean | null }
export interface DealRow { stage: string | null }

export interface AutonomyMetrics {
  conversations: number;
  conversationsWithUsefulAction: number;
  /** Conversas com pelo menos uma ferramenta comercial EXECUTADA (com comprovativo). */
  conversationsWithExecutedAction: number;
  medianTurnsToFirstAction: number | null;
  medianTurnsToFirstExecution: number | null;
  /** Registos de ação por nível (decidida = tentada sem sucesso). */
  actionLevels: Record<ActionLevel, number>;
  medianSecondsToFirstAction: number | null;
  nextStepRate: number | null;
  /** Conversas com entrega concreta (material preparado, propostas com link, ação feita). */
  deliveryRate: number | null;
  /** Links mostrados que apontam para o painel ou portais conhecidos ÷ total (proxy). */
  sourceVerifiability: { links: number; knownSource: number; rate: number | null };
  actionsCompleted: number;
  proposals: { executed: number; declinedOrExpired: number; acceptanceRate: number | null };
  nudges: { sent: number; withConsultantOutcome: number };
  followUps: { createdByAfonso: number; completed: number };
  deals: { total: number; won: number; lost: number };
  satisfactionProxy: { aqsAvg: number | null; corrections: number; feedback: number; directRating: null };
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const ratio = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 1000 : null);
const fold = (s: string | null) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

interface Session { userId: string; start: number; end: number; userTurns: number[]; assistant: string[] }

export function splitSessions(messages: MsgRow[]): Session[] {
  const byUser = new Map<string, MsgRow[]>();
  for (const m of messages) {
    if (!byUser.has(m.user_id)) byUser.set(m.user_id, []);
    byUser.get(m.user_id)!.push(m);
  }
  const out: Session[] = [];
  for (const [userId, rows] of byUser) {
    rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
    let cur: Session | null = null;
    for (const r of rows) {
      const t = new Date(r.created_at).getTime();
      if (!cur || t - cur.end > SESSION_GAP_MS) {
        cur = { userId, start: t, end: t, userTurns: [], assistant: [] };
        out.push(cur);
      }
      cur.end = t;
      if (r.role === "user") cur.userTurns.push(t);
      else cur.assistant.push(String(r.content ?? ""));
    }
  }
  return out.filter((s) => s.userTurns.length > 0);
}

export function computeAutonomyMetrics(input: {
  messages: MsgRow[];
  toolLogs: ToolLogRow[];
  pending: PendingRow[];
  nudges: NudgeRow[];
  followUps: FollowUpRow[];
  deals: DealRow[];
  aqsScores: number[];
  corrections: number;
  feedback: number;
}): AutonomyMetrics {
  const sessions = splitSessions(input.messages);
  const logsByUser = new Map<string, number[]>();
  const execByUser = new Map<string, number[]>();
  const actionLevels: Record<ActionLevel, number> = { decided: 0, prepared: 0, executed: 0 };
  const push = (m: Map<string, number[]>, u: string, t: number) => { if (!m.has(u)) m.set(u, []); m.get(u)!.push(t); };
  for (const l of input.toolLogs) {
    if (!l.tool_name || !COMMERCIAL_ACTION_TOOLS.has(l.tool_name)) continue;
    const level = levelOf({ name: l.tool_name, ok: l.tool_success === true })!;
    actionLevels[level]++;
    if (level === "decided") continue;
    const t = new Date(l.created_at).getTime();
    push(logsByUser, l.user_id, t);
    if (level === "executed") push(execByUser, l.user_id, t);
  }
  const execTurns: number[] = [];
  let withExecuted = 0;
  const turns: number[] = [];
  const secs: number[] = [];
  let withAction = 0;
  let withNext = 0;
  let withDelivery = 0;
  let links = 0;
  let known = 0;
  for (const s of sessions) {
    if (s.assistant.some(hasConcreteNextStep)) withNext++;
    for (const a of s.assistant) for (const u of a.match(LINK_RE) ?? []) { links++; if (knownSource(u)) known++; }
    const inSession = (xs: number[]) => xs.filter((t) => t >= s.start && t <= s.end + 120_000).sort((a, b) => a - b);
    const hits = inSession(logsByUser.get(s.userId) ?? []);
    const ex = inSession(execByUser.get(s.userId) ?? []);
    if (ex.length) { withExecuted++; execTurns.push(Math.max(1, s.userTurns.filter((t) => t <= ex[0]).length)); }
    if (hits.length || s.assistant.some(hasConcreteDelivery)) withDelivery++;
    if (!hits.length) continue;
    withAction++;
    const first = hits[0];
    turns.push(Math.max(1, s.userTurns.filter((t) => t <= first).length));
    secs.push(Math.round((first - s.start) / 1000));
  }

  const executed = input.pending.filter((p) => p.status === "executed").length;
  const declined = input.pending.filter((p) => ["cancelled", "expired", "dismissed"].includes(p.status)).length;
  const sent = input.nudges.filter((n) => n.status === "sent" || n.status === "resolved").length;
  // "mencionado_no_briefing" é do sistema, não uma resposta do consultor.
  const answered = input.nudges.filter((n) => n.outcome && n.outcome !== "mencionado_no_briefing").length;
  const aqs = input.aqsScores.filter((n) => Number.isFinite(n));

  return {
    conversations: sessions.length,
    conversationsWithUsefulAction: withAction,
    conversationsWithExecutedAction: withExecuted,
    medianTurnsToFirstAction: median(turns),
    medianTurnsToFirstExecution: median(execTurns),
    actionLevels,
    medianSecondsToFirstAction: median(secs),
    nextStepRate: ratio(withNext, sessions.length),
    deliveryRate: ratio(withDelivery, sessions.length),
    sourceVerifiability: { links, knownSource: known, rate: ratio(known, links) },
    actionsCompleted: executed + input.followUps.filter((f) => f.created_by_assessor && fold(f.status) === "concluido").length,
    proposals: { executed, declinedOrExpired: declined, acceptanceRate: ratio(executed, executed + declined) },
    nudges: { sent, withConsultantOutcome: answered },
    followUps: {
      createdByAfonso: input.followUps.filter((f) => f.created_by_assessor).length,
      completed: input.followUps.filter((f) => f.created_by_assessor && fold(f.status) === "concluido").length,
    },
    deals: {
      total: input.deals.length,
      won: input.deals.filter((d) => d.stage === "concluido").length,
      lost: input.deals.filter((d) => d.stage === "perdido").length,
    },
    satisfactionProxy: {
      aqsAvg: aqs.length ? Math.round((aqs.reduce((a, b) => a + b, 0) / aqs.length) * 100) / 100 : null,
      corrections: input.corrections,
      feedback: input.feedback,
      directRating: null,
    },
  };
}
