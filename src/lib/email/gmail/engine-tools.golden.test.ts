import { describe, it, expect } from "vitest";
import { ZOD_BY_TOOL, TOOL_SPECS } from "@/lib/assessor/v2/tools";
import { DECIDE_SYSTEM_PROMPT } from "@/lib/assessor/v3/prompts";
import {
  isQueryTool, formatQueryResults,
  EMAIL_NOT_CONNECTED_REPLY, EMAIL_NEEDS_RECONNECT_REPLY,
} from "@/lib/assessor/v3/query-results";

describe("email exposto ao motor", () => {
  // Direcção de 26/08: o Afonso escreve emails de iniciativa e NÃO lê a caixa
  // de entrada. As ferramentas de leitura continuam a existir (triagem interna,
  // rascunhos antigos) mas saíram do que é oferecido ao modelo.
  it("só o email de iniciativa é oferecido ao modelo", () => {
    expect(ZOD_BY_TOOL["compose_email_to_contact"]).toBeTruthy();
    expect(ZOD_BY_TOOL["search_emails"]).toBeTruthy();
    expect(ZOD_BY_TOOL["summarize_email"]).toBeTruthy();

    const names = TOOL_SPECS.map((t) => t.function.name);
    expect(names).toContain("compose_email_to_contact");
    expect(names).not.toContain("search_emails");
    expect(names).not.toContain("summarize_email");
    expect(names).not.toContain("draft_email_reply");

    expect(DECIDE_SYSTEM_PROMPT).toContain("compose_email_to_contact");
    expect(DECIDE_SYSTEM_PROMPT).not.toContain("search_emails(");
  });

  it("a leitura interna continua a formatar resultados", () => {
    expect(isQueryTool("search_emails")).toBe(true);
  });

  it("com Gmail ligado, lista os emails reais", () => {
    const out = formatQueryResults([{
      name: "search_emails", ok: true, latencyMs: 1,
      data: { items: [{
        id: "m1", from: "Nuno Silva <nuno@exemplo.pt>", subject: "Proposta Rua da Bélgica",
        snippet: "Envio a proposta", sent_at: "2026-08-15T09:00:00Z", is_read: false,
      }] },
    }]);
    expect(out).toContain("Nuno Silva");
    expect(out).toContain("Proposta Rua da Bélgica");
    expect(out).not.toContain("não tenho acesso");
  });

  it("sem Gmail ligado, orienta para as Definições", () => {
    const out = formatQueryResults([{
      name: "search_emails", ok: true, latencyMs: 1, data: { not_connected: true, items: [] },
    }]);
    expect(out).toBe(EMAIL_NOT_CONNECTED_REPLY);
  });

  it("autorização expirada pede nova ligação", () => {
    const out = formatQueryResults([{
      name: "search_emails", ok: true, latencyMs: 1, data: { needs_reconnect: true, items: [] },
    }]);
    expect(out).toBe(EMAIL_NEEDS_RECONNECT_REPLY);
  });

  it("resumo a pedido devolve o texto do resumo", () => {
    const out = formatQueryResults([{
      name: "summarize_email", ok: true, latencyMs: 1,
      data: { summary: "O Nuno pede a caderneta predial.", subject: "Proposta", message_id: "m1" },
    }]);
    expect(out).toContain("O Nuno pede a caderneta predial.");
  });
});
