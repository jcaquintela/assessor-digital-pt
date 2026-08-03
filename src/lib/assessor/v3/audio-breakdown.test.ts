import { describe, it, expect } from "vitest";
import {
  coerceBreakdown,
  formatBreakdownProposal,
  formatBreakdownDone,
  worthBreakingDown,
} from "./audio-breakdown";
import { dropConfidential, looksConfidential } from "../culture/confidential";

describe("processador de áudio", () => {
  it("só separa áudios com vários assuntos", () => {
    expect(worthBreakingDown("liga à Ana")).toBe(false);
    expect(
      worthBreakingDown(
        "Estive agora no apartamento da Rua das Flores, tem 90 metros e precisa de obras na cozinha. " +
          "Tenho de ligar à dona Maria amanhã de manhã para falar do preço. " +
          "Entre nós, ela está com pressa de vender por causa do divórcio, não digas nada.",
      ),
    ).toBe(true);
  });

  it("normaliza itens e descarta lixo", () => {
    const b = coerceBreakdown({
      subject: "Rua das Flores",
      items: [
        { kind: "fact", text: "Apartamento com 90 m², cozinha a precisar de obras." },
        { kind: "follow_up", text: "Ligar à Maria sobre o preço", due_date: "2026-03-02", due_time: "10:00" },
        { kind: "note", text: "Está com pressa por motivos pessoais.", confidential: true },
        { kind: "outra_coisa", text: "ignorar" },
        { kind: "fact", text: "" },
      ],
    });
    expect(b.items).toHaveLength(3);
    expect(b.items[2]?.confidential).toBe(true);
  });

  it("propõe tudo numa só confirmação e avisa sobre a nota confidencial", () => {
    const text = formatBreakdownProposal(
      coerceBreakdown({
        items: [
          { kind: "fact", text: "Tem 90 m²." },
          { kind: "follow_up", text: "Ligar à Maria", due_date: "2026-03-02" },
          { kind: "note", text: "Está com pressa.", confidential: true },
        ],
      }),
    );
    expect(text).toContain("Separei em 3 coisas");
    expect(text).toContain("Nota confidencial");
    expect(text.match(/Guardo tudo assim\?/g)).toHaveLength(1);
  });

  it("confirma o que ficou guardado", () => {
    expect(formatBreakdownDone({ facts: 1, followUps: 1, notes: 1 }))
      .toBe("Feito — guardei 1 facto, 1 seguimento, 1 nota.");
  });
});

describe("guardião de confidencialidade", () => {
  it("nunca deixa passar notas confidenciais para texto externo", () => {
    const rows = [
      { summary: "Pediu a planta.", is_confidential: false },
      { summary: "Está a divorciar-se.", is_confidential: true },
    ];
    expect(dropConfidential(rows)).toEqual([rows[0]]);
  });

  it("reconhece marcações do consultor", () => {
    expect(looksConfidential("isto é confidencial, não partilhes")).toBe(true);
    expect(looksConfidential("marca visita para sexta")).toBe(false);
  });
});