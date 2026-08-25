// Golden tests da Agenda Inteligente — títulos reais da conta do consultor.
import { describe, it, expect } from "vitest";
import {
  eventCategoryFor,
  effectiveEventCategory,
  needsAutoCategory,
  EVENT_CATEGORY_ORDER,
} from "./event-category";
import {
  buildEventCategoryCards,
  eventCategoryChips,
  filterByCategoryChip,
} from "./category-cards";

describe("1. títulos reais → categoria correta", () => {
  const casos: [string, string][] = [
    ["Visita T2 Canelas", "visitas"],
    ["Angariação Rua do Amial", "visitas"],
    ["CPCV Apartamento Gaia", "visitas"],
    ["WEEKLY CLOSING - OPS", "operacao"],
    ["Reunião de equipa Level Up", "operacao"],
    ["Academia StartUp - Módulo 3", "formacao"],
    ["Cristina Cavalheiro - Aniversário", "aniversarios"],
    ["Treino", "pessoal"],
    ["Consulta dentista", "pessoal"],
    ["Piquete Informática", "suporte"],
    ["Contabilidade - fecho do mês", "suporte"],
  ];
  for (const [title, esperado] of casos) {
    it(title, () => expect(eventCategoryFor({ title })).toBe(esperado));
  }
});

describe("2. ambíguo → por_classificar, nunca null", () => {
  for (const title of ["Reunião", "Teste 2", "xpto", "", "   "]) {
    it(`"${title}"`, () => {
      const c = eventCategoryFor({ title });
      expect(c).toBe("por_classificar");
      expect(c).not.toBeNull();
    });
  }
  it("com pessoa ligada passa a trabalho comercial", () => {
    expect(eventCategoryFor({ title: "Reunião", person_id: "p1" })).toBe("visitas");
  });
});

describe("3. override manual persiste", () => {
  it("manual manda sobre a automática", () => {
    const r = effectiveEventCategory({ event_category: "aniversarios", event_category_id: "cat-1" });
    expect(r).toEqual({ key: "cat-1", automatica: false });
  });
  it("reclassificação futura não toca em quem já tem automática", () => {
    expect(needsAutoCategory({ event_category: "visitas" })).toBe(false);
    expect(needsAutoCategory({ event_category: null })).toBe(true);
  });
});

describe("4. backfill dos aniversários", () => {
  const rows = Array.from({ length: 213 }, (_, i) => ({
    id: String(i),
    title: `Contacto ${i} - Aniversário`,
    event_category: null as string | null,
  }));

  it("uma corrida classifica todos e a seguinte não repete trabalho", () => {
    const alvo1 = rows.filter(needsAutoCategory);
    expect(alvo1).toHaveLength(213);
    for (const r of alvo1) r.event_category = eventCategoryFor(r);
    expect(rows.every((r) => r.event_category === "aniversarios")).toBe(true);
    expect(rows.filter(needsAutoCategory)).toHaveLength(0);
  });
});

describe("5. aniversários escondidos por defeito", () => {
  const eventos = [
    { id: "a", event_category: "aniversarios" },
    { id: "b", event_category: "visitas" },
  ];

  it("não aparecem em cartões nem chips sem activação", () => {
    const cards = buildEventCategoryCards(eventos);
    expect(cards.map((c) => c.key)).not.toContain("sys:aniversarios");
    expect(eventCategoryChips().map((c) => c.key)).not.toContain("aniversarios");
    expect(filterByCategoryChip(eventos, "todos").map((e) => e.id)).toEqual(["b"]);
  });

  it("aparecem depois de activação explícita", () => {
    const cards = buildEventCategoryCards(eventos, [], { mostrarAniversarios: true });
    expect(cards.map((c) => c.key)).toContain("sys:aniversarios");
    expect(eventCategoryChips({ mostrarAniversarios: true }).map((c) => c.key)).toContain(
      "aniversarios",
    );
    expect(
      filterByCategoryChip(eventos, "todos", { mostrarAniversarios: true }),
    ).toHaveLength(2);
  });

  it("por classificar está sempre visível e destacado", () => {
    const cards = buildEventCategoryCards([{ id: "z", event_category: null }]);
    const pc = cards.find((c) => c.key === "sys:por_classificar");
    expect(pc?.destaque).toBe(true);
    expect(pc?.count).toBe(1);
  });
});

describe("6. automática distinguível da manual", () => {
  it("prefixo sys: e hint automática", () => {
    const cards = buildEventCategoryCards(
      [
        { id: "a", event_category: "visitas" },
        { id: "b", event_category: "visitas", event_category_id: "cat-1" },
      ],
      [{ id: "cat-1", name: "Clientes VIP" }],
    );
    const auto = cards.find((c) => c.key === "sys:visitas");
    const manual = cards.find((c) => c.key === "cat-1");
    expect(auto?.hint).toBe("automática");
    expect(manual?.hint).toBeUndefined();
    expect(manual?.label).toBe("Clientes VIP");
  });
  it("ordem estável termina nos aniversários", () => {
    expect(EVENT_CATEGORY_ORDER.at(-1)).toBe("aniversarios");
  });
});
