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

export interface GoldenExpect {
  action?: "act" | "ask" | "acknowledge" | "do_nothing" | "search_more";
  tool?: string;
  reply_contains?: string[];
  must_not_contain?: string[];
}

export interface GoldenTurn {
  user: string;
  expect?: GoldenExpect;
}

export interface GoldenTurnResult {
  turn: number;
  user: string;
  reply: string;
  action: string;
  tools: string[];
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
): Promise<GoldenRunResult> {
  const results: GoldenTurnResult[] = [];
  const historyLines: string[] = [];
  const name = sanitizeAssessorName(assessorName ?? "") || ASSESSOR_NAME_DEFAULT;
  const ymd = nowLisbonYmd();
  const human = nowLisbonHuman();

  for (let i = 0; i < turns.length; i++) {
    const raw = turns[i];
    const t: GoldenTurn = { ...raw, user: renderGoldenText(raw.user) };
    // Router determinístico — replica o comportamento do runtime real
    // para agenda e "sim" sem contexto, sem depender da IA.
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
      continue;
    }

    const failures = evaluateTurn(reply, decideR.decision.action, tools, t.expect);
    results.push({
      turn: i + 1, user: t.user, reply,
      action: decideR.decision.action, tools,
      passed: failures.length === 0, failures,
    });

    historyLines.push(`consultor: ${t.user}`);
    historyLines.push(`assessor: ${reply}`);
  }

  const unavailableTurn = results.find((r) => r.unavailable);
  const inconclusive = !!unavailableTurn;
  // Um guião com turnos inconclusivos não passa nem reprova por
  // comportamento — quem lê o resultado tem de ver que foi o serviço.
  const passed = !inconclusive && results.every((r) => r.passed);
  return {
    passed,
    turns: results,
    aqsAvg: null,
    inconclusive,
    unavailableReason: unavailableTurn?.unavailableReason ?? null,
  };
}