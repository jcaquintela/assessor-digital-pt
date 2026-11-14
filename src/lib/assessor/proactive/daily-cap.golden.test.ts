// Golden: no máximo 1 intervenção proativa NÃO solicitada por dia e por conta
// (por defeito), a de maior prioridade. Briefings não contam, mas nunca se acumulam.
import { describe, expect, it } from "vitest";
import {
  applyDailyCap, isInQuietHours, isScheduledNudge, nudgePriority,
  DEFAULT_MAX_UNSOLICITED_PER_DAY, SCHEDULED_PREFIXES,
} from "./daily-cap";
import { PRE_EVENT_DEDUPE_PREFIX } from "./nudge-expiry";
import { DAILY_BRIEFING_PREFIX, EVENING_REVIEW_PREFIX, CAP_NOTICE_PREFIX } from "../supreme/briefing.server";

const row = (id: string, kind: string, dedupe: string, priority?: number) =>
  ({ id, user_id: "u1", kind, dedupe_key: dedupe, priority: priority ?? null, created_at: `2026-11-17T09:0${id.length}:00Z` });

describe("teto diário de não solicitados", () => {
  it("o defeito é 1", () => {
    expect(DEFAULT_MAX_UNSOLICITED_PER_DAY).toBe(1);
  });

  it("com 3 candidatos sai só o de maior prioridade; os outros ficam calados", () => {
    const d = applyDailyCap([
      row("a", "followup_overdue", "followup_overdue:f1:20261117"),
      row("b", "deal_stalled", "opportunity:negocio_arrefecer:d1:20261117", 90),
      row("c", "opportunity_match", "opportunity:match_lead_imovel:l1:p1:20261117", 58),
    ], []);
    expect(d.send.map((r) => r.id)).toEqual(["b"]);
    expect(d.drop.map((x) => [x.row.id, x.reason]).sort()).toEqual([["a", "daily_cap"], ["c", "daily_cap"]]);
  });

  it("se já saiu um não solicitado hoje, mais nenhum sai", () => {
    const d = applyDailyCap([row("a", "deal_stalled", "opportunity:negocio_arrefecer:d2:20261117", 95)], [
      "followup_overdue:f1:20261117",
    ]);
    expect(d.send).toEqual([]);
    expect(d.drop[0].reason).toBe("daily_cap");
  });

  it("briefing da manhã não gasta a vaga, mas não sai duas vezes no mesmo dia", () => {
    const fresh = applyDailyCap([
      row("b", "consultant_silence", `${DAILY_BRIEFING_PREFIX}20261117`),
      row("o", "deal_stalled", "opportunity:negocio_arrefecer:d1:20261117", 90),
    ], []);
    expect(fresh.send.map((r) => r.id)).toEqual(["b", "o"]);

    const again = applyDailyCap([row("b2", "consultant_silence", `${DAILY_BRIEFING_PREFIX}20261117`)], [
      `${DAILY_BRIEFING_PREFIX}20261117`,
    ]);
    expect(again.send).toEqual([]);
    expect(again.drop[0].reason).toBe("already_sent_today");
  });

  it("o teto é configurável (2 e 0)", () => {
    const rows = [
      row("a", "deal_stalled", "x:a", 90),
      row("b", "opportunity_match", "x:b", 70),
      row("c", "person_silence", "x:c"),
    ];
    expect(applyDailyCap(rows, [], 2).send.map((r) => r.id)).toEqual(["a", "b"]);
    expect(applyDailyCap(rows, [], 0).send).toEqual([]);
  });

  it("sem prioridade calculada, negócio parado vale mais do que silêncio do consultor", () => {
    expect(nudgePriority(row("a", "deal_stalled", "k"))).toBeGreaterThan(nudgePriority(row("b", "consultant_silence", "k")));
  });

  it("os prefixos agendados acompanham as constantes reais", () => {
    for (const p of [DAILY_BRIEFING_PREFIX, EVENING_REVIEW_PREFIX, CAP_NOTICE_PREFIX, PRE_EVENT_DEDUPE_PREFIX]) {
      expect(SCHEDULED_PREFIXES).toContain(p);
    }
    expect(isScheduledNudge({ dedupe_key: "opportunity:negocio_arrefecer:d1:20261117" })).toBe(false);
  });

  it("horário de silêncio atravessa a meia-noite", () => {
    expect(isInQuietHours("22:00", "07:30", "23:15")).toBe(true);
    expect(isInQuietHours("22:00", "07:30", "06:00")).toBe(true);
    expect(isInQuietHours("22:00", "07:30", "10:00")).toBe(false);
    expect(isInQuietHours("12:00", "14:00", "13:00")).toBe(true);
  });
});
