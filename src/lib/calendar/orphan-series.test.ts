import { describe, expect, it } from "vitest";
import { orphanMasterCandidates, backfillWindow } from "./orphan-series";

const NOW = new Date("2026-08-28T08:00:00Z");

// Caso real: 5 séries congeladas na 1ª ocorrência (Jan/Mai/Dez), ainda abertas.
const rows = [
  { id: "1", title: "Level-Up 2026", due_date: "2026-01-05T10:00:00Z", status: "agendado", external_reference: "AAM_master_1" },
  { id: "2", title: "OPS COMMAND", due_date: "2026-01-05T10:45:00Z", status: "agendado", external_reference: "AAM_master_2" },
  { id: "3", title: "M36 weekly follow up", due_date: "2026-05-25T13:30:00Z", status: "agendado", external_reference: "AAM_master_3" },
  { id: "4", title: "Reunião futura", due_date: "2026-09-30T08:00:00Z", status: "agendado", external_reference: "AAM_occ_1" },
  { id: "5", title: "Passado arquivado", due_date: "2026-02-01T09:00:00Z", status: "agendado", archived_at: "2026-02-02T09:00:00Z", external_reference: "x" },
  { id: "6", title: "Passado cancelado", due_date: "2026-02-01T09:00:00Z", status: "cancelado", external_reference: "y" },
  { id: "7", title: "Sem referência", due_date: "2026-02-01T09:00:00Z", status: "agendado", external_reference: null },
];

describe("séries recorrentes órfãs", () => {
  it("apanha só os compromissos passados, abertos e importados", () => {
    expect(orphanMasterCandidates(rows, NOW).map((r) => r.id)).toEqual(["1", "2", "3"]);
  });

  it("não toca em eventos futuros correctamente importados", () => {
    expect(orphanMasterCandidates(rows, NOW).some((r) => r.id === "4")).toBe(false);
  });

  it("agenda limpa não gera candidatos (backfill é no-op)", () => {
    expect(orphanMasterCandidates([rows[3]], NOW)).toHaveLength(0);
  });

  it("a janela de reimportação cobre o futuro próximo", () => {
    const w = backfillWindow(NOW);
    expect(w.start < NOW.toISOString()).toBe(true);
    expect(new Date(w.end).getTime() - NOW.getTime()).toBe(180 * 86_400_000);
  });
});
