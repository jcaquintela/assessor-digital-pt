import { describe, it, expect } from "vitest";
import { computeOverview, computeMentorTip, isOpenFollowUp } from "./overview.server";

/** Supabase falso: devolve as linhas registadas por tabela, ignorando os filtros de servidor. */
function fakeSupabase(tables: Record<string, any[]>) {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      let head = false;
      const builder: any = {
        select: (_c: string, opts?: { head?: boolean }) => { head = !!opts?.head; return builder; },
        eq: () => builder, gte: () => builder, lte: () => builder, in: () => builder,
        order: () => builder, limit: () => builder,
        then: (res: any) => res(head ? { count: rows.length, data: null } : { data: rows }),
      };
      return builder;
    },
  };
}

const hoje = new Date();
const iso = (h: number, m: number) =>
  new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate(), h, m)).toISOString();
const diasAtras = (n: number) => new Date(Date.now() - n * 864e5).toISOString();

describe("resumo — agenda é fonte única dos compromissos", () => {
  it("conta e lista os mesmos compromissos, incluindo os que não são do tipo 'evento'", async () => {
    const s = fakeSupabase({
      follow_ups: [
        { id: "a", title: "Ligar ao Sr. Nogueira", type: "chamada", status: "pendente", due_date: iso(18, 51), due_time: "19:51", person_id: "p1", property_id: null },
        { id: "b", title: "Visita Av. Roma", type: "evento", status: "agendado", due_date: iso(9, 0), due_time: "10:00", person_id: null, property_id: "i1" },
        { id: "c", title: "Treino", type: "outro", status: "Concluído", due_date: iso(6, 30), due_time: "07:30", person_id: null, property_id: null },
      ],
      opportunities: [], properties: [], people: [], miscellaneous_items: [], financial_movements: [], interactions: [],
    });

    const r = await computeOverview(s, "u1");
    expect(r.agenda.today).toBe(2);                       // o concluído não conta
    expect(r.agenda.items).toHaveLength(r.agenda.today);  // cartão e bloco batem certo
    expect(r.agenda.items.map((i) => i.id)).toEqual(["b", "a"]); // ordenado por hora
    expect(r.agenda.items.map((i) => i.title)).toContain("Ligar ao Sr. Nogueira");
    expect(r.agenda.nextTime).toBe("10:00");
    expect(r.agenda.items[1]).toMatchObject({ time: "19:51", type: "chamada", personId: "p1" });
  });

  it("dia sem compromissos abertos: contagem zero e lista vazia", async () => {
    const s = fakeSupabase({
      follow_ups: [{ id: "x", title: "Feito", type: "tarefa", status: "concluido", due_date: iso(8, 0), due_time: null }],
      opportunities: [], properties: [], people: [], miscellaneous_items: [], financial_movements: [], interactions: [],
    });
    const r = await computeOverview(s, "u1");
    expect(r.agenda.today).toBe(0);
    expect(r.agenda.items).toEqual([]);
    expect(r.agenda.nextLabel).toBeNull();
  });

  it("reconhece os vários estados de 'terminado'", () => {
    for (const done of ["Concluído", "concluido", "concluída", "done", "completed", "cancelado", "arquivado"]) {
      expect(isOpenFollowUp(done)).toBe(false);
    }
    for (const aberto of ["pendente", "agendado", "", null]) expect(isOpenFollowUp(aberto)).toBe(true);
  });
});

describe("sugestão do mentor — critérios reais", () => {
  const vazio = { properties: [], opportunities: [], people: [], interactions: [] };

  it("dispara com um imóvel 'por angariar' parado acima do limiar (10 dias)", async () => {
    const tip = await computeMentorTip(fakeSupabase({
      ...vazio,
      properties: [{ id: "i1", status: "por_angariar", updated_at: diasAtras(14) }],
    }), "u1");
    expect(tip?.key).toBe("imoveis-parados");
    expect(tip?.text).toContain("1 imóvel");
    expect(tip?.to).toBe("/imoveis");
  });

  it("não dispara com imóveis mexidos há poucos dias (situação atual da conta)", async () => {
    const tip = await computeMentorTip(fakeSupabase({
      ...vazio,
      properties: Array.from({ length: 5 }, (_, i) => ({ id: `i${i}`, status: "por_angariar", updated_at: diasAtras(2) })),
    }), "u1");
    expect(tip).toBeNull();
  });

  it("dispara com negócio na mesma fase há 3+ semanas", async () => {
    const tip = await computeMentorTip(fakeSupabase({
      ...vazio,
      opportunities: [{ id: "d1", status: "visitas", stage: "visitas", stage_changed_at: diasAtras(25), archived_at: null }],
    }), "u1");
    expect(tip?.key).toBe("negocios-parados");
  });

  it("dispara com 3+ pessoas sem contacto há mais de um mês", async () => {
    const tip = await computeMentorTip(fakeSupabase({
      ...vazio,
      people: [
        { id: "p1", name: "Ana Silva", created_at: diasAtras(60) },
        { id: "p2", name: "Bruno Costa", created_at: diasAtras(70) },
        { id: "p3", name: "Carla Dias", created_at: diasAtras(90) },
      ],
      interactions: [],
    }), "u1");
    expect(tip?.key).toBe("pessoas-frias");
    expect(tip?.text).toContain("Ana e Bruno");
  });
});
