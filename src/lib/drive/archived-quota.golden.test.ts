// Golden: quota mensal e grelha do Drive usam o mesmo critério de arquivado.
// Invariante: quota do mês = ativos do mês + arquivados do mês.
import { describe, it, expect } from "vitest";
import { filesThisMonth } from "./monthly-quota.server";
import { isFileActive, isFileArchived, countsForQuota } from "./archived";

function fakeSupabase(rows: any[]) {
  return {
    from() {
      let r = rows.map((x) => ({ ...x }));
      let head = false;
      const b: any = {
        select: (_c?: string, o?: { head?: boolean }) => { head = !!o?.head; return b; },
        eq: (c: string, v: any) => { r = r.filter((x) => x[c] === v); return b; },
        is: (c: string, v: any) => { r = r.filter((x) => (x[c] ?? null) === v); return b; },
        gte: (c: string, v: string) => { r = r.filter((x) => String(x[c]) >= v); return b; },
        then: (res: any) => res(head ? { count: r.length, data: null } : { data: r }),
      };
      return b;
    },
  };
}

const now = new Date("2026-08-15T12:00:00Z");
const FILES = [
  { id: "f1", user_id: "u1", created_at: "2026-08-02T10:00:00Z", archived_at: null, deleted_at: null },
  { id: "f2", user_id: "u1", created_at: "2026-08-05T10:00:00Z", archived_at: null, deleted_at: null },
  { id: "f3", user_id: "u1", created_at: "2026-08-07T10:00:00Z", archived_at: "2026-08-08T10:00:00Z", deleted_at: null },
  { id: "f4", user_id: "u1", created_at: "2026-08-09T10:00:00Z", archived_at: null, deleted_at: "2026-08-10T10:00:00Z" },
  { id: "f5", user_id: "u1", created_at: "2026-07-20T10:00:00Z", archived_at: null, deleted_at: null },
];

describe("Drive — quota e grelha com o mesmo critério", () => {
  it("quota conta arquivados do mês e ignora a reciclagem", async () => {
    const used = await filesThisMonth(fakeSupabase(FILES), "u1", now);
    expect(used).toBe(3); // f1, f2, f3
  });

  it("quota = ativos + arquivados do mês (com 1 ficheiro arquivado)", async () => {
    const used = await filesThisMonth(fakeSupabase(FILES), "u1", now);
    const doMes = FILES.filter((f) => f.created_at >= "2026-08-01");
    const ativos = doMes.filter(isFileActive).length;
    const arquivados = doMes.filter(isFileArchived).length;
    expect(arquivados).toBe(1);
    expect(used).toBe(ativos + arquivados);
    expect(doMes.filter(countsForQuota).length).toBe(used);
  });
});
