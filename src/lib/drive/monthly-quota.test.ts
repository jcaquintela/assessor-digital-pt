import { describe, it, expect } from "vitest";
import {
  monthStartISO,
  monthlyFileQuota,
  monthlyQuotaExceededText,
  usageHintText,
  withinMonthlyQuota,
} from "./monthly-quota";
import { canProcessAnotherFile, filesThisMonth } from "./monthly-quota.server";

// Fake mínimo: conta linhas com created_at >= início do mês.
function fakeSupabase(rows: { created_at: string }[]) {
  return {
    from() {
      let from = "";
      const api: any = {
        select: () => api,
        eq: () => api,
        is: () => api,
        gte: (_col: string, v: string) => {
          from = v;
          return api;
        },
        then: undefined,
      };
      // Promise-like: resolve com a contagem no final da cadeia.
      api.gte = (_col: string, v: string) => {
        from = v;
        return Promise.resolve({
          count: rows.filter((r) => r.created_at >= from).length,
        });
      };
      return api;
    },
  } as any;
}

const monthRows = (n: number, iso: string) =>
  Array.from({ length: n }, () => ({ created_at: iso }));

describe("quota mensal de ficheiros do Drive", () => {
  it("Base bloqueia no ficheiro 41 do mês, com upsell para Consultor", async () => {
    const now = new Date("2026-08-15T10:00:00Z");
    const supabase = fakeSupabase(monthRows(40, "2026-08-03T10:00:00Z"));
    const r = await canProcessAnotherFile(supabase, "u1", "base", now);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reply).toContain("40 ficheiros");
      expect(r.reply).toContain("Consultor");
    }
  });

  it("Base ainda aceita o ficheiro 40", async () => {
    const now = new Date("2026-08-15T10:00:00Z");
    const supabase = fakeSupabase(monthRows(39, "2026-08-03T10:00:00Z"));
    const r = await canProcessAnotherFile(supabase, "u1", "base", now);
    expect(r.ok).toBe(true);
  });

  it("Consultor bloqueia no ficheiro 201, com upsell para Pro", async () => {
    const now = new Date("2026-08-15T10:00:00Z");
    const supabase = fakeSupabase(monthRows(200, "2026-08-03T10:00:00Z"));
    const r = await canProcessAnotherFile(supabase, "u1", "consultor", now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reply).toContain("Pro");
  });

  it("Pro e Team nunca bloqueiam e não mostram contagem", async () => {
    const now = new Date("2026-08-15T10:00:00Z");
    const supabase = fakeSupabase(monthRows(5000, "2026-08-03T10:00:00Z"));
    for (const tier of ["pro", "hub"]) {
      const r = await canProcessAnotherFile(supabase, "u1", tier, now);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.hint).toBeNull();
      expect(monthlyFileQuota(tier)).toBeNull();
      expect(withinMonthlyQuota(9999, tier)).toBe(true);
    }
  });

  it("a contagem reseta no dia 1 do mês seguinte", async () => {
    const rows = monthRows(40, "2026-08-20T10:00:00Z");
    expect(await filesThisMonth(fakeSupabase(rows), "u1", new Date("2026-08-25T09:00:00Z"))).toBe(40);
    expect(await filesThisMonth(fakeSupabase(rows), "u1", new Date("2026-09-01T00:05:00Z"))).toBe(0);
    const r = await canProcessAnotherFile(fakeSupabase(rows), "u1", "base", new Date("2026-09-01T00:05:00Z"));
    expect(r.ok).toBe(true);
  });

  it("ficheiros arquivados ou expirados continuam a contar no mês em que entraram", async () => {
    // Arquivar não devolve quota; só a reciclagem (deleted_at) deixa de contar.
    const now = new Date("2026-08-15T10:00:00Z");
    const supabase = fakeSupabase(monthRows(40, "2026-08-02T10:00:00Z"));
    expect(await filesThisMonth(supabase, "u1", now)).toBe(40);
  });

  it("só avisa no recibo a partir dos 80%", () => {
    expect(usageHintText(31, "base")).toBeNull();
    expect(usageHintText(32, "base")).toContain("32 de 40");
    expect(usageHintText(41, "base")).toContain("40 de 40");
    expect(usageHintText(199, "pro")).toBeNull();
  });

  it("o mês de calendário começa no dia 1", () => {
    expect(monthStartISO(new Date("2026-08-15T10:00:00Z"))).toBe("2026-08-01T00:00:00.000Z");
  });

  it("o texto de limite explica o reset e não fecha portas", () => {
    const t = monthlyQuotaExceededText("base", 40);
    expect(t).toContain("dia 1");
    expect(t).toContain("por escrito");
  });
});
