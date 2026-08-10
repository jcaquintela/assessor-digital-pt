import { describe, it, expect, vi, beforeEach } from "vitest";
import { recordInviteAttempt, retryPendingInvites, MAX_INVITE_ATTEMPTS } from "./invite-retry.server";

const send = vi.fn();
vi.mock("@/lib/admin/invite-send.server", () => ({ sendInvite: (...a: any[]) => send(...a) }));
vi.mock("@/lib/whatsapp/phone", () => ({ normalizePhone: (p: string | null) => p }));
vi.mock("@/lib/admin/invite-message.server", () => ({
  buildInviteMessage: async () => ({ texto: "Olá", url: "https://x/entrar?token=t" }),
}));

// BD de mentira: uma tabela em memória chega para exercitar a fila.
function fakeDb(fila: any[]) {
  const inserted: any[] = [];
  const updated: any[] = [];
  const api = {
    fila,
    inserted,
    updated,
    from(table: string) {
      if (table === "profiles") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: "Júlio", phone: "351912345678" } }) }) }),
        };
      }
      const q: any = { _f: [...fila] };
      q.select = () => q;
      q.eq = (col: string, val: any) => {
        q._f = q._f.filter((r: any) => r[col] === val);
        return q;
      };
      q.in = () => q;
      q.order = () => q;
      q.limit = () => Promise.resolve({ data: q._f });
      q.maybeSingle = async () => ({ data: q._f[0] ?? null });
      q.insert = async (row: any) => {
        inserted.push(row);
        fila.push({ id: `i${fila.length}`, attempts: 1, status: "pendente", ...row });
        return { data: null };
      };
      q.update = (patch: any) => ({
        eq: async (_c: string, id: string) => {
          updated.push({ id, patch });
          const row = fila.find((r) => r.id === id);
          if (row) Object.assign(row, patch);
          return { data: null };
        },
      });
      return q;
    },
  };
  return api as any;
}

beforeEach(() => vi.clearAllMocks());

describe("golden — fila de convites por reenviar", () => {
  it("1) falha entra na fila como pendente", async () => {
    const db = fakeDb([]);
    await recordInviteAttempt(db, {
      userId: "u1",
      canal: "whatsapp",
      enviado: false,
      destino: "+351 9XX XXX 678",
      erro: "template ainda não está aprovado",
    });
    expect(db.inserted[0]).toMatchObject({ user_id: "u1", status: "pendente", reason: "template ainda não está aprovado" });
  });

  it("2) sucesso fecha a entrada pendente", async () => {
    const db = fakeDb([{ id: "a1", user_id: "u1", canal: "whatsapp", status: "pendente", attempts: 2 }]);
    await recordInviteAttempt(db, { userId: "u1", canal: "whatsapp", enviado: true, destino: "+351 9XX XXX 678" });
    expect(db.updated[0].patch).toMatchObject({ status: "enviado" });
  });

  it("3) nova falha incrementa e esgota ao fim do limite", async () => {
    const db = fakeDb([
      { id: "a1", user_id: "u1", canal: "whatsapp", status: "pendente", attempts: MAX_INVITE_ATTEMPTS - 1 },
    ]);
    await recordInviteAttempt(db, { userId: "u1", canal: "whatsapp", enviado: false, destino: null, erro: "x" });
    expect(db.updated[0].patch).toMatchObject({ attempts: MAX_INVITE_ATTEMPTS, status: "esgotado" });
  });

  it("4) reenvio automático da fila quando o template fica aprovado", async () => {
    send.mockResolvedValue({ enviado: true, destino: "+351 9XX XXX 678", via: "template" });
    const db = fakeDb([
      { id: "a1", user_id: "u1", canal: "whatsapp", status: "pendente", attempts: 1 },
      { id: "a2", user_id: "u2", canal: "whatsapp", status: "pendente", attempts: 1 },
    ]);
    const r = await retryPendingInvites(db);
    expect(r).toMatchObject({ tentados: 2, enviados: 2, falhados: 0 });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("5) uma falha não trava a fila", async () => {
    send.mockRejectedValueOnce(new Error("boom")).mockResolvedValue({ enviado: true, destino: "d", via: "template" });
    const db = fakeDb([
      { id: "a1", user_id: "u1", canal: "whatsapp", status: "pendente", attempts: 1 },
      { id: "a2", user_id: "u2", canal: "whatsapp", status: "pendente", attempts: 1 },
    ]);
    const r = await retryPendingInvites(db);
    expect(r).toMatchObject({ tentados: 2, enviados: 1, falhados: 1 });
  });
});
