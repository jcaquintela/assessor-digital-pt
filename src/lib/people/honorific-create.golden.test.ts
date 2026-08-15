import { describe, it, expect } from "vitest";
import { dispatchToolCall } from "@/lib/assessor/v2/domain.server";

function fakeCtx() {
  const inserts: any[] = [];
  const supabase = {
    from: () => ({
      insert: (row: any) => ({
        select: () => ({
          single: () => {
            inserts.push(row);
            return Promise.resolve({ data: { id: "p1", name: row.name }, error: null });
          },
        }),
      }),
    }),
  };
  return { ctx: { supabase, userId: "u1" } as any, inserts };
}

describe("create_person — honoríficos nunca entram no nome gravado", () => {
  for (const [input, expected] of [
    ["Dr Carlos", "Carlos"],
    ["Dr. João", "João"],
    ["Sra Carla Martins", "Carla Martins"],
    ["Eng. Costa", "Costa"],
    ["João", "João"],
  ] as const) {
    it(`"${input}" grava "${expected}"`, async () => {
      const { ctx, inserts } = fakeCtx();
      const res = await dispatchToolCall(ctx, "create_person", JSON.stringify({ name: input, relationship_type: "outro" }));
      expect((res as any).ok).toBe(true);
      expect(inserts[0].name).toBe(expected);
    });
  }
});
