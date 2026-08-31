// Golden tests — consolidação dos conflitos no briefing matinal (7 dias) e
// preservação do lembrete de proximidade (45–75 min).

import { describe, it, expect } from "vitest";
import { findConflicts, conflictsWithinDays, BRIEFING_CONFLICT_DAYS } from "./conflicts";
import { composeEnrichedBriefing, type BriefingPriority } from "@/lib/assessor/proactive/briefing-enriched";
import { isPreEventDue } from "@/lib/assessor/supreme/pre-event";

const NOW = new Date("2026-09-01T09:00:00Z");

function isoIn(days: number, hhmm: string) {
  const d = new Date(NOW.getTime() + days * 864e5);
  return { due_date: `${d.toISOString().slice(0, 10)}T00:00:00Z`, due_time: hhmm };
}

function pairAt(days: number, suffix = "") {
  return findConflicts([
    { id: `a${days}${suffix}`, title: `Visita ${days}${suffix}`, ...isoIn(days, "10:00"), duration_minutes: 60 },
    { id: `b${days}${suffix}`, title: `Reunião ${days}${suffix}`, ...isoIn(days, "10:30"), duration_minutes: 60 },
  ]);
}

const PRIORITIES: BriefingPriority[] = [
  { subject_type: "follow_up", subject_id: "p1", action: "Ligar ao Manuel", entity_label: "Manuel", priority_score: 90 },
];

describe("conflitos no briefing matinal", () => {
  it("1) conflito a 3 dias entra no briefing (e sai do caminho do aviso separado)", () => {
    const pairs = pairAt(3);
    expect(pairs).toHaveLength(1);
    const inBriefing = conflictsWithinDays(pairs, BRIEFING_CONFLICT_DAYS, NOW);
    expect(inBriefing).toHaveLength(1);
    const text = composeEnrichedBriefing(PRIORITIES, { now: NOW, conflicts: pairs });
    expect(text).toContain("Conflitos a resolver");
    expect(text).toContain("sobrepõem-se");
  });

  it("2) conflito a 10 dias não entra no briefing e fica para o aviso autónomo", () => {
    const pairs = pairAt(10);
    expect(pairs).toHaveLength(1);
    expect(conflictsWithinDays(pairs, BRIEFING_CONFLICT_DAYS, NOW)).toHaveLength(0);
    const text = composeEnrichedBriefing(PRIORITIES, { now: NOW, conflicts: pairs });
    expect(text).not.toContain("Conflitos a resolver");
  });

  it("3) muitos conflitos respeitam o limite de caracteres e o corte progressivo", () => {
    const pairs = [...pairAt(1, "x"), ...pairAt(2, "y"), ...pairAt(3, "z"), ...pairAt(4, "w")];
    const full = composeEnrichedBriefing(PRIORITIES, { now: NOW, conflicts: pairs });
    expect(full.length).toBeLessThanOrEqual(1200);
    const tight = composeEnrichedBriefing(PRIORITIES, { now: NOW, conflicts: pairs, maxChars: 120 });
    expect(tight.length).toBeLessThanOrEqual(120);
    expect(tight).not.toContain("Conflitos a resolver");
  });

  it("4) lembrete de proximidade continua a disparar, independente da consolidação", () => {
    const ev = {
      id: "e1",
      title: "Level-Up 2026",
      due_date: "2026-09-01T00:00:00Z",
      due_time: "10:00",
      type: "outro",
    } as any;
    const nowMs = new Date("2026-09-01T08:05:00Z").getTime(); // 09:05 Lisboa → 55 min antes
    expect(isPreEventDue(ev, nowMs)).toBe(true);
  });

  it("5) sem conflitos nos próximos 7 dias, a secção não aparece", () => {
    const text = composeEnrichedBriefing(PRIORITIES, { now: NOW, conflicts: [] });
    expect(text).not.toContain("Conflitos a resolver");
  });
});
