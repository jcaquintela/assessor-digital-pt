// Golden Conversations — replay de THINK+DECIDE (sem ACT, sem persistência),
// para regressão zero em respostas canónicas.

import { observe } from "./observe.server";
import { think } from "./think.server";
import { decide } from "./decide.server";
import { sanitizeReply, enforceHumanTone, enforceSingleQuestion } from "../culture/sanitize";
import { sanitizeAssessorName, ASSESSOR_NAME_DEFAULT } from "../assessor-name";
import type { SearchResults } from "./types";

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
}

export interface GoldenRunResult {
  passed: boolean;
  turns: GoldenTurnResult[];
  aqsAvg: number | null;
}

function nowLisbonYmd(): string {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const m: Record<string, string> = {};
  for (const x of p) m[x.type] = x.value;
  return `${m.year}-${m.month}-${m.day}`;
}
function nowLisbonHuman(): string {
  return new Intl.DateTimeFormat("pt-PT", {
    timeZone: "Europe/Lisbon", weekday: "long", year: "numeric", month: "long",
    day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date());
}

function evaluateTurn(reply: string, action: string, tools: string[], expect?: GoldenExpect): string[] {
  const failures: string[] = [];
  if (!expect) return failures;
  if (expect.action && expect.action !== action) failures.push(`action:${action}≠${expect.action}`);
  if (expect.tool && !tools.includes(expect.tool)) failures.push(`missing_tool:${expect.tool}`);
  const low = reply.toLowerCase();
  for (const s of expect.reply_contains ?? []) if (!low.includes(s.toLowerCase())) failures.push(`missing:${s}`);
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
  const emptySearches: SearchResults = {};
  const ymd = nowLisbonYmd();
  const human = nowLisbonHuman();

  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    const obs = observe(t.user);
    const historyPreview = historyLines.slice(-6).join("\n");
    const thinkR = await think({ content: t.user, observations: obs, historyPreview });
    const decideR = await decide({
      content: t.user, observations: obs, hypotheses: thinkR.output.hypotheses,
      searches: emptySearches, historyPreview,
      assessorName: name, userFirstName: "",
      nowLisbonYmd: ymd, nowLisbonHuman: human,
    });

    let reply = sanitizeReply(decideR.decision.natural_reply);
    reply = enforceHumanTone(reply, { actionExecutedOk: false });
    if (decideR.decision.action === "ask") reply = enforceSingleQuestion(reply);

    const tools = decideR.decision.tool_calls.map((c) => c.name);
    const failures = evaluateTurn(reply, decideR.decision.action, tools, t.expect);
    results.push({
      turn: i + 1, user: t.user, reply,
      action: decideR.decision.action, tools,
      passed: failures.length === 0, failures,
    });

    historyLines.push(`consultor: ${t.user}`);
    historyLines.push(`assessor: ${reply}`);
  }

  const passed = results.every((r) => r.passed);
  return { passed, turns: results, aqsAvg: null };
}