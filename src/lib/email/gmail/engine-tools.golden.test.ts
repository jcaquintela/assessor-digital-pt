import { describe, it, expect } from "vitest";
import { ZOD_BY_TOOL, TOOL_SPECS } from "@/lib/assessor/v2/tools";
import { DECIDE_SYSTEM_PROMPT } from "@/lib/assessor/v3/prompts";
import {
  isQueryTool, formatQueryResults,
  EMAIL_NOT_CONNECTED_REPLY, EMAIL_NEEDS_RECONNECT_REPLY,
} from "@/lib/assessor/v3/query-results";

describe("email exposto ao motor", () => {
  it("as ferramentas estão registadas e descritas", () => {
    expect(ZOD_BY_TOOL["search_emails"]).toBeTruthy();
    expect(ZOD_BY_TOOL["summarize_email"]).toBeTruthy();
    const names = TOOL_SPECS.map((t) => t.function.name);
    expect(names).toContain("search_emails");
    expect(names).toContain("summarize_email");
    expect(DECIDE_SYSTEM_PROMPT).toContain("search_emails");
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
