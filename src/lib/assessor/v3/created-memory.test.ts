import { describe, expect, it } from "vitest";
import { createdResourceFrom } from "./created-memory";
import { enforceTransparentConfirmation, promisesFutureWrite } from "./write-receipt";
import { recordCreatedResource, readCreatedResource } from "./created-memory.server";

const PERSON_ID = "11111111-2222-4333-8444-555555555555";

// Supabase de mentira, só com o que estes testes tocam.
function fakeDb() {
  const state: Record<string, any> = {};
  const people: any[] = [];
  const supabase = {
    from(table: string) {
      const api: any = {
        _filters: {} as Record<string, any>,
        select() { return api; },
        eq(col: string, val: any) { api._filters[col] = val; return api; },
        ilike(col: string, val: any) { api._filters[`ilike:${col}`] = val; return api; },
        limit() {
          if (table !== "people") return Promise.resolve({ data: [] });
          const name = api._filters["ilike:name"];
          const phone = api._filters.phone;
          const rows = people.filter((p) =>
            (name ? p.name.toLowerCase() === String(name).toLowerCase() : true)
            && (phone ? p.phone === phone : true));
          return Promise.resolve({ data: rows });
        },
        maybeSingle() {
          if (table === "conversation_states") return Promise.resolve({ data: state.row ?? null });
          const row = people.find((p) => p.id === api._filters.id) ?? null;
          return Promise.resolve({ data: row });
        },
        upsert(row: any) { state.row = { ...(state.row ?? {}), ...row }; return Promise.resolve({ error: null }); },
        insert() { return Promise.resolve({ error: null }); },
      };
      return api;
    },
  };
  return { supabase, state, people };
}

describe("golden 1 — create_person guarda o recurso na memória de conversa", () => {
  it("extrai o id do resultado da ferramenta", () => {
    expect(createdResourceFrom("create_person", { person: { id: PERSON_ID, name: "Ana Catarina Santos" } }))
      .toEqual({ type: "person", id: PERSON_ID });
    expect(createdResourceFrom("search_people", { results: [] })).toBeNull();
  });

  it("persiste last_created_resource_id em conversation_states", async () => {
    const db = fakeDb();
    await recordCreatedResource(db.supabase, {
      userId: "u1", channel: "whatsapp", type: "person", id: PERSON_ID,
    });
    expect(db.state.row.last_created_resource_type).toBe("person");
    expect(db.state.row.last_created_resource_id).toBe(PERSON_ID);
    expect(db.state.row.active_person_id).toBe(PERSON_ID);
  });
});

describe("golden 2 — referência de seguimento resolve pela memória de escrita", () => {
  it("lê o recurso acabado de criar", async () => {
    const db = fakeDb();
    await recordCreatedResource(db.supabase, {
      userId: "u1", channel: "whatsapp", type: "person", id: PERSON_ID,
    });
    expect(await readCreatedResource(db.supabase, { userId: "u1", channel: "whatsapp" }))
      .toEqual({ type: "person", id: PERSON_ID });
  });
});

describe("golden 4 — recibo de create_person no passado", () => {
  it("substitui 'Adiciono...' pelo recibo já executado", () => {
    const out = enforceTransparentConfirmation(
      "Adiciono a Ana Catarina Santos aos teus contactos?",
      [{ name: "create_person", ok: true, data: { person: { name: "Ana Catarina Santos" } } }],
      { executedOk: true },
    );
    expect(promisesFutureWrite("Adiciono a Ana Catarina Santos")).toBe(true);
    expect(out).toContain("Guardei o contacto");
    expect(out).toContain("Pessoas");
    expect(promisesFutureWrite(out)).toBe(false);
  });

  it("não mexe numa resposta já no passado", () => {
    const reply = "Adicionei a Ana Catarina Santos em Pessoas.";
    expect(enforceTransparentConfirmation(reply, [
      { name: "create_person", ok: true, data: { person: { name: "Ana Catarina Santos" } } },
    ], { executedOk: true })).toBe(reply);
  });
});
