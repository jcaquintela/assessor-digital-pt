import { describe, expect, it } from "vitest";
import { computePriorities } from "@/lib/assessor/supreme/priorities.server";
import { groupOfStage, isDealClosed, legacyStatusForStage, STAGE_GROUPS } from "./stages";

// Regressão: "Venda do terreno" estava com stage=concluido e status=Novo,
// e por isso contava como em curso, aparecia no quadro ativo e o Hoje
// pedia "definir próxima ação".
describe("negócio concluído", () => {
  it("a fase manda sobre o estado legado", () => {
    expect(isDealClosed({ stage: "concluido", status: "Novo" })).toBe(true);
    expect(isDealClosed({ stage: "visitas", status: "Concluída" })).toBe(false);
    expect(isDealClosed({ stage: null, status: "Perdida" })).toBe(true);
  });

  it("não pertence a nenhuma coluna do quadro ativo", () => {
    expect(groupOfStage("concluido")).toBe("concluido");
    expect(STAGE_GROUPS.some((g) => g.stages.includes("concluido" as never))).toBe(false);
  });

  it("mudar de fase escreve o estado legado coerente", () => {
    expect(legacyStatusForStage("concluido")).toBe("Concluída");
    expect(legacyStatusForStage("visitas")).toBe("Em curso");
  });

  it("não vira prioridade de hoje por falta de próxima ação", async () => {
    const rows: Record<string, any[]> = {
      follow_ups: [],
      opportunities: [{
        id: "d1", user_id: "u1", title: "Venda do terreno", stage: "concluido",
        status: "Novo", archived_at: null, next_action: null, next_action_date: null,
        person_id: null, value: 200000, updated_at: new Date().toISOString(),
      }],
      people: [],
    };
    const build = (table: string) => {
      let data = rows[table] ?? [];
      const api: any = {
        select: () => api,
        eq: (c: string, v: any) => { data = data.filter((r) => r[c] === v); return api; },
        neq: () => api, not: () => api,
        is: (c: string, v: any) => { data = data.filter((r) => (r[c] ?? null) === v); return api; },
        in: () => api, lte: () => api, order: () => api, limit: () => api,
        then: (res: any, rej: any) => Promise.resolve({ data }).then(res, rej),
      };
      return api;
    };
    const items = await computePriorities({ from: build } as any, "u1");
    expect(items).toHaveLength(0);
  });
});
