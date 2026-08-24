// Golden tests dos 4 casos reais do classificador pergunta/tarefa (24/08).
import { describe, it, expect } from "vitest";
import {
  detectAgendaQuery,
  detectEventNameQuery,
  rankEventsByTitle,
} from "./deterministic.server";
import { detectReadRequest, detectContactReadQuery } from "./read-intent";

describe("caso 1 — sufixo conversacional depois do '?'", () => {
  it("'Agenda hoje como está? Estou na Espanha' → agenda de hoje", () => {
    expect(detectAgendaQuery("Agenda hoje como está? Estou na Espanha")).toBe("today");
  });

  it("outros sufixos não partem o detetor", () => {
    expect(detectAgendaQuery("Como está a minha agenda? Obrigado.")).toBe("today");
    expect(detectAgendaQuery("Que reuniões tenho amanhã? Já vou a caminho")).toBe("tomorrow");
  });

  it("sem sufixo mantém o comportamento antigo", () => {
    expect(detectAgendaQuery("Agenda hoje como está?")).toBe("today");
  });
});

describe("caso 2 — 'Que temos hoje?'", () => {
  it("é consulta de agenda de hoje", () => {
    expect(detectAgendaQuery("Que temos hoje?")).toBe("today");
    expect(detectAgendaQuery("Que temos amanhã?")).toBe("tomorrow");
    expect(detectAgendaQuery("Que tens esta semana?")).toBe("week");
  });

  it("leitura sem assunto mas com período aponta a search_agenda", () => {
    const r = detectReadRequest("Que temos hoje?");
    expect(r.pure).toBe(true);
    expect(r.tool).toBe("search_agenda");
    expect(r.arguments).toEqual({ period: "today" });
  });
});

describe("caso 3 — 'Que dia a Marta Santana' (sem verbo)", () => {
  it("extrai o assunto do compromisso", () => {
    expect(detectEventNameQuery("Que dia a Marta Santana")).toBe("Marta Santana");
  });

  it("encontra o evento certo por título", () => {
    const rows = [
      { title: "Reunião equipa" },
      { title: "Visita Marta Santana — Rua das Flores" },
    ];
    expect(rankEventsByTitle("Marta Santana", rows)[0]!.title).toContain("Marta Santana");
  });

  it("com verbo continua a funcionar", () => {
    expect(detectEventNameQuery("Que dia é a Marta Santana?")).toBe("Marta Santana");
    expect(detectEventNameQuery("Quando é a reunião de teste Outlook?")).toBe("reunião de teste Outlook");
  });

  it("pedido de marcação não é consulta", () => {
    expect(detectEventNameQuery("Que dia marcamos a visita?")).toBeNull();
    expect(detectEventNameQuery("Que dia queres a visita?")).toBeNull();
  });
});

describe("caso 4 — 'Manda o contacto do Paulo Lopes' é leitura", () => {
  it("extrai o nome", () => {
    expect(detectContactReadQuery("Manda o contacto do Paulo Lopes")).toBe("Paulo Lopes");
    expect(detectContactReadQuery("Envia-me o número da Marta Santana")).toBe("Marta Santana");
    expect(detectContactReadQuery("Passa-me a morada do Sr. Duarte")).toBe("Duarte");
  });

  it("não é bloqueado como escrita", () => {
    const r = detectReadRequest("Manda o contacto do Paulo Lopes");
    expect(r.pure).toBe(true);
    expect(r.tool).toBe("search_people");
    expect(r.arguments).toEqual({ query: "Paulo Lopes" });
  });
});

describe("regressão — WRITE_RE continua a bloquear acções reais", () => {
  it.each([
    "Manda uma mensagem ao Paulo Lopes",
    "Envia um email ao Paulo Lopes",
    "Manda o link da casa ao Paulo",
    "Marca visita com o Paulo Lopes amanhã",
    "Regista o contacto do Paulo Lopes",
  ])("bloqueia: %s", (t) => {
    expect(detectContactReadQuery(t)).toBeNull();
    expect(detectReadRequest(t).pure).toBe(false);
  });

  it("declarações com hora não são consulta de agenda", () => {
    expect(detectAgendaQuery("Amanhã tenho uma visita às 14:30. Recorda-me pela manhã.")).toBeNull();
  });
});
