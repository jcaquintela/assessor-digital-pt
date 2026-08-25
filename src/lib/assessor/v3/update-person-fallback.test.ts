// Golden 3 e 5 — update_person com id inválido e o caso Ana Catarina Santos.
import { describe, expect, it } from "vitest";
import { TOOL_REGISTRY } from "../v2/domain.server";
import { recordCreatedResource } from "./created-memory.server";

const REAL_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const FAKE_ID = "99999999-9999-4999-8999-999999999999";

function fakeDb(people: any[]) {
  const conv: any = {};
  const supabase = {
    from(table: string) {
      const f: Record<string, any> = {};
      const api: any = {
        select() { return api; },
        eq(c: string, v: any) { f[c] = v; return api; },
        ilike(c: string, v: any) { f[`ilike:${c}`] = v; return api; },
        limit() {
          const name = f["ilike:name"]; const phone = f.phone;
          return Promise.resolve({
            data: people.filter((p) =>
              (name ? p.name.toLowerCase() === String(name).toLowerCase() : true)
              && (phone ? p.phone === phone : true)),
          });
        },
        maybeSingle() {
          if (table === "conversation_states") return Promise.resolve({ data: conv.row ?? null });
          return Promise.resolve({ data: people.find((p) => p.id === f.id) ?? null });
        },
        single() {
          const row = people.find((p) => p.id === f.id);
          if (row) Object.assign(row, api._patch ?? {});
          return Promise.resolve({ data: row ? { id: row.id, name: row.name } : null, error: row ? null : { message: "no row" } });
        },
        update(patch: any) { api._patch = patch; return api; },
        upsert(row: any) { conv.row = { ...(conv.row ?? {}), ...row }; return Promise.resolve({ error: null }); },
        insert() { return Promise.resolve({ error: null }); },
      };
      return api;
    },
  };
  return { supabase, conv };
}

function person() {
  return {
    id: REAL_ID, name: "Ana Catarina Santos", phone: "+351912345678",
    email: null, relationship_type: "potencial_cliente", notes: null,
  };
}

describe("update_person — rede de segurança no id", () => {
  it("golden 3a: id inexistente resolve pela memória de escrita da conversa", async () => {
    const p = person();
    const db = fakeDb([p]);
    await recordCreatedResource(db.supabase, {
      userId: "u1", channel: "whatsapp", type: "person", id: REAL_ID,
    });
    const res = await TOOL_REGISTRY.update_person(
      { supabase: db.supabase, userId: "u1", channel: "whatsapp" } as any,
      { id: FAKE_ID, name: "Ana Catarina Santos", notes: "Procura T3 em Cascais" },
    );
    expect(res.ok).toBe(true);
    expect(p.notes).toBe("Procura T3 em Cascais");
  });

  it("golden 3b: sem memória, resolve por nome exacto", async () => {
    const p = person();
    const db = fakeDb([p]);
    const res = await TOOL_REGISTRY.update_person(
      { supabase: db.supabase, userId: "u1", channel: "whatsapp" } as any,
      { id: FAKE_ID, name: "Ana Catarina Santos", email: "ana@exemplo.pt" },
    );
    expect(res.ok).toBe(true);
    expect(p.email).toBe("ana@exemplo.pt");
  });

  it("golden 3c: sem nada que resolva, falha honestamente", async () => {
    const db = fakeDb([]);
    const res = await TOOL_REGISTRY.update_person(
      { supabase: db.supabase, userId: "u1", channel: "whatsapp" } as any,
      { id: FAKE_ID, notes: "algo" },
    );
    expect(res.ok).toBe(false);
    expect(res.error).toBe("pessoa_nao_encontrada");
  });

  it("golden 5: caso Ana Catarina Santos ponta a ponta", async () => {
    const db = fakeDb([]);
    const people: any[] = [];
    // criação
    const created = { person: { id: REAL_ID, name: "Ana Catarina Santos" } };
    people.push(person());
    const db2 = fakeDb(people);
    await recordCreatedResource(db2.supabase, {
      userId: "u1", channel: "whatsapp", type: "person", id: created.person.id,
    });
    // clarificação seguinte, com id inventado pelo modelo
    const res = await TOOL_REGISTRY.update_person(
      { supabase: db2.supabase, userId: "u1", channel: "whatsapp" } as any,
      { id: FAKE_ID, phone: "912 345 678", notes: "Interessada no T2 do Restelo" },
    );
    expect(res.ok).toBe(true);
    expect(people[0].notes).toBe("Interessada no T2 do Restelo");
    expect(db).toBeTruthy();
  });
});
