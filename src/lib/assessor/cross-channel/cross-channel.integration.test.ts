// Integração simulada (base em memória) da conversa partilhada:
// memória, substituição de pendentes, isolamento entre contas, guarda de
// turno e concorrência entre WhatsApp e Telegram.
import { describe, it, expect, beforeEach } from "vitest";
import { createFakeDb } from "./test-fake-db";
import {
  __resetCrossChannelStateForTests,
  __setCrossChannelForTests,
  ensureAccountState,
} from "./scope.server";
import {
  createPendingAction,
  findActivePendingAction,
  getConversationState,
  markPendingActionStatus,
  upsertConversationState,
} from "../memory.server";
import { beginCrossChannelTurn, endCrossChannelTurn, snapshotActive } from "./turn.server";
import { withConversationLock } from "../channel-gateway/lock.server";

const U = "user-a";
const OTHER = "user-b";

beforeEach(() => __resetCrossChannelStateForTests());

async function newPending(db: any, userId: string, channel: string, q = "Crio o lembrete para ligar à Joana?") {
  return (await createPendingAction(db, {
    userId, channel, intent: "create_reminder", originalContent: "liga à joana",
    payload: { title: "Ligar à Joana" }, currentQuestion: q,
  }))!;
}

describe("compatibilidade (interruptor desligado)", () => {
  it("cada canal continua a ver só os seus pendentes", async () => {
    const db = createFakeDb();
    __setCrossChannelForTests(U, false);
    await newPending(db, U, "whatsapp");
    expect(await findActivePendingAction(db, U, "telegram")).toBeNull();
    expect((await findActivePendingAction(db, U, "whatsapp"))?.channel).toBe("whatsapp");
  });
});

describe("conversa partilhada (interruptor ligado)", () => {
  it("pendente do WhatsApp é visível no Telegram e mantém o canal de origem", async () => {
    const db = createFakeDb();
    __setCrossChannelForTests(U, true);
    const p = await newPending(db, U, "whatsapp");
    const seen = await findActivePendingAction(db, U, "telegram");
    expect(seen?.id).toBe(p.id);
    expect(seen?.channel).toBe("whatsapp");
    expect((seen as any).presented_channels).toEqual(["whatsapp"]);
  });

  it("um assunto em aberto por conta: o novo no Telegram substitui o do WhatsApp", async () => {
    const db = createFakeDb();
    __setCrossChannelForTests(U, true);
    const a = await newPending(db, U, "whatsapp");
    const b = await newPending(db, U, "telegram", "Marco a visita ao T2?");
    const rowA = db.tables.pending_actions.find((r) => r.id === a.id)!;
    expect(rowA.status).toBe("cancelled");
    expect((await findActivePendingAction(db, U, "whatsapp"))?.id).toBe(b.id);
    // A proposta substituída não desaparece em silêncio.
    expect(db.tables.miscellaneous_items?.length).toBe(1);
  });

  it("contexto partilhado: o que se diz no WhatsApp lê-se no Telegram, com origem", async () => {
    const db = createFakeDb();
    __setCrossChannelForTests(U, true);
    await upsertConversationState(db, { userId: U, channel: "whatsapp", lastEntityType: "person", lastEntityId: "joana" });
    const st = await getConversationState(db, U, "telegram");
    expect(st?.last_entity_id).toBe("joana");
    expect((st as any)?.last_channel).toBe("whatsapp");
  });

  it("primeira vez ligado: o estado nasce da conversa por canal mais recente; desligar volta ao antigo", async () => {
    const db = createFakeDb({
      conversation_states: [
        { user_id: U, channel: "whatsapp", external_conversation_id: "default", last_entity_id: "velho", updated_at: "2026-11-01T00:00:00Z" },
        { user_id: U, channel: "telegram", external_conversation_id: "telegram", last_entity_id: "recente", updated_at: "2026-11-10T00:00:00Z" },
      ],
    });
    __setCrossChannelForTests(U, true);
    await ensureAccountState(db, U);
    await ensureAccountState(db, U); // idempotente
    const acct = db.tables.conversation_states.filter((r) => r.channel === "account");
    expect(acct).toHaveLength(1);
    expect(acct[0].last_entity_id).toBe("recente");
    __setCrossChannelForTests(U, false);
    expect((await getConversationState(db, U, "whatsapp"))?.last_entity_id).toBe("velho");
  });
});

describe("isolamento entre contas", () => {
  it("pendentes e reservas de outra conta nunca são vistos nem tocados", async () => {
    const db = createFakeDb();
    __setCrossChannelForTests(U, true);
    __setCrossChannelForTests(OTHER, true);
    const theirs = await newPending(db, OTHER, "whatsapp");
    expect(await findActivePendingAction(db, U, "whatsapp")).toBeNull();
    expect(await findActivePendingAction(db, U, "telegram")).toBeNull();
    const g = await beginCrossChannelTurn(db, { userId: U, channel: "whatsapp", text: "sim", token: "t1" });
    expect(g).toEqual({ kind: "proceed", claimed: false });
    const r = await db.rpc("claim_pending_confirmation", { _user_id: U, _ids: [theirs.id], _token: "x", _ttl_seconds: 120 });
    expect(r.data).toBe(0);
    expect(db.tables.pending_actions.find((x) => x.id === theirs.id)?.confirm_token).toBeNull();
  });
});

describe("guarda de turno", () => {
  it("'sim' no Telegram a pergunta do WhatsApp: re-pergunta, marca como mostrada, e só o 2.º 'sim' reserva", async () => {
    const db = createFakeDb();
    __setCrossChannelForTests(U, true);
    const p = await newPending(db, U, "whatsapp");
    const g1 = await beginCrossChannelTurn(db, { userId: U, channel: "telegram", text: "sim", token: "tg:1" });
    expect(g1.kind).toBe("reply");
    if (g1.kind === "reply") expect(g1.reason).toBe("represent");
    const row = db.tables.pending_actions.find((r) => r.id === p.id)!;
    expect(row.status).toBe("pending_confirmation"); // nada executado
    expect(row.presented_channels).toEqual(["whatsapp", "telegram"]);
    const g2 = await beginCrossChannelTurn(db, { userId: U, channel: "telegram", text: "sim", token: "tg:2" });
    expect(g2).toEqual({ kind: "proceed", claimed: true });
    expect(row.confirm_token).toBe("tg:2");
  });

  it("fim de turno: liberta a reserva e regista onde o consultor respondeu", async () => {
    const db = createFakeDb();
    __setCrossChannelForTests(U, true);
    const p = await newPending(db, U, "whatsapp");
    const before = await snapshotActive(db, U);
    const g = await beginCrossChannelTurn(db, { userId: U, channel: "whatsapp", text: "sim", token: "wa:1" });
    expect(g.kind).toBe("proceed");
    await markPendingActionStatus(db, p.id, "executed");
    await endCrossChannelTurn(db, { userId: U, channel: "whatsapp", token: "wa:1", claimed: true, before });
    const row = db.tables.pending_actions.find((r) => r.id === p.id)!;
    expect(row.confirm_token).toBeNull();
    expect(row.resolved_channel).toBe("whatsapp");
  });

  it("pergunta do WhatsApp re-perguntada num turno do Telegram fica marcada como mostrada no Telegram", async () => {
    const db = createFakeDb();
    __setCrossChannelForTests(U, true);
    const p = await newPending(db, U, "whatsapp");
    const before = await snapshotActive(db, U);
    // O motor, no Telegram, volta a perguntar (pergunta atualizada).
    await db.from("pending_actions").update({ current_question: "A que horas ligo à Joana?" }).eq("id", p.id);
    await endCrossChannelTurn(db, { userId: U, channel: "telegram", token: "tg:9", claimed: false, before });
    expect(db.tables.pending_actions.find((r) => r.id === p.id)?.presented_channels).toEqual(["whatsapp", "telegram"]);
  });

  it("pendente do WhatsApp não tocado num turno do Telegram continua só 'mostrado no WhatsApp'", async () => {
    const db = createFakeDb();
    __setCrossChannelForTests(U, true);
    const p = await newPending(db, U, "whatsapp");
    const before = await snapshotActive(db, U);
    await endCrossChannelTurn(db, { userId: U, channel: "telegram", token: "tg:10", claimed: false, before });
    expect(db.tables.pending_actions.find((r) => r.id === p.id)?.presented_channels).toEqual(["whatsapp"]);
  });
});

describe("concorrência WhatsApp × Telegram", () => {
  // Executor simulado: confirma o pendente ativo (como os resolvers reais).
  async function turn(db: any, channel: string, token: string, executions: string[]) {
    const g = await beginCrossChannelTurn(db, { userId: U, channel, text: "sim", token });
    if (g.kind !== "proceed") return g.kind === "reply" ? g.reason : "?";
    const pending = await findActivePendingAction(db, U, channel);
    if (pending) {
      await new Promise((r) => setTimeout(r, 15)); // execução demora
      executions.push(`${pending.id}@${channel}`);
      await markPendingActionStatus(db, pending.id, "executed");
    }
    await endCrossChannelTurn(db, { userId: U, channel, token, claimed: g.claimed, before: { rows: new Map() } });
    return pending ? "executed" : "nothing";
  }

  it("dois 'sim' simultâneos (um por canal) executam no máximo uma vez, mesmo sem lock", async () => {
    const db = createFakeDb();
    __setCrossChannelForTests(U, true);
    const p = await newPending(db, U, "whatsapp");
    await db.rpc("mark_pending_presented", { _user_id: U, _ids: [p.id], _channel: "telegram" });
    const executions: string[] = [];
    const results = await Promise.all([
      turn(db, "whatsapp", "wa:1", executions),
      turn(db, "telegram", "tg:1", executions),
    ]);
    expect(executions).toHaveLength(1);
    expect(results.sort()).toEqual(["busy", "executed"]);
  });

  it("com o lock da conta, os turnos dos dois canais correm um de cada vez e o 2.º diz que já ficou tratado", async () => {
    const db = createFakeDb();
    __setCrossChannelForTests(U, true);
    const p = await newPending(db, U, "whatsapp");
    await db.rpc("mark_pending_presented", { _user_id: U, _ids: [p.id], _channel: "telegram" });
    const executions: string[] = [];
    const order: string[] = [];
    const locked = (channel: string, token: string) =>
      withConversationLock(db, U, "account", async () => {
        order.push(`start-${channel}`);
        const r = await turn(db, channel, token, executions);
        order.push(`end-${channel}`);
        return r;
      }, { strict: true });
    const results = await Promise.all([locked("whatsapp", "wa:1"), locked("telegram", "tg:1")]);
    expect(executions).toHaveLength(1);
    expect(order[1]).toBe(`end-${order[0].slice(6)}`); // nunca dois turnos ao mesmo tempo
    expect(results).toContain("executed");
    expect(results).toContain("already_resolved");
  });

  it("lock strict: um erro passageiro do lock volta a tentar em vez de correr sem lock", async () => {
    const db = createFakeDb();
    let fails = 1;
    const flaky = {
      ...db,
      rpc: async (fn: string, a: any) => {
        if (fn === "try_acquire_conversation_lock" && fails-- > 0) return { data: null, error: { message: "timeout" } };
        return db.rpc(fn, a);
      },
    };
    let acquiredSeen: boolean | null = null;
    await withConversationLock(flaky, U, "account", async (acquired) => { acquiredSeen = acquired; }, { strict: true });
    expect(acquiredSeen).toBe(true);
  });
});
