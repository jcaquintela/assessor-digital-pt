// Golden: "Como está o meu dia?" é leitura directa, não vai para Diversos.
//
// Casos reais (08/08 08:35 e 11/08 09:20, WhatsApp): a pergunta não batia
// nenhum padrão determinístico, a IA respondia de cor sem chamar qualquer
// ferramenta (tool_calls=[]) e a rede de segurança arquivava tudo em
// Diversos > Por tratar com o sufixo "Deixei em Diversos".

import { describe, it, expect } from "vitest";
import {
  detectDayStateQuery,
  detectAgendaQuery,
  composeDayStateReply,
} from "./deterministic.server";

describe("consulta do estado do dia", () => {
  for (const t of [
    "Como está o meu dia?",
    "Como está o meu dia",
    "Bom dia Afonso. Como estou hoje?",
    "Como vai o meu dia?",
    "como corre o dia?",
    // "Resumo do dia" passou a ser retrospetivo (resumo de fim de dia) —
    // ver supreme/evening-review.golden.test.ts.

    "ponto de situação de hoje",
    "E o meu dia?",
  ]) it(`reconhece: ${t}`, () => expect(detectDayStateQuery(t)).toBe(true));

  for (const t of [
    // correcção do consultor — caso diferente, não pode ser afectado
    "Não me estás a perguntar sobre as reuniões passadas",
    // criação / lembrete
    "Lembra-me hoje às 19:10 do estudo de mercado",
    "Marca visita amanhã",
    // consulta a Diversos
    "Que notas tenho hoje?",
    "",
  ]) it(`ignora: ${t || "(vazio)"}`, () => expect(detectDayStateQuery(t)).toBe(false));

  it("não rouba as consultas de agenda já existentes", () => {
    expect(detectAgendaQuery("O que tenho hoje?")).toBe("today");
    expect(detectAgendaQuery("Como está a minha agenda?")).toBe("today");
  });

  it("responde com compromissos e prioridades reais, sem perguntar nada", () => {
    const reply = composeDayStateReply(
      [{ title: "Visita Rua das Flores", due_time: "15:30" }],
      [{ action: "Ligar ao proprietário", entity_label: "Sr. Paulo", reasons: ["sem contacto há 5 dias"] }],
    );
    expect(reply).toContain("15h30");
    expect(reply).toContain("Visita Rua das Flores");
    expect(reply).toContain("Ligar ao proprietário");
    expect(reply).not.toContain("?");
    expect(reply).not.toContain("Diversos");
  });

  it("dia vazio continua a responder com estado real (a qualquer hora)", () => {
    const reply = composeDayStateReply([], []);
    expect(reply).toContain("não tens compromissos");
    expect(reply).not.toContain("Diversos");
  });
});
