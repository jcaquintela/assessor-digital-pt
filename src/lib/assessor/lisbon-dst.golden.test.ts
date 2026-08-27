// Golden: a fonte única de timezone trata a mudança de hora corretamente.
//
// Estes casos cobrem as três funções unificadas no Lote 1
// (lisbonInstant, lisbonLocalToUtcIso, lisbonHhMm) e substituem as garantias
// que estavam espalhadas pelas cópias eliminadas.
import { describe, expect, it } from "vitest";
import {
  lisbonInstant,
  lisbonLocalToUtcIso,
  lisbonHhMm,
  lisbonYmd,
  endOfLisbonDayIso,
} from "./lisbon-day";

describe("conversão local Lisboa → UTC", () => {
  it("verão (UTC+1): 13:40 = 12:40Z", () => {
    expect(lisbonLocalToUtcIso("2026-07-29", "13:40")).toBe("2026-07-29T12:40:00.000Z");
  });

  it("inverno (UTC+0): 13:40 = 13:40Z", () => {
    expect(lisbonLocalToUtcIso("2026-01-15", "13:40")).toBe("2026-01-15T13:40:00.000Z");
  });

  it("meia-noite de Lisboa não é meia-noite UTC no verão", () => {
    expect(lisbonLocalToUtcIso("2026-08-26", "00:00")).toBe("2026-08-25T23:00:00.000Z");
    expect(lisbonLocalToUtcIso("2026-01-20", "00:00")).toBe("2026-01-20T00:00:00.000Z");
  });
});

describe("mudança de hora (DST)", () => {
  // Portugal continental: último domingo de março e de outubro.
  it("29/03/2026 — antes da transição ainda é UTC+0", () => {
    expect(lisbonLocalToUtcIso("2026-03-29", "00:30")).toBe("2026-03-29T00:30:00.000Z");
  });

  it("29/03/2026 — depois da transição já é UTC+1", () => {
    expect(lisbonLocalToUtcIso("2026-03-29", "10:00")).toBe("2026-03-29T09:00:00.000Z");
  });

  it("25/10/2026 — depois da transição volta a UTC+0", () => {
    expect(lisbonLocalToUtcIso("2026-10-25", "10:00")).toBe("2026-10-25T10:00:00.000Z");
  });

  it("lisbonInstant concorda com lisbonLocalToUtcIso nos dois lados da transição", () => {
    for (const [ymd, hh, mm] of [["2026-03-29", 10, 0], ["2026-10-25", 10, 0]] as const) {
      expect(new Date(lisbonInstant(ymd, hh, mm)).toISOString())
        .toBe(lisbonLocalToUtcIso(ymd, `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`));
    }
  });

  it("ida e volta: a hora escrita é a hora lida de volta, mesmo nos dias de transição", () => {
    for (const ymd of ["2026-03-29", "2026-10-25", "2026-07-29", "2026-01-15"]) {
      for (const hhmm of ["09:00", "13:40", "21:00"]) {
        expect(lisbonHhMm(lisbonLocalToUtcIso(ymd, hhmm))).toBe(hhmm);
        expect(lisbonYmd(lisbonLocalToUtcIso(ymd, hhmm))).toBe(ymd);
      }
    }
  });

  it("fim do dia de Lisboa continua correto no dia da transição", () => {
    expect(endOfLisbonDayIso(new Date("2026-10-25T12:00:00Z")))
      .toBe("2026-10-25T23:59:59.999Z");
  });
});

describe("hora local de Lisboa (HH:MM)", () => {
  it("verão: 08:00Z = 09:00", () => {
    expect(lisbonHhMm("2026-08-12T08:00:00Z")).toBe("09:00");
  });

  it("inverno: 08:00Z = 08:00", () => {
    expect(lisbonHhMm("2026-01-12T08:00:00Z")).toBe("08:00");
  });

  it("meia-noite sai 00:00, nunca 24:00", () => {
    expect(lisbonHhMm("2026-01-12T00:00:00Z")).toBe("00:00");
  });

  it("os 3 locales usados antes (en-CA/en-GB/pt-PT) dão o mesmo HH:MM", () => {
    const iso = "2026-08-12T08:00:00Z";
    for (const locale of ["en-CA", "en-GB", "pt-PT"]) {
      const legacy = new Intl.DateTimeFormat(locale, {
        timeZone: "Europe/Lisbon", hour12: false, hour: "2-digit", minute: "2-digit",
      }).format(new Date(iso));
      expect(legacy).toBe(lisbonHhMm(iso));
    }
  });

  it("os 3 locales dão o mesmo YMD através do helper único", () => {
    const iso = "2026-08-09T21:00:00Z";
    for (const locale of ["en-CA", "en-GB", "pt-PT"]) {
      const p = new Intl.DateTimeFormat(locale, {
        timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit",
      }).formatToParts(new Date(iso));
      const m: Record<string, string> = {};
      for (const x of p) m[x.type] = x.value;
      expect(`${m.year}-${m.month}-${m.day}`).toBe(lisbonYmd(iso));
    }
  });

  it("valor inválido devolve string vazia em vez de rebentar", () => {
    expect(lisbonHhMm("não é data")).toBe("");
  });
});

// --- Lote 2: os pontos de entrada que passaram a consumir a fonte única ---
// Cada um destes módulos tinha a sua própria cópia do cálculo de "que dia é
// hoje em Lisboa". O que se garante aqui é que, agora que todos consomem
// lisbonYmd, continuam a concordar entre si e com o helper — incluindo no
// instante crítico das 23:30 UTC do verão, em que o dia de Lisboa já virou.
import { nowLisbonYmd } from "./v3/reminders.server";
import { todayLisbonYmd as breakdownToday } from "./v3/audio-breakdown.server";
import { todayLisbonYmd as themesToday } from "./v3/audio-themes.server";
import { lisbonNow } from "./v3/tool-args";
import { lisbonParts } from "./agenda";
import { lisbonIsoWeek } from "./proactive/empty-day";
import { lisbonDate, lisbonHour } from "@/lib/admin/digest.server";
import { lisbonYmdFromIso } from "./event-subject";
import { mentorFollowUpDueDate } from "./supreme/mentor-followup";

describe("pontos de entrada unificados (Lote 2)", () => {
  const INSTANTES = [
    "2026-08-09T23:30:00Z", // verão: em Lisboa já é dia 10
    "2026-01-09T23:30:00Z", // inverno: em Lisboa ainda é dia 9
    "2026-03-29T00:30:00Z", // dia da mudança para hora de verão
    "2026-10-25T00:30:00Z", // dia da mudança para hora de inverno
  ];

  it("todos concordam com lisbonYmd no mesmo instante", () => {
    for (const iso of INSTANTES) {
      const d = new Date(iso);
      const esperado = lisbonYmd(d);
      expect(nowLisbonYmd(d)).toBe(esperado);
      expect(lisbonNow(d).date).toBe(esperado);
      expect(lisbonParts(d).ymd).toBe(esperado);
      expect(lisbonDate(d)).toBe(esperado);
      expect(lisbonYmdFromIso(iso)).toBe(esperado);
      expect(mentorFollowUpDueDate(0, d)).toBe(esperado);
    }
  });

  it("23:30Z de agosto já é o dia seguinte em Lisboa", () => {
    expect(nowLisbonYmd(new Date("2026-08-09T23:30:00Z"))).toBe("2026-08-10");
    expect(nowLisbonYmd(new Date("2026-01-09T23:30:00Z"))).toBe("2026-01-09");
  });

  it("os helpers sem argumento continuam a devolver o dia de hoje em Lisboa", () => {
    const hoje = lisbonYmd(new Date());
    expect(breakdownToday()).toBe(hoje);
    expect(themesToday()).toBe(hoje);
  });

  it("digest: hora local coerente com lisbonHhMm", () => {
    expect(lisbonHour(new Date("2026-08-09T23:30:00Z"))).toBe(0);
    expect(lisbonHour(new Date("2026-01-09T23:30:00Z"))).toBe(23);
  });

  it("dia-da-semana derivado do YMD é o real (10/08/2026 = segunda)", () => {
    expect(lisbonParts(new Date("2026-08-09T23:30:00Z")).weekday).toBe(1);
    expect(lisbonParts(new Date("2026-08-09T12:00:00Z")).weekday).toBe(0);
  });

  it("semana ISO mantém o formato próprio por cima do YMD único", () => {
    expect(lisbonIsoWeek(new Date("2026-01-01T12:00:00Z"))).toBe(1);
    expect(lisbonIsoWeek(new Date("2026-08-09T23:30:00Z")))
      .toBe(lisbonIsoWeek(new Date("2026-08-10T09:00:00Z")));
  });

  it("mentorFollowUpDueDate soma dias sobre o dia de Lisboa", () => {
    expect(mentorFollowUpDueDate(3, new Date("2026-08-09T23:30:00Z"))).toBe("2026-08-13");
  });
});
