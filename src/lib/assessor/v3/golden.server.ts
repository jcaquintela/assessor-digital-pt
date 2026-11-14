// Golden Conversations — replay de THINK+DECIDE (sem ACT, sem persistência),
// para regressão zero em respostas canónicas.

import { observe } from "./observe.server";
import { think } from "./think.server";
import { decide } from "./decide.server";
import { sanitizeReply, enforceHumanTone, enforceSingleQuestion } from "../culture/sanitize";
import { sanitizeAssessorName, ASSESSOR_NAME_DEFAULT } from "../assessor-name";
import type { Observation, SearchName, SearchResults } from "./types";
import { lisbonYmd } from "../lisbon-day";
import {
  detectAgendaQuery,
  formatAgendaReply,
  BARE_CONFIRMATION_REPLY,
} from "./deterministic.server";
import { isConfirmation as saIsConfirmation } from "../culture/short-answers";
import {
  evaluateAutonomyExpectation, scoreConversation, type AutonomyExpect, type ConversationScore, type ToolRun, type TurnInput,
} from "../eval/commercial-autonomy";
import type { InternalPropertyRow, PortalListing } from "../qualification/proposal-format";
import type { ZomeListing } from "@/lib/imoveis/zome-public";
import type { Comparable } from "../listing/compose";

export interface GoldenExpect {
  action?: "act" | "ask" | "acknowledge" | "do_nothing" | "search_more";
  tool?: string;
  reply_contains?: string[];
  must_not_contain?: string[];
  /**
   * Critérios de autonomia comercial para a conversa inteira (lidos do 1.º
   * turno que os tiver). Com isto presente, a conversa reprova se a 1.ª ação
   * útil chegar tarde, se houver perguntas em série, sem próximo passo, ou
   * com execução simulada / links inventados / contacto a terceiros.
   */
  autonomy?: AutonomyExpect;
}

/**
 * Dados SINTÉTICOS para o replay: fazem as vezes das ferramentas de leitura.
 * Uma chamada a uma ferramenta-fixture conta como EXECUTADA no replay (há
 * resultado), marcada `fixture: true`; sem fixture a ferramenta não corre.
 * Nunca toca na base de dados nem em serviços externos.
 */
export interface GoldenFixtures {
  portal?: PortalListing[];
  zome?: ZomeListing[];
  properties?: InternalPropertyRow[];
  comparables?: Comparable[];
}

export interface GoldenTurn {
  user: string;
  expect?: GoldenExpect;
  /**
   * Controlo negativo: resposta fixa do assistente (o motor não corre neste
   * turno). Serve para provar que o avaliador reprova comportamentos errados.
   */
  assistant?: string;
  /** Evidência de ferramentas da resposta fixa (sintética). */
  tools?: ToolRun[];
  fixtures?: GoldenFixtures;
}

export interface GoldenTurnResult {
  turn: number;
  user: string;
  reply: string;
  action: string;
  tools: string[];
  /** Evidência por nível: decidida / preparada / executada (só com comprovativo). */
  evidence?: ToolRun[];
  /** Turno com resposta fixa (controlo negativo). */
  scripted?: boolean;
  passed: boolean;
  failures: string[];
  // Turno inconclusivo: a IA esteve indisponível (créditos, rate limit, rede).
  // Não conta como falha de comportamento.
  unavailable?: boolean;
  unavailableReason?: string;
}

export interface GoldenRunResult {
  passed: boolean;
  turns: GoldenTurnResult[];
  aqsAvg: number | null;
  // true quando pelo menos um turno ficou por avaliar por indisponibilidade.
  inconclusive?: boolean;
  unavailableReason?: string | null;
  /** Pontuação de autonomia comercial (sempre calculada; só reprova quando pedida). */
  autonomy?: ConversationScore;
  /** Controlo negativo: passou = o avaliador reprovou como devia. */
  negativeControl?: boolean;
  missingExpectedFailures?: string[];
}

export interface GoldenRunOptions {
  /** Reproduz a qualificação de compradores action-first (como com o interruptor ligado). */
  actionFirst?: boolean;
}

function nowLisbonYmd(): string {
  return lisbonYmd(new Date());
}
function nowLisbonHuman(): string {
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: "Europe/Lisbon", weekday: "long", year: "numeric", month: "long",
    day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date());
}

// ---------------------------------------------------------------------------
// Horas relativas nos guiões
//
// Um golden nunca pode depender do relógio: "hoje às 17h" passa de manhã e
// falha à tarde. Os guiões usam marcadores resolvidos no momento da corrida:
//   {{HORA+2}} -> "hoje às 15h" (dia + hora)
//   {{H+3}}    -> "16h" (só a hora, para "afinal passa para as ...")
// Todos os marcadores da mesma corrida partilham a mesma âncora: se o dia já
// não tem horas livres suficientes, a sequência inteira passa para amanhã de
// manhã, para nunca gerar coisas como "melhor às 0h".
// ---------------------------------------------------------------------------

const MAX_TOKEN_OFFSET = 6; // margem para a sequência caber no mesmo dia

function goldenClock(offsetHours: number): { hour: number; sameDay: boolean } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon", hour: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const current = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  // Cabe hoje? Só se a sequência toda ficar antes das 23h.
  if (current + MAX_TOKEN_OFFSET <= 22) return { hour: current + offsetHours, sameDay: true };
  // Caso contrário, ancoramos em amanhã às 9h (offset 2 == 9h).
  return { hour: 7 + offsetHours, sameDay: false };
}

export function renderGoldenText(text: string): string {
  return String(text ?? "")
    .replace(/\{\{\s*HORA\s*\+\s*(\d+)\s*\}\}/gi, (_m, n) => {
      const { hour, sameDay } = goldenClock(Number(n));
      return `${sameDay ? "hoje" : "amanhã"} às ${hour}h`;
    })
    .replace(/\{\{\s*H\s*\+\s*(\d+)\s*\}\}/gi, (_m, n) => `${goldenClock(Number(n)).hour}h`);
}

// ---------------------------------------------------------------------------
// SEARCH simulado
//
// O motor real corre OBSERVE -> THINK -> SEARCH -> DECIDE. Sem a fase SEARCH,
// o DECIDE não tem dados sobre a pessoa/imóvel mencionados e devolve sempre
// "search_more", o que tornava impossível validar o comportamento final.
// Aqui devolvemos resultados fixture coerentes com as observações, para o
// harness refletir o ciclo real sem tocar na base de dados.
// ---------------------------------------------------------------------------

function firstOf(obs: Observation[], type: Observation["type"]): string | undefined {
  return obs.find((o) => o.type === type)?.value;
}

function titleCase(v: string): string {
  return v.split(/\s+/).filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export function fixtureSearches(
  obs: Observation[],
  recommended: SearchName[],
  opts: { broaden?: boolean } = {},
): SearchResults {
  const wants = new Set<SearchName>(recommended);
  const broaden = opts.broaden === true;
  const out: SearchResults = { conversation_state: null, pending_action: null };

  const personName = firstOf(obs, "name") ?? firstOf(obs, "reference");
  const phone = firstOf(obs, "phone");
  if (broaden || wants.has("people_by_name") || wants.has("people_by_phone")) {
    out.people = personName
      ? [{
          id: "golden-person-1",
          name: titleCase(personName),
          phone: phone ?? "+351910000001",
          relationship_type: "client",
          summary: "Contacto de teste do guião golden.",
        }]
      : [];
  }

  const place = firstOf(obs, "address") ?? firstOf(obs, "typology") ?? firstOf(obs, "name");
  if (broaden || wants.has("properties_by_location") || wants.has("properties_by_title")) {
    out.properties = place
      ? [{
          id: "golden-property-1",
          title: titleCase(place),
          address: titleCase(place),
          status: "available",
        }]
      : [];
  }

  if (broaden || wants.has("agenda_today") || wants.has("agenda_tomorrow") || wants.has("agenda_week")) {
    out.agenda = { items: [] };
  }
  if (broaden || wants.has("prospecting_by_phone") || wants.has("prospecting_by_location")) {
    out.prospecting_leads = [];
  }
  return out;
}

function evaluateTurn(reply: string, action: string, tools: string[], expect?: GoldenExpect): string[] {
  const failures: string[] = [];
  if (!expect) return failures;
  if (expect.action && expect.action !== action) failures.push(`action:${action}≠${expect.action}`);
  if (expect.tool && !tools.includes(expect.tool)) failures.push(`missing_tool:${expect.tool}`);
  const low = reply.toLowerCase();
  // Alternativas com "|": "guião|script" passa se qualquer uma existir.
  for (const s of expect.reply_contains ?? []) {
    const alts = String(s).split("|").map((a) => a.trim().toLowerCase()).filter(Boolean);
    if (!alts.some((a) => low.includes(a))) failures.push(`missing:${s}`);
  }
  for (const s of expect.must_not_contain ?? []) if (low.includes(s.toLowerCase())) failures.push(`forbidden:${s}`);
  return failures;
}

export async function runGolden(
  turns: GoldenTurn[],
  assessorName?: string | null,
  opts: GoldenRunOptions = {},
): Promise<GoldenRunResult> {
  const results: GoldenTurnResult[] = [];
  const historyLines: string[] = [];
  const rows: Array<{ role: string; content: string; created_at: string }> = [];
  const name = sanitizeAssessorName(assessorName ?? "") || ASSESSOR_NAME_DEFAULT;
  const fx: GoldenFixtures = turns.find((x) => x.fixtures)?.fixtures ?? {};
  const ymd = nowLisbonYmd();
  const human = nowLisbonHuman();

  for (let i = 0; i < turns.length; i++) {
    const raw = turns[i];
    const t: GoldenTurn = { ...raw, user: renderGoldenText(raw.user) };
    // Router determinístico — replica o comportamento do runtime real
    // para agenda e "sim" sem contexto, sem depender da IA.
    rows.push({ role: "user", content: t.user, created_at: new Date().toISOString() });
    if (typeof raw.assistant === "string") {
      const reply = raw.assistant;
      const evidence = (raw.tools ?? []).map((x) => ({ ...x }));
      const tools = evidence.map((x) => x.name);
      const failures = evaluateTurn(reply, evidence.length ? "act" : "ask", tools, t.expect);
      results.push({ turn: i + 1, user: t.user, reply, action: evidence.length ? "act" : "ask", tools, evidence, scripted: true, passed: failures.length === 0, failures });
      rows.push({ role: "assistant", content: reply, created_at: new Date().toISOString() });
      historyLines.push(`consultor: ${t.user}`);
      historyLines.push(`assessor: ${reply}`);
      continue;
    }
    if (opts.actionFirst) {
      // Cada chamada a uma ferramenta-fixture fica registada como EXECUTADA
      // (com o resultado, para a proveniência dos links). Sem fixture: não corre.
      const evidence: ToolRun[] = [];
      const ran = (name: string, data: unknown) => evidence.push({ name, ok: true, level: "executed", data: { fixture: true, ...(data as object) } });
      const { runBuyerQualification } = await import("../qualification/qualification.server");
      const { runListingDiagnosis } = await import("../listing/listing.server");
      const { runDealRisk } = await import("../deal/deal.server");
      const deal = await runDealRisk({
        supabase: null, userId: "golden", channel: "whatsapp", trimmed: t.user, skipFlagCheck: true,
        deps: { loadRecent: async () => rows.slice(0, -1).map((r) => ({ ...r })) },
      });
      const listing = deal ? null : await runListingDiagnosis({
        supabase: null, userId: "golden", channel: "whatsapp", trimmed: t.user, skipFlagCheck: true,
        deps: {
          loadRecent: async () => rows.slice(0, -1).map((r) => ({ ...r })),
          findOwnListing: async () => { ran("own_listing_lookup", { found: false }); return { found: false, price: null, url: null }; },
          searchComparables: async () => {
            if (!fx.comparables) return { status: "not_run", results: [] };
            ran("search_similar_listings", { results: fx.comparables });
            return { status: "ok", results: fx.comparables };
          },
        },
      });
      const q = deal
        ? { reply: deal.reply, acted: deal.acted, tool: deal.acted ? "deal_risk_analysis" : "deal_questions" }
        : listing
        ? { reply: listing.reply, acted: listing.acted, tool: listing.acted ? "listing_diagnosis" : "listing_questions" }
        : await runBuyerQualification({
        supabase: null, userId: "golden", channel: "whatsapp", trimmed: t.user, skipFlagCheck: true,
        deps: {
          loadRecent: async () => rows.slice(0, -1).map((r) => ({ ...r })),
          loadProperties: async () => { ran("search_properties", { rows: fx.properties ?? [] }); return fx.properties ?? []; },
          searchPortals: async () => {
            if (!fx.portal) return { status: "not_run", results: [] };
            ran("search_similar_listings", { results: fx.portal });
            return { status: "ok", results: fx.portal };
          },
          ...(fx.zome ? {
            searchZome: async () => { ran("search_zome_public", { results: fx.zome }); return { status: "ok" as const, results: fx.zome! }; },
          } : {}),
        },
      }).then((r) => (r ? { reply: r.reply, acted: r.acted, tool: r.acted ? "buyer_search" : "buyer_questions" } : null));
      if (q) {
        const tools = [q.tool];
        // O rótulo do caso prova só preparação (ou pergunta), nunca execução.
        const all: ToolRun[] = [{ name: q.tool, ok: true, level: q.acted ? "prepared" : "decided" }, ...evidence];
        const failures = evaluateTurn(q.reply, q.acted ? "act" : "ask", tools, t.expect);
        results.push({ turn: i + 1, user: t.user, reply: q.reply, action: q.acted ? "act" : "ask", tools, evidence: all, passed: failures.length === 0, failures });
        rows.push({ role: "assistant", content: q.reply, created_at: new Date().toISOString() });
        historyLines.push(`consultor: ${t.user}`);
        historyLines.push(`assessor: ${q.reply}`);
        continue;
      }
    }
    const agendaPeriod = detectAgendaQuery(t.user);
    if (agendaPeriod) {
      const reply = formatAgendaReply(agendaPeriod, []);
      const failures = evaluateTurn(reply, "act", ["search_agenda"], t.expect);
      results.push({
        turn: i + 1, user: t.user, reply,
        action: "act", tools: ["search_agenda"],
        passed: failures.length === 0, failures,
      });
      historyLines.push(`consultor: ${t.user}`);
      historyLines.push(`assessor: ${reply}`);
      rows.push({ role: "assistant", content: reply, created_at: new Date().toISOString() });
      continue;
    }
    if (saIsConfirmation(t.user)) {
      const reply = BARE_CONFIRMATION_REPLY;
      const failures = evaluateTurn(reply, "ask", [], t.expect);
      results.push({
        turn: i + 1, user: t.user, reply,
        action: "ask", tools: [],
        passed: failures.length === 0, failures,
      });
      historyLines.push(`consultor: ${t.user}`);
      historyLines.push(`assessor: ${reply}`);
      rows.push({ role: "assistant", content: reply, created_at: new Date().toISOString() });
      continue;
    }

    const obs = observe(t.user);
    const historyPreview = historyLines.slice(-6).join("\n");
    const thinkR = await think({ content: t.user, observations: obs, historyPreview });

    // SEARCH — mesmo conjunto que o motor real pede (mais estado + pendente).
    const recommended = Array.from(new Set([
      ...thinkR.output.recommended_searches,
      "conversation_state" as const,
      "pending_action" as const,
    ])) as SearchName[];
    const baseArgs = {
      content: t.user, observations: obs, hypotheses: thinkR.output.hypotheses,
      historyPreview, assessorName: name, userFirstName: "",
      nowLisbonYmd: ymd, nowLisbonHuman: human,
    };
    let decideR = await decide({ ...baseArgs, searches: fixtureSearches(obs, recommended) });
    // Se ainda pede mais pesquisa, damos-lhe tudo o que existiria e voltamos a
    // decidir — é o que o ciclo real faria antes de responder ao consultor.
    if (decideR.decision.action === "search_more") {
      decideR = await decide({
        ...baseArgs,
        searches: fixtureSearches(obs, recommended, { broaden: true }),
      });
    }

    let reply = sanitizeReply(decideR.decision.natural_reply);
    reply = enforceHumanTone(reply, { actionExecutedOk: false });
    if (decideR.decision.action === "ask") reply = enforceSingleQuestion(reply);

    const tools = decideR.decision.tool_calls.map((c) => c.name);

    // Gateway em baixo: o turno é inconclusivo, não uma regressão. Avaliar
    // uma resposta vazia produzida por um 402/429/5xx daria um falso negativo
    // e mandaria alguém procurar um bug de comportamento que não existe.
    if (thinkR.unavailable === true || decideR.unavailable === true) {
      const reason = decideR.error ?? thinkR.error ?? "gateway indisponível";
      results.push({
        turn: i + 1, user: t.user, reply,
        action: decideR.decision.action, tools,
        passed: false, failures: [`gateway_indisponivel:${reason}`],
        unavailable: true, unavailableReason: reason,
      });
      historyLines.push(`consultor: ${t.user}`);
      historyLines.push(`assessor: ${reply}`);
      rows.push({ role: "assistant", content: reply, created_at: new Date().toISOString() });
      continue;
    }

    const failures = evaluateTurn(reply, decideR.decision.action, tools, t.expect);
    results.push({
      turn: i + 1, user: t.user, reply,
      action: decideR.decision.action, tools,
      // O replay não executa (sem ACT): o que o modelo escolheu fica DECIDIDO.
      evidence: tools.map((name) => ({ name, ok: true, level: "decided" as const })),
      passed: failures.length === 0, failures,
    });

    historyLines.push(`consultor: ${t.user}`);
    historyLines.push(`assessor: ${reply}`);
      rows.push({ role: "assistant", content: reply, created_at: new Date().toISOString() });
  }

  const unavailableTurn = results.find((r) => r.unavailable);
  const inconclusive = !!unavailableTurn;
  // Um guião com turnos inconclusivos não passa nem reprova por
  // comportamento — quem lê o resultado tem de ver que foi o serviço.
  // Uma ação DECIDIDA pelo modelo não conta como executada: no replay só
  // as ferramentas-fixture que correram têm comprovativo.
  const scored: TurnInput[] = results.map((r) => ({
    user: r.user, reply: r.reply,
    tools: r.unavailable ? [] : r.evidence ?? r.tools.map((name) => ({ name, ok: true, level: "decided" as const })),
  }));
  const autonomyExpect = turns.find((x) => x.expect?.autonomy)?.expect?.autonomy;
  const autonomy = scoreConversation(scored, autonomyExpect ?? {});
  const autonomyEval = autonomyExpect ? evaluateAutonomyExpectation(autonomy, autonomyExpect) : { ok: true, missing: [] };
  const autonomyOk = autonomyEval.ok;
  const passed = !inconclusive && results.every((r) => r.passed) && autonomyOk;
  return {
    passed,
    autonomy,
    negativeControl: !!autonomyExpect?.mustFailWith?.length,
    missingExpectedFailures: autonomyEval.missing,
    turns: results,
    aqsAvg: null,
    inconclusive,
    unavailableReason: unavailableTurn?.unavailableReason ?? null,
  };
}