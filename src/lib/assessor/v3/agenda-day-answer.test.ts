// Golden do caso real de 31/08: pedido de um dia concreto respondido com a
// semana inteira e sem datas nas linhas.
import { describe, expect, it } from "vitest";
import { formatQueryResults } from "./query-results";
import { resolveDateTimeFromText } from "../date-resolver";

const NOW = new Date("2026-08-28T09:00:00Z"); // sexta, 28/08

function agendaResult(data: unknown) {
  return [{ name: "search_agenda", ok: true, data } as any];
}

describe("pedido de um dia concreto", () => {
  it("'dia 31' resolve para 31/08 e não para a semana", () => {
    expect(resolveDateTimeFromText("quero de segunda-feira dia 31 apenas", NOW)?.date).toBe("2026-08-31");
    expect(resolveDateTimeFromText("31 de agosto", NOW)?.date).toBe("2026-08-31");
    expect(resolveDateTimeFromText("31/08", NOW)?.date).toBe("2026-08-31");
  });

  it("caso real: 6 compromissos do dia 31, com o dia no cabeçalho", () => {
    const items = [
      { title: "Level-Up 2026", due_date: "2026-08-31T09:00:00Z", due_time: "10:00:00" },
      { title: "OPS COMMAND", due_date: "2026-08-31T09:45:00Z", due_time: "10:45:00" },
      { title: "Propdesk", due_date: "2026-08-31T10:30:00Z", due_time: "11:30:00" },
      { title: "APEX Recrutamento", due_date: "2026-08-31T11:00:00Z", due_time: "12:00:00" },
      { title: "Almoço", due_date: "2026-08-31T12:00:00Z", due_time: "13:00:00" },
      { title: "M36 weekly follow up", due_date: "2026-08-31T14:00:00Z", due_time: "15:00:00" },
    ];
    const out = formatQueryResults(agendaResult({
      range: { startIso: "2026-08-31", endIso: "2026-08-31", label: "segunda-feira, 31/08" },
      items,
    }))!;
    expect(out).toContain("segunda-feira, 31/08");
    expect(out).toContain("6 compromissos");
    expect(out).toContain("Level-Up 2026");
    // Um só dia: as linhas não repetem a data.
    expect(out.match(/31\/08/g)!.length).toBe(1);
  });

  it("dia sem compromissos responde com o dia pedido", () => {
    const out = formatQueryResults(agendaResult({
      range: { startIso: "2026-09-01", endIso: "2026-09-01", label: "terça-feira, 01/09" },
      items: [],
    }));
    expect(out).toBe("Não tens compromissos para terça-feira, 01/09.");
  });

  it("lista de vários dias mostra a data em cada linha", () => {
    const out = formatQueryResults(agendaResult({
      range: { startIso: "2026-08-31", endIso: "2026-09-06", label: "próxima semana" },
      items: [
        { title: "Level-Up 2026", due_date: "2026-08-31T09:00:00Z", due_time: "10:00:00" },
        { title: "Visita T2", due_date: "2026-09-02T09:00:00Z", due_time: "10:00:00" },
      ],
    }))!;
    expect(out).toContain("31/08");
    expect(out).toContain("02/09");
  });
});
