import { describe, it, expect } from "vitest";
import {
  detectAgendaDateQuery,
  formatAgendaDateReply,
  detectEventNameQuery,
  rankEventsByTitle,
  formatEventFoundReply,
  detectAgendaQuery,
  formatDayLabel,
} from "./deterministic.server";

// Sábado, 15 de Agosto de 2026 (12:00 Lisboa)
const NOW = new Date("2026-08-15T11:00:00Z");

describe("pesquisa de evento por nome", () => {
  it("Golden 1 — 'Quando é a reunião de teste Outlook?' encontra o evento", () => {
    const subject = detectEventNameQuery("Quando é a reunião de teste Outlook?");
    expect(subject).toBe("reunião de teste Outlook");
    const rows = [
      { id: "1", title: "Reunião de teste Outlook", due_date: "2026-08-18", due_time: "15:00:00" },
      { id: "2", title: "Visita T2 Canelas", due_date: "2026-08-17", due_time: "10:00:00" },
    ];
    const hits = rankEventsByTitle(subject!, rows);
    expect(hits).toHaveLength(1);
    const reply = formatEventFoundReply(subject!, hits);
    expect(reply).toContain("terça-feira, 18/08");
    expect(reply).toContain("15h00");
  });

  it("responde claramente quando não existe", () => {
    const s = detectEventNameQuery("Quando é a visita à Rua das Flores?")!;
    expect(formatEventFoundReply(s, rankEventsByTitle(s, []))).toContain("Não encontrei");
  });

  it("não intercepta pedidos de criação", () => {
    expect(detectEventNameQuery("Marca a reunião de teste Outlook para terça")).toBeNull();
  });
});

describe("agenda por dia nomeado", () => {
  it("Golden 2 — 'Que compromissos tenho na terça-feira?'", () => {
    const q = detectAgendaDateQuery("Que compromissos tenho na terça-feira?", NOW);
    expect(q?.date).toBe("2026-08-18");
    expect(q?.label).toBe("terça-feira, 18/08");
    const reply = formatAgendaDateReply(q!.label, [
      { title: "Reunião de teste Outlook", due_time: "15:00:00" },
    ]);
    expect(reply).toContain("terça-feira, 18/08");
    expect(reply).toContain("15h00");
  });

  it("Golden 3 — dia sem eventos responde de forma clara", () => {
    const q = detectAgendaDateQuery("Que compromissos tenho na sexta-feira?", NOW)!;
    expect(q.date).toBe("2026-08-21");
    expect(formatAgendaDateReply(q.label, [])).toBe("Não tens compromissos para sexta-feira, 21/08.");
  });

  it("Golden 4 — 'depois de amanhã' também é reconhecido", () => {
    expect(detectAgendaDateQuery("Que reuniões tenho depois de amanhã?", NOW)?.date).toBe("2026-08-17");
  });

  it("não altera o fast path de hoje/amanhã", () => {
    expect(detectAgendaDateQuery("O que tenho hoje?", NOW)).toBeNull();
    expect(detectAgendaDateQuery("Que tenho amanhã?", NOW)).toBeNull();
    expect(detectAgendaQuery("O que tenho hoje?")).toBe("today");
    expect(detectAgendaQuery("Que tenho amanhã?")).toBe("tomorrow");
  });

  it("não intercepta pedidos de criação com dia nomeado", () => {
    expect(detectAgendaDateQuery("Marca visita na terça-feira às 15h", NOW)).toBeNull();
  });

  it("formata o rótulo do dia", () => {
    expect(formatDayLabel("2026-08-18")).toBe("terça-feira, 18/08");
  });
});
