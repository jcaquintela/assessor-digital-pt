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
        eq: () => builder, gte: () => builder, lte: () => builder, in: () => builder, not: () => builder,
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
  it("conta e lista só compromissos de agenda abertos (regra canónica)", async () => {
    const s = fakeSupabase({
      follow_ups: [
        { id: "a", title: "Ligar ao Sr. Nogueira", type: "chamada", status: "pendente", due_date: iso(18, 51), due_time: "19:51", person_id: "p1", property_id: null },
        { id: "b", title: "Visita Av. Roma", type: "evento", status: "agendado", due_date: iso(9, 0), due_time: "10:00", person_id: null, property_id: "i1" },
        { id: "c", title: "Treino", type: "outro", status: "Concluído", due_date: iso(6, 30), due_time: "07:30", person_id: null, property_id: null },
      ],
      opportunities: [], properties: [], people: [], miscellaneous_items: [], financial_movements: [], interactions: [],
    });

    const r = await computeOverview(s, "u1");
    // "chamada" é Tarefa (classificador único) e "Treino" está concluído:
    // nenhum dos dois é compromisso de agenda de hoje.
    expect(r.agenda.today).toBe(1);
    expect(r.agenda.items).toHaveLength(r.agenda.today);  // cartão e bloco batem certo
    expect(r.agenda.items.map((i) => i.id)).toEqual(["b"]);
    expect(r.agenda.nextTime).toBe("10:00");
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

describe("sugestão do mentor — conta pelo contacto real, não por edições", () => {
  const vazio = {
    properties: [], opportunities: [], people: [],
    interactions: [], follow_ups: [], opportunity_properties: [],
  };

  it("dispara com imóvel 'por angariar' sem contacto real acima do limiar (10 dias)", async () => {
    const tip = await computeMentorTip(fakeSupabase({
      ...vazio,
      properties: [{ id: "i1", status: "por_angariar", created_at: diasAtras(40) }],
      follow_ups: [{ related_property_id: "i1", outcome_recorded_at: diasAtras(14) }],
    }), "u1");
    expect(tip?.key).toBe("imoveis-parados");
    expect(tip?.text).toContain("1 imóvel");
    expect(tip?.to).toBe("/imoveis");
  });

  it("uma edição recente da ficha já não reinicia o contador", async () => {
    // updated_at de hoje, mas último contacto real há 30 dias → continua parado.
    const tip = await computeMentorTip(fakeSupabase({
      ...vazio,
      properties: [{ id: "i1", status: "por_angariar", created_at: diasAtras(90), updated_at: new Date().toISOString() }],
      follow_ups: [{ related_property_id: "i1", outcome_recorded_at: diasAtras(30) }],
    }), "u1");
    expect(tip?.key).toBe("imoveis-parados");
  });

  it("não dispara quando houve contacto real há poucos dias", async () => {
    const tip = await computeMentorTip(fakeSupabase({
      ...vazio,
      properties: [{ id: "i1", status: "por_angariar", created_at: diasAtras(120) }],
      follow_ups: [{ related_property_id: "i1", outcome_recorded_at: diasAtras(2) }],
    }), "u1");
    expect(tip).toBeNull();
  });

  it("contacto através de um negócio ligado ao imóvel também conta", async () => {
    const tip = await computeMentorTip(fakeSupabase({
      ...vazio,
      properties: [{ id: "i1", status: "por_angariar", created_at: diasAtras(120) }],
      opportunity_properties: [{ opportunity_id: "d1", property_id: "i1" }],
      interactions: [{ opportunity_id: "d1", person_id: null, occurred_at: diasAtras(3) }],
    }), "u1");
    expect(tip).toBeNull();
  });

  it("dispara com negócio na mesma fase há 25+ dias e sem contacto real", async () => {
    const tip = await computeMentorTip(fakeSupabase({
      ...vazio,
      opportunities: [{ id: "d1", status: "visitas", stage: "visitas", stage_changed_at: diasAtras(30), archived_at: null }],
    }), "u1");
    expect(tip?.key).toBe("negocios-parados");
  });

  it("negócio parado na fase mas com contacto recente não dispara", async () => {
    const tip = await computeMentorTip(fakeSupabase({
      ...vazio,
      opportunities: [{ id: "d1", status: "visitas", stage: "visitas", stage_changed_at: diasAtras(40), archived_at: null }],
      interactions: [{ opportunity_id: "d1", person_id: null, occurred_at: diasAtras(4) }],
    }), "u1");
    expect(tip).toBeNull();
  });

  it("dispara com 3+ pessoas sem contacto real há mais de 60 dias", async () => {
    const tip = await computeMentorTip(fakeSupabase({
      ...vazio,
      people: [
        { id: "p1", name: "Ana Silva", created_at: diasAtras(100) },
        { id: "p2", name: "Bruno Costa", created_at: diasAtras(110) },
        { id: "p3", name: "Carla Dias", created_at: diasAtras(120) },
      ],
    }), "u1");
    expect(tip?.key).toBe("pessoas-frias");
    expect(tip?.text).toContain("Ana e Bruno");
    expect(tip?.text).toContain("dois meses");
  });
});
