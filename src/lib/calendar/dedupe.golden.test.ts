import { describe, expect, it } from "vitest";
import { chooseSurvivor, dupeKey, normalizeTitle, planDedupe } from "./dedupe";

describe("dedupe de eventos importados", () => {
  it("normaliza título com acentos e espaços", () => {
    expect(normalizeTitle("  Reunião   Com  Cliente ")).toBe("reuniao com cliente");
  });

  it("mesma hora ao minuto dá a mesma chave", () => {
    const a = dupeKey({ title: "Visita", due_date: "2026-08-26T10:00:00.000Z" });
    const b = dupeKey({ title: "visita", due_date: "2026-08-26T10:00:30.000Z" });
    expect(a).toBe(b);
  });

  it("horas diferentes não são duplicados", () => {
    const rows = [
      { id: "1", title: "Visita", due_date: "2026-08-26T10:00:00Z", external_reference: null, created_at: null },
      { id: "2", title: "Visita", due_date: "2026-08-26T11:00:00Z", external_reference: null, created_at: null },
    ];
    expect(planDedupe(rows)).toEqual([]);
  });

  it("mantém o que tem ligação ao calendário", () => {
    const rows = [
      { id: "novo", title: "Visita", due_date: "2026-08-26T10:00:00Z", external_reference: null, created_at: "2026-08-01T00:00:00Z" },
      { id: "ligado", title: "Visita", due_date: "2026-08-26T10:00:00Z", external_reference: "x", created_at: "2026-08-02T00:00:00Z", has_link: true },
    ];
    expect(chooseSurvivor(rows)?.id).toBe("ligado");
    const [plan] = planDedupe(rows);
    expect(plan?.duplicates.map((d) => d.id)).toEqual(["novo"]);
  });

  it("sem ligações, sobrevive o mais antigo", () => {
    const rows = [
      { id: "b", title: "Café", due_date: "2026-08-26T09:00:00Z", external_reference: null, created_at: "2026-08-05T00:00:00Z" },
      { id: "a", title: "Café", due_date: "2026-08-26T09:00:00Z", external_reference: null, created_at: "2026-08-01T00:00:00Z" },
    ];
    expect(chooseSurvivor(rows)?.id).toBe("a");
  });

  it("ignora registos sem título ou sem data", () => {
    const rows = [
      { id: "1", title: null, due_date: "2026-08-26T09:00:00Z", external_reference: null, created_at: null },
      { id: "2", title: "X", due_date: null, external_reference: null, created_at: null },
    ];
    expect(planDedupe(rows)).toEqual([]);
  });
});
