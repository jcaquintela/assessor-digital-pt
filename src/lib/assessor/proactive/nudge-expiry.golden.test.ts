// Golden: aviso com prazo não sai depois de expirado e o texto é o do envio.
// Caso real (14/09/2026): pré-evento escrito no domingo saiu na segunda a
// dizer "daqui a 75 min", 25 horas depois.
import { describe, expect, it } from "vitest";
import { isNudgeExpired, dayKeyFromDedupe } from "./nudge-expiry";
import { resolvePreEventText } from "../supreme/pre-event.server";
import type { BriefingEvent } from "./meeting-briefing";

const ev = (due_date: string, due_time: string): BriefingEvent => ({
  id: "e1",
  title: "Meia Maratona do Porto",
  due_date,
  due_time,
  status: "agendado",
  person_id: null,
  related_property_id: null,
  opportunity_id: null,
  event_class: "interno",
  created_at: "2026-09-12T21:05:00Z",
  briefing_sent_at: null,
});

describe("validade dos avisos proativos", () => {
  it("1. pré-evento parado 25h no horário de silêncio é descartado", () => {
    const row = {
      dedupe_key: "supreme_pre_event:b76db24a",
      created_at: "2026-09-13T06:45:01Z",
    };
    const dispatch = new Date("2026-09-14T08:00:04Z");
    expect(isNudgeExpired(row, dispatch)).toBe(true);
    // E mesmo que passasse o filtro do dia, o evento já começou.
    expect(resolvePreEventText(ev("2026-09-13T08:00:00Z", "09:00"), null, dispatch.getTime()).send).toBe(false);
  });

  it("2. pré-evento na janela normal continua a sair", () => {
    const row = {
      dedupe_key: "supreme_pre_event:b76db24a",
      created_at: "2026-09-13T06:45:01Z",
    };
    const dispatch = new Date("2026-09-13T06:50:00Z");
    expect(isNudgeExpired(row, dispatch)).toBe(false);
    const r = resolvePreEventText(ev("2026-09-13T08:00:00Z", "09:00"), null, dispatch.getTime());
    expect(r.send).toBe(true);
    expect(r.send && r.text).toContain("Meia Maratona do Porto");
  });

  it("3. resumo de fim de dia atrasado pelo silêncio é descartado", () => {
    const row = {
      dedupe_key: "supreme_evening_review:20260913",
      created_at: "2026-09-13T17:45:00Z",
    };
    expect(dayKeyFromDedupe(row.dedupe_key)).toBe("2026-09-13");
    expect(isNudgeExpired(row, new Date("2026-09-14T08:00:00Z"))).toBe(true);
    expect(isNudgeExpired(row, new Date("2026-09-13T18:00:00Z"))).toBe(false);
  });

  it("4. texto diz o tempo real no envio, não o da criação", () => {
    // Evento às 09:00 Lisboa (08:00 UTC); envio às 08:30 Lisboa → faltam 30 min.
    const r = resolvePreEventText(
      ev("2026-09-14T08:00:00Z", "09:00"),
      null,
      new Date("2026-09-14T07:30:00Z").getTime(),
    );
    expect(r.send).toBe(true);
    expect(r.send && r.text).toContain("Daqui a 30 min");
  });

  it("5. digest e conflito de outro dia também expiram", () => {
    const now = new Date("2026-09-14T08:00:00Z");
    expect(isNudgeExpired({ dedupe_key: "opportunity_digest:20260913", created_at: "2026-09-12T23:00:00Z" }, now)).toBe(true);
    expect(isNudgeExpired({ dedupe_key: "schedule_conflict:a|b:20260914", created_at: "2026-09-14T00:05:00Z" }, now)).toBe(false);
  });
});
