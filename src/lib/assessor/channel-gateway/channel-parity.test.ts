// Golden tests de paridade entre canais: idempotência de entrega e
// coalescência de rajadas têm de comportar-se exactamente igual no
// Telegram e no WhatsApp — a lógica é do gateway, não do canal.
import { describe, it, expect } from "vitest";
import { coalesceInboundText } from "./coalesce.server";
import { alreadyDelivered } from "./ingest.server";

type Row = {
  id?: string;
  role: string;
  content: string;
  created_at: string;
  message_type?: string;
  channel: string;
  user_id?: string;
};

// Fake que respeita os filtros usados pelo gateway (user_id, channel, role),
// para garantir que um canal nunca vê o histórico do outro.
function fakeSupabase(rows: Row[]) {
  return {
    from() {
      const filters: Record<string, string> = {};
      let since: string | null = null;
      const q: any = {
        select: () => q,
        eq: (col: string, val: string) => {
          filters[col] = val;
          return q;
        },
        gte: (_col: string, val: string) => {
          since = val;
          return q;
        },
        order: () => q,
        limit: async () => ({ data: apply() }),
      };
      const apply = () =>
        rows.filter(
          (r) =>
            Object.entries(filters).every(([k, v]) => String((r as any)[k]) === v) &&
            (!since || r.created_at >= since),
        );
      return q;
    },
  };
}

const CHANNELS = ["telegram", "whatsapp"] as const;
const FAIL = "Tentei mas não consegui guardar isso agora. Podes tentar outra vez?";
const base = Date.parse("2026-08-05T09:00:00.000Z");
const at = (ms: number) => new Date(base + ms).toISOString();

describe.each(CHANNELS)("paridade de canal: %s", (channel) => {
  const other = channel === "telegram" ? "whatsapp" : "telegram";

  it("não entrega a mesma falha duas vezes", async () => {
    const s = fakeSupabase([
      { role: "assistant", content: FAIL, created_at: new Date().toISOString(), channel, user_id: "u" },
    ]);
    expect(await alreadyDelivered(s, "u", channel, FAIL)).toBe(true);
  });

  it("deixa passar conteúdo diferente", async () => {
    const s = fakeSupabase([
      { role: "assistant", content: FAIL, created_at: new Date().toISOString(), channel, user_id: "u" },
    ]);
    expect(await alreadyDelivered(s, "u", channel, "Encontrei 3 contactos:")).toBe(false);
  });

  it("histórico do outro canal não bloqueia a entrega", async () => {
    const s = fakeSupabase([
      { role: "assistant", content: FAIL, created_at: new Date().toISOString(), channel: other, user_id: "u" },
    ]);
    expect(await alreadyDelivered(s, "u", channel, FAIL)).toBe(false);
  });

  it("cede a uma mensagem da mesma rajada", async () => {
    const s = fakeSupabase([
      { id: "m1", role: "user", content: "a", created_at: at(0), message_type: "text", channel, user_id: "u" },
      { id: "m2", role: "user", content: "b", created_at: at(3_000), message_type: "text", channel, user_id: "u" },
    ]);
    const r = await coalesceInboundText(s, {
      userId: "u", channel, currentMessageId: "m1", fallbackContent: "a",
      settleMs: 0, sleep: async () => {},
    });
    expect(r.yield).toBe(true);
  });

  it("duas perguntas distintas recebem respostas distintas", async () => {
    const rows: Row[] = [
      { id: "q1", role: "user", content: "Que pessoas tenho guardadas?", created_at: at(0), message_type: "text", channel, user_id: "u" },
      { id: "q2", role: "user", content: "E documentos?", created_at: at(90_000), message_type: "text", channel, user_id: "u" },
    ];
    const s = fakeSupabase(rows);
    const r1 = await coalesceInboundText(s, {
      userId: "u", channel, currentMessageId: "q1",
      fallbackContent: "Que pessoas tenho guardadas?", settleMs: 0, sleep: async () => {},
    });
    const r2 = await coalesceInboundText(s, {
      userId: "u", channel, currentMessageId: "q2",
      fallbackContent: "E documentos?", settleMs: 0, sleep: async () => {},
    });
    expect(r1.yield).toBe(false);
    expect(r2.yield).toBe(false);
    expect((r1 as any).content).toContain("pessoas");
    expect((r2 as any).content).toContain("documentos");
  });

  it("mensagem do outro canal não provoca cedência", async () => {
    const s = fakeSupabase([
      { id: "m1", role: "user", content: "a", created_at: at(0), message_type: "text", channel, user_id: "u" },
      { id: "x1", role: "user", content: "b", created_at: at(3_000), message_type: "text", channel: other, user_id: "u" },
    ]);
    const r = await coalesceInboundText(s, {
      userId: "u", channel, currentMessageId: "m1", fallbackContent: "a",
      settleMs: 0, sleep: async () => {},
    });
    expect(r.yield).toBe(false);
  });
});
