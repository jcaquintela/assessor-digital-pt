import { describe, expect, it } from "vitest";
import { chooseSurvivor } from "./dedupe";
import { normalizeOutlook, outlookEventsFromDelta } from "./sync.server";
import { isSeriesMaster, recurrenceType, seriesMasterId } from "./outlook-recurrence";

// Payload real (simplificado) que gerou os 2 pares duplicados de 25/08:
// para cada série, o delta trouxe o seriesMaster e a ocorrência correspondente.
const MASTER_A = "AAENAAB6U3xP__master_AATr0A-JAAA=";
const OCC_A = "FRAAgI3we791lA__occ__AAE69APyQAAEA==";
const MASTER_B = "AAENAAB6U3xP__master_AATr0A-KAAA=";
const OCC_B = "FRAAgI3we791lA__occ__AAE69APyQAAEB==";

const payloadReal = [
  {
    id: MASTER_A,
    type: "seriesMaster",
    subject: "Academia StartUp Hub Directors Zome PT",
    start: { dateTime: "2026-09-01T10:00:00.0000000", timeZone: "UTC" },
    lastModifiedDateTime: "2026-08-25T16:58:12Z",
  },
  {
    id: OCC_A,
    type: "occurrence",
    seriesMasterId: MASTER_A,
    subject: "Academia StartUp Hub Directors Zome PT",
    start: { dateTime: "2026-09-01T10:00:00.0000000", timeZone: "UTC" },
    lastModifiedDateTime: "2026-08-25T16:58:13Z",
  },
  {
    id: MASTER_B,
    type: "seriesMaster",
    subject: "Academia StartUp Business Coach Zome PT",
    start: { dateTime: "2026-09-03T10:00:00.0000000", timeZone: "UTC" },
    lastModifiedDateTime: "2026-08-25T16:58:12Z",
  },
  {
    id: OCC_B,
    type: "occurrence",
    seriesMasterId: MASTER_B,
    subject: "Academia StartUp Business Coach Zome PT",
    start: { dateTime: "2026-09-03T10:00:00.0000000", timeZone: "UTC" },
    lastModifiedDateTime: "2026-08-25T16:58:13Z",
  },
];

describe("recorrência Outlook na importação", () => {
  it("caso real: só as ocorrências entram, o master nunca é importado", () => {
    const events = outlookEventsFromDelta(payloadReal);
    expect(events.map((e) => e.id)).toEqual([OCC_A, OCC_B]);
    expect(events.every((e) => e.recurrenceType === "occurrence")).toBe(true);
  });

  it("payload real não gera duplicados (título + minuto únicos)", () => {
    const events = outlookEventsFromDelta(payloadReal);
    const keys = events.map((e) => `${e.title}|${e.startIso}`);
    expect(new Set(keys).size).toBe(events.length);
  });

  it("excepção da série é importada com o horário alterado", () => {
    const events = outlookEventsFromDelta([
      { id: MASTER_A, type: "seriesMaster", subject: "Reunião", start: { dateTime: "2026-09-01T10:00:00", timeZone: "UTC" } },
      { id: "occ-1", type: "occurrence", seriesMasterId: MASTER_A, subject: "Reunião", start: { dateTime: "2026-09-08T10:00:00", timeZone: "UTC" } },
      { id: "exc-1", type: "exception", seriesMasterId: MASTER_A, subject: "Reunião", start: { dateTime: "2026-09-15T13:00:00", timeZone: "UTC" } },
    ]);
    expect(events.map((e) => e.id)).toEqual(["occ-1", "exc-1"]);
    const exc = events.find((e) => e.id === "exc-1")!;
    expect(exc.recurrenceType).toBe("exception");
    expect(exc.startIso).toBe("2026-09-15T13:00:00.000Z");
    expect(exc.seriesMasterId).toBe(MASTER_A);
  });

  it("evento simples continua a ser importado", () => {
    const [ev] = outlookEventsFromDelta([
      { id: "s1", subject: "Café", start: { dateTime: "2026-09-01T09:00:00", timeZone: "UTC" } },
    ]);
    expect(ev?.recurrenceType).toBe("singleInstance");
    expect(ev?.seriesMasterId).toBeNull();
  });

  it("a ocorrência guarda o id da série para o link", () => {
    const ev = normalizeOutlook(payloadReal[1]);
    expect(ev.seriesMasterId).toBe(MASTER_A);
    expect(ev.recurrenceType).toBe("occurrence");
    // e o master é reconhecido como tal
    expect(isSeriesMaster(payloadReal[0])).toBe(true);
    expect(recurrenceType(payloadReal[0])).toBe("seriesMaster");
    expect(seriesMasterId(payloadReal[0])).toBeNull();
  });

  it("em colisão, a ocorrência sobrevive ao master", () => {
    const survivor = chooseSurvivor([
      { id: "master-row", title: "Academia", due_date: "2026-09-01T10:00:00Z", external_reference: MASTER_A, created_at: "2026-08-25T16:58:12Z", has_link: true },
      { id: "occ-row", title: "Academia", due_date: "2026-09-01T10:00:00Z", external_reference: OCC_A, created_at: "2026-08-25T16:58:13Z", has_link: true, is_occurrence: true },
    ]);
    expect(survivor?.id).toBe("occ-row");
  });
});
