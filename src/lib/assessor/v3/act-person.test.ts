import { describe, it, expect } from "vitest";
import { executeToolCalls } from "./act.server";

function fakeCtx() {
  const inserts: any[] = [];
  const supabase = {
    from: (table: string) => ({
      insert: (row: any) => ({
        select: () => ({
          single: () => {
            inserts.push({ table, row });
            return Promise.resolve({ data: { id: "p1", name: row.name }, error: null });
          },
        }),
      }),
    }),
  };
  return { ctx: { supabase, userId: "u1", channel: "whatsapp", sourceMessageId: null } as any, inserts };
}

describe("create_person — tipos de relação escritos pelo modelo", () => {
  for (const [input, expected] of [
    ["lead", "potencial_cliente"],
    ["cliente", "potencial_cliente"],
    ["vendedor", "proprietario"],
    ["buyer", "comprador"],
    ["qualquer coisa", "outro"],
    ["proprietario", "proprietario"],
  ] as const) {
    it(`"${input}" grava como ${expected}`, async () => {
      const { ctx, inserts } = fakeCtx();
      const res = await executeToolCalls(ctx, [
        { name: "create_person", arguments: { name: "João Paulo", phone: "934 555 444", relationship_type: input } } as any,
      ]);
      expect(res[0].ok).toBe(true);
      expect(inserts[0].table).toBe("people");
      expect(inserts[0].row.relationship_type).toBe(expected);
    });
  }
});
