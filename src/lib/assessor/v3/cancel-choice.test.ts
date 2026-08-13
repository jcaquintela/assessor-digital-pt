import { describe, it, expect } from "vitest";
import { isAllChoice, pickCancelChoice, formatMultiCancelReply } from "./cancel-choice";
import { ensureAllPartsAnswered, splitRequestParts, isPartCovered } from "./composite-request";

const CANDS = [
  { id: "a", title: "Lembrete: Visita T2 Conselhas amanhã com Vasco (KW)", due_time: "10:00" },
  { id: "b", title: "Visita T2 Conselhas - Vasco (KW)", due_time: "18:00" },
];

describe('escolha "as duas"', () => {
  it.each(["As duas", "as duas", "ambas", "os dois", "todas", "Sim, as duas", "tudo"])(
    "reconhece: %s",
    (t) => expect(isAllChoice(t)).toBe(true),
  );

  it.each(["a primeira", "a das 18h", "não"])("não confunde: %s", (t) =>
    expect(isAllChoice(t)).toBe(false),
  );

  it("golden 1 — 'as duas' escolhe os dois e a confirmação lista cada um", () => {
    const chosen = pickCancelChoice(CANDS, "As duas");
    expect(chosen.map((c) => c.id)).toEqual(["a", "b"]);
    const reply = formatMultiCancelReply(chosen.map((item) => ({ item, ok: true })));
    expect(reply).toContain("1)");
    expect(reply).toContain("2)");
    expect(reply).toContain("Lembrete: Visita T2 Conselhas amanhã com Vasco (KW) (10h)");
    expect(reply).toContain("Visita T2 Conselhas - Vasco (KW) (18h)");
    expect(reply).toContain("Não reagendei nada em nenhum dos dois");
  });

  it("escolha por ordinal e por hora", () => {
    expect(pickCancelChoice(CANDS, "a primeira").map((c) => c.id)).toEqual(["a"]);
    expect(pickCancelChoice(CANDS, "a das 18h").map((c) => c.id)).toEqual(["b"]);
  });

  it("resposta que não resolve nada devolve vazio (volta a perguntar)", () => {
    expect(pickCancelChoice(CANDS, "hmm")).toEqual([]);
  });

  it("um item que falhou é dito, não escondido", () => {
    const reply = formatMultiCancelReply([
      { item: CANDS[0]!, ok: true },
      { item: CANDS[1]!, ok: false },
    ]);
    expect(reply).toContain("Desmarquei:");
    expect(reply).toContain("Não consegui desmarcar");
  });
});

describe("pedido composto", () => {
  const MSG =
    "o estudo de mercado já está tratado e a visita das 18h em Consortes foi cancelada";

  it("separa as duas instruções", () => {
    expect(splitRequestParts(MSG).length).toBe(2);
  });

  it("golden 2 — a confirmação responde às duas partes, mesmo sem acção numa", () => {
    const partial = "Desmarquei: 1) Lembrete Visita T2 Conselhas (10h). 2) Visita T2 Conselhas (18h).";
    const out = ensureAllPartsAnswered(partial, MSG);
    expect(out).toContain("estudo de mercado");
    expect(out).toContain("não encontrei nada pendente");
    expect(out.startsWith(partial)).toBe(true);
  });

  it("não acrescenta nada quando a resposta já cobre tudo", () => {
    const full = "Marquei o estudo de mercado como tratado e desmarquei a visita de Consortes das 18h.";
    expect(ensureAllPartsAnswered(full, MSG)).toBe(full);
    expect(isPartCovered(full, "o estudo de mercado já está tratado")).toBe(true);
  });

  it("mensagem com uma só instrução fica intacta", () => {
    const r = "Desmarquei a visita. Não reagendei nada.";
    expect(ensureAllPartsAnswered(r, "cancela a visita das 18h")).toBe(r);
  });
});
