import { describe, it, expect } from "vitest";
import { coalesceInboundText } from "./coalesce.server";

function fakeSupabase(rows: any[]) {
  return {
    from() {
      const q: any = {
        select: () => q, eq: () => q, order: () => q,
        limit: async () => ({ data: rows }),
      };
      return q;
    },
  };
}

const base = Date.parse("2026-08-05T09:00:00.000Z");
const at = (ms: number) => new Date(base + ms).toISOString();

describe("mensagens novas nunca são engolidas", () => {
  it("cede a uma mensagem da mesma rajada", async () => {
    const rows = [
      { id: "m1", role: "user", content: "a", created_at: at(0), message_type: "whatsapp_text" },
      { id: "m2", role: "user", content: "b", created_at: at(3_000), message_type: "whatsapp_text" },
    ];
    const r = await coalesceInboundText(fakeSupabase(rows), {
      userId: "u", channel: "whatsapp", currentMessageId: "m1", fallbackContent: "a",
      settleMs: 0, sleep: async () => {},
    });
    expect(r.yield).toBe(true);
  });

  it("duas perguntas distintas em sequência respondem cada uma por si", async () => {
    const rows = [
      { id: "q1", role: "user", content: "Que pessoas tenho guardadas?", created_at: at(0), message_type: "whatsapp_text" },
      { id: "q2", role: "user", content: "E documentos?", created_at: at(90_000), message_type: "whatsapp_text" },
    ];
    const s = fakeSupabase(rows);
    const r1 = await coalesceInboundText(s, {
      userId: "u", channel: "whatsapp", currentMessageId: "q1",
      fallbackContent: "Que pessoas tenho guardadas?", settleMs: 0, sleep: async () => {},
    });
    const r2 = await coalesceInboundText(s, {
      userId: "u", channel: "whatsapp", currentMessageId: "q2",
      fallbackContent: "E documentos?", settleMs: 0, sleep: async () => {},
    });
    expect(r1.yield).toBe(false);
    expect(r2.yield).toBe(false);
    expect((r1 as any).content).toContain("pessoas");
    expect((r2 as any).content).toContain("documentos");
  });
});
