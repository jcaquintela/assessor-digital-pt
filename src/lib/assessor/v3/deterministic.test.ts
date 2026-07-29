import { describe, it, expect, vi } from "vitest";
import {
  detectAgendaQuery,
  formatAgendaReply,
  hasValidPendingContext,
  BARE_CONFIRMATION_REPLY,
} from "./deterministic.server";
import { isConfirmation } from "../culture/short-answers";

describe("deterministic — agenda", () => {
  it("reconhece 'O que tenho hoje?'", () => {
    expect(detectAgendaQuery("O que tenho hoje?")).toBe("today");
  });
  it("reconhece 'Que tenho hoje?'", () => {
    expect(detectAgendaQuery("Que tenho hoje?")).toBe("today");
  });
  it("reconhece 'O que está marcado para hoje?'", () => {
    expect(detectAgendaQuery("O que está marcado para hoje?")).toBe("today");
  });
  it("reconhece 'Tenho alguma coisa hoje?'", () => {
    expect(detectAgendaQuery("Tenho alguma coisa hoje?")).toBe("today");
  });
  it("reconhece 'Como está a minha agenda?'", () => {
    expect(detectAgendaQuery("Como está a minha agenda?")).toBe("today");
  });
  it("reconhece 'E hoje?'", () => {
    expect(detectAgendaQuery("E hoje?")).toBe("today");
  });
  it("reconhece amanhã", () => {
    expect(detectAgendaQuery("Que tenho amanhã?")).toBe("tomorrow");
  });
  it("ignora frases sem agenda", () => {
    expect(detectAgendaQuery("Regista este número")).toBeNull();
    expect(detectAgendaQuery("Bom dia")).toBeNull();
    expect(detectAgendaQuery("Placa Canelas 932145678")).toBeNull();
  });

  it("formata agenda vazia", () => {
    expect(formatAgendaReply("today", [])).toBe("Não tens compromissos para hoje.");
  });
  it("formata agenda com itens", () => {
    const reply = formatAgendaReply("today", [
      { title: "Visita com o Paulo", due_time: "10:00" },
      { title: "Reunião", due_time: "15:30" },
    ]);
    expect(reply).toContain("Hoje tens:");
    expect(reply).toContain("10h00 — Visita com o Paulo");
    expect(reply).toContain("15h30 — Reunião");
  });
});

describe("deterministic — confirmação sem contexto", () => {
  it("isConfirmation apanha 'sim' e 'ok'", () => {
    expect(isConfirmation("sim")).toBe(true);
    expect(isConfirmation("ok")).toBe(true);
    expect(isConfirmation("claro")).toBe(true);
  });
  it("resposta canónica é consistente PT-PT", () => {
    expect(BARE_CONFIRMATION_REPLY.toLowerCase()).toContain("a que te referes");
  });
  it("hasValidPendingContext rejeita nulos/estados finais", () => {
    expect(hasValidPendingContext(null)).toBe(false);
    expect(hasValidPendingContext({ status: "executed" })).toBe(false);
    expect(hasValidPendingContext({ status: "cancelled" })).toBe(false);
    expect(hasValidPendingContext({ status: "expired" })).toBe(false);
    expect(hasValidPendingContext({ status: "failed" })).toBe(false);
  });
  it("hasValidPendingContext aceita pending_confirmation não expirado", () => {
    expect(hasValidPendingContext({
      status: "pending_confirmation",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    })).toBe(true);
  });
  it("hasValidPendingContext rejeita expirado", () => {
    expect(hasValidPendingContext({
      status: "pending_confirmation",
      expires_at: new Date(Date.now() - 1000).toISOString(),
    })).toBe(false);
  });
});

describe("golden — replay determinístico", () => {
  it("agenda-hoje passa via router determinístico", async () => {
    // Import dinâmico para não puxar decide/think reais.
    vi.mock("./think.server", () => ({ think: vi.fn() }));
    vi.mock("./decide.server", () => ({ decide: vi.fn() }));
    const { runGolden } = await import("./golden.server");
    const r = await runGolden([
      { user: "O que tenho hoje?", expect: { action: "act", tool: "search_agenda" } },
    ]);
    expect(r.passed).toBe(true);
    expect(r.turns[0].tools).toContain("search_agenda");
  });
  it("short-answer-sim passa via router determinístico", async () => {
    vi.mock("./think.server", () => ({ think: vi.fn() }));
    vi.mock("./decide.server", () => ({ decide: vi.fn() }));
    const { runGolden } = await import("./golden.server");
    const r = await runGolden([
      { user: "sim", expect: { action: "ask", reply_contains: ["a que te referes"], must_not_contain: ["feito", "registei"] } },
    ]);
    expect(r.passed).toBe(true);
    expect(r.turns[0].tools).toEqual([]);
  });
});