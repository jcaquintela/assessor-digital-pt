import { describe, expect, it, vi, beforeEach } from "vitest";

const calls: { ascending?: boolean; limit?: number } = {};
const rows = [
  { id: "3", created_at: "2026-08-16T07:16:41Z", role: "assistant", content: "nova" },
  { id: "2", created_at: "2026-08-16T06:46:50Z", role: "user", content: "meio" },
];

vi.mock("@/integrations/supabase/client", () => {
  const q: Record<string, unknown> = {};
  const builder = {
    select: () => builder,
    is: () => builder,
    order: (_c: string, o: { ascending: boolean }) => {
      calls.ascending = o.ascending;
      return builder;
    },
    limit: (n: number) => {
      calls.limit = n;
      return Promise.resolve({ data: rows, error: null });
    },
  };
  return { supabase: { from: () => builder }, __q: q };
});

const { loadMessages } = await import("./messages");

describe("leitura da conversa", () => {
  beforeEach(() => {
    calls.ascending = undefined;
  });

  it("pede sempre as mensagens MAIS RECENTES", async () => {
    await loadMessages(200);
    // Com ordem ascendente + limite, quem tem mais mensagens do que o limite
    // recebia as mais antigas e nunca via a resposta nova.
    expect(calls.ascending).toBe(false);
    expect(calls.limit).toBe(200);
  });

  it("devolve-as por ordem cronológica para a conversa se ler bem", async () => {
    const out = await loadMessages(200);
    expect(out.map((m) => m.id)).toEqual(["2", "3"]);
  });
});
