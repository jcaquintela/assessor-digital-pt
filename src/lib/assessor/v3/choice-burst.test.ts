import { describe, it, expect } from "vitest";
import { pickCancelChoiceMulti, formatMultiCancelReply } from "./cancel-choice";
import { collectChoiceBurstFollowUps, CONSUMED_STATUS } from "./choice-burst.server";

const CANDS = [
  { id: "a", title: "Lembrete: Marcação das unhas", due_time: "15:00" },
  { id: "b", title: "Marcação das unhas", due_time: "10:00" },
];

function fakeSupabase(rows: any[]) {
  return {
    from() {
      const q: any = {
        _single: false,
        select() { return q; },
        eq() { return q; },
        gt() { return q; },
        order() { return q; },
        limit() { return Promise.resolve({ data: rows.filter((r) => r.role === "user") }); },
        maybeSingle() { return Promise.resolve({ data: { created_at: "2026-08-24T18:00:00Z" } }); },
      };
      return q;
    },
  };
}

describe("golden — escolha respondida em rajada (24/08)", () => {
  it("as três mensagens da rajada cancelam os dois itens, sem contradição", async () => {
    const first = "15h00 — Lembrete: Marcação das unhas";
    const extra = await collectChoiceBurstFollowUps(fakeSupabase([
      { id: "m2", role: "user", content: "10h00 — Marcação das unhas", message_type: "text", created_at: "2026-08-24T18:00:01Z" },
      { id: "m3", role: "user", content: "Ambas", message_type: "text", created_at: "2026-08-24T18:00:02Z" },
    ]), {
      userId: "u1", channel: "telegram", sourceMessageId: "m1", graceMs: 0,
    });

    expect(extra.map((e) => e.id)).toEqual(["m2", "m3"]);

    const merged = [first, ...extra.map((e) => e.content)].join("\n");
    const chosen = pickCancelChoiceMulti(CANDS, merged);
    expect(chosen.map((c) => c.id)).toEqual(["a", "b"]);

    const reply = formatMultiCancelReply(chosen.map((item) => ({ item, ok: true })));
    expect(reply).toContain("1)");
    expect(reply).toContain("2)");
    expect(reply).not.toContain("Não tinhas");
  });

  it("duas horas distintas em rajada, sem 'ambas', também apanham os dois", () => {
    const chosen = pickCancelChoiceMulti(CANDS, "15h00 — Marcação das unhas\n10h00 — Marcação das unhas");
    expect(chosen.map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("regressão — escolha simples", () => {
  it("uma só linha continua a escolher um item", () => {
    expect(pickCancelChoiceMulti(CANDS, "a das 15h").map((c) => c.id)).toEqual(["a"]);
    expect(pickCancelChoiceMulti(CANDS, "a primeira").map((c) => c.id)).toEqual(["a"]);
    expect(pickCancelChoiceMulti(CANDS, "hmm")).toEqual([]);
  });

  it("sem mensagem de origem não espera nada", async () => {
    const t0 = Date.now();
    const extra = await collectChoiceBurstFollowUps(fakeSupabase([]), {
      userId: "u1", channel: "telegram", sourceMessageId: null,
    });
    expect(extra).toEqual([]);
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it("mensagens já consumidas não voltam a entrar", async () => {
    const extra = await collectChoiceBurstFollowUps(fakeSupabase([
      { id: "m2", role: "user", content: "Ambas", message_type: "text", status: CONSUMED_STATUS },
    ]), { userId: "u1", channel: "telegram", sourceMessageId: "m1", graceMs: 0 });
    expect(extra).toEqual([]);
  });
});
