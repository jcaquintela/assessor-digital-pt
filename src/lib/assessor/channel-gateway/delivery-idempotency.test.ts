import { describe, it, expect } from "vitest";
import { alreadyDelivered } from "./ingest.server";

const FAIL = "Tentei mas não consegui guardar isso agora. Podes tentar outra vez?";

function fakeSupabase(rows: any[]) {
  return {
    from() {
      const q: any = {
        select: () => q, eq: () => q, gte: () => q, order: () => q,
        limit: async () => ({ data: rows }),
      };
      return q;
    },
  };
}

describe("entrega idempotente", () => {
  it("uma falha não é entregue duas vezes para o mesmo evento", async () => {
    const rows = [{ role: "assistant", content: FAIL, created_at: new Date().toISOString() }];
    expect(await alreadyDelivered(fakeSupabase(rows), "u", "whatsapp", FAIL)).toBe(true);
  });

  it("mensagem diferente passa", async () => {
    const rows = [{ role: "assistant", content: FAIL, created_at: new Date().toISOString() }];
    expect(await alreadyDelivered(fakeSupabase(rows), "u", "whatsapp", "Encontrei 3 contactos:")).toBe(false);
  });

  it("sem histórico envia", async () => {
    expect(await alreadyDelivered(fakeSupabase([]), "u", "whatsapp", FAIL)).toBe(false);
  });
});
