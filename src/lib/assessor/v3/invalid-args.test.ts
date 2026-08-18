// Golden: os 7 registos reais de Diversos com `invalid_args`.
// Cada caso tinha intenção, entidade e ferramenta correctas — só o formato
// dos argumentos foi recusado. Nenhum pode voltar a cair em Diversos.

import { describe, expect, it } from "vitest";
import {
  SearchPeopleArgs, SearchFilesArgs, SearchPropertiesArgs,
  CreatePersonArgs, CreateEventArgs, SetPropertyCategoryArgs,
} from "../v2/tools";
import { fillMissingDate, normalizeTime, normalizeDate, lisbonNow } from "./tool-args";

const RELATIONSHIP_ALIAS: Record<string, string> = {
  contacto: "outro", cliente: "potencial_cliente", "": "outro",
};

describe("leituras com query nula (3 registos: 05/08)", () => {
  it("search_people aceita null como 'lista tudo'", () => {
    const r = SearchPeopleArgs.safeParse({ query: null });
    expect(r.success).toBe(true);
    expect(r.success && r.data.query).toBe("");
  });
  it("search_files e search_properties seguem a mesma regra", () => {
    expect(SearchFilesArgs.safeParse({ query: null }).success).toBe(true);
    expect(SearchPropertiesArgs.safeParse({ query: null }).success).toBe(true);
  });
  it("query com texto continua a chegar intacta", () => {
    const r = SearchPeopleArgs.safeParse({ query: "Maria Manuela" });
    expect(r.success && r.data.query).toBe("Maria Manuela");
  });
});

describe("create_person sem papel (2 registos: 30/07 João Paulo)", () => {
  it("papel em falta ou desconhecido vira 'outro'", () => {
    for (const input of [undefined, "contacto", ""]) {
      const relationship_type = RELATIONSHIP_ALIAS[String(input ?? "")] ?? "outro";
      const r = CreatePersonArgs.safeParse({ name: "João Paulo", phone: "934 555 444", relationship_type });
      expect(r.success).toBe(true);
    }
  });
});

describe("create_event só com hora (1 registo: 29/07 '09:30')", () => {
  const now = new Date("2026-07-29T18:50:00Z"); // 19:50 em Lisboa
  it("hora já passada hoje → agenda para amanhã", () => {
    const a = fillMissingDate("create_event", { title: "Ligar", start_time: "09:30" }, now);
    expect(a.date).toBe("2026-07-30");
    expect(CreateEventArgs.safeParse(a).success).toBe(true);
  });
  it("hora ainda por vir → hoje", () => {
    const a = fillMissingDate("create_follow_up", { title: "Ligar", due_time: "21:00" }, now);
    expect(a.due_date).toBe("2026-07-29");
  });
  it("nunca inventa data quando não há hora", () => {
    const a = fillMissingDate("create_event", { title: "Ligar" }, now);
    expect(a.date).toBeUndefined();
    expect(CreateEventArgs.safeParse(a).success).toBe(false);
  });
  it("data explícita manda sempre", () => {
    const a = fillMissingDate("create_event", { title: "x", date: "2026-8-3", start_time: "9h30" }, now);
    expect(a.date).toBe("2026-08-03");
    expect(a.start_time).toBe("09:30");
  });
});

describe("formatos soltos de hora e data", () => {
  it("normaliza as formas que o modelo escreve", () => {
    expect(normalizeTime("9:30")).toBe("09:30");
    expect(normalizeTime("9h30")).toBe("09:30");
    expect(normalizeTime("16")).toBe("16:00");
    expect(normalizeTime("25:00")).toBeNull();
    expect(normalizeTime("amanhã")).toBeNull();
    expect(normalizeDate("2026-7-9")).toBe("2026-07-09");
    expect(normalizeDate("amanhã")).toBeNull();
  });
  it("lisbonNow devolve data e hora válidas", () => {
    const n = lisbonNow(new Date("2026-08-18T23:05:00Z")); // Lisboa é UTC+1 no Verão
    expect(n.date).toBe("2026-08-19");
    expect(n.time).toBe("00:05");
  });
});

describe("set_property_category (1 registo: 02/08 moradia Rua do Sol)", () => {
  it("só com categoria é recusado — sem imóvel não se escreve", () => {
    expect(SetPropertyCategoryArgs.safeParse({ category_name: "De colega/agência" }).success).toBe(false);
  });
  it("com o imóvel da conversa passa", () => {
    const r = SetPropertyCategoryArgs.safeParse({
      property_id: "0f0b0b6a-1f2e-4d3c-8a9b-1c2d3e4f5a6b",
      category_name: "De colega/agência",
    });
    expect(r.success).toBe(true);
  });
});
