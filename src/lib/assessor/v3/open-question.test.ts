// Golden tests — âncora de pergunta em aberto + rajada na confirmação órfã.
// Caso real reconstituído: 30/07, 19:54-19:56, "Casa Final B".
import { describe, it, expect } from "vitest";
import { pendingSlot } from "../pending-slots";
import {
  looksLikeEntityAnswer,
  shouldRecordOpenQuestion,
  isOpenQuestionExpired,
  orphanBurstReply,
  OPEN_QUESTION_TTL_MS,
} from "./open-question";
import {
  recordOpenQuestion,
  findOpenQuestion,
  findJustClosedPending,
  subjectOfPending,
  answerOpenQuestion,
} from "./open-question.server";

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const future = (ms: number) => new Date(Date.now() + ms).toISOString();

function fakeDb(rows: any[]) {
  const inserted: any[] = [];
  const updated: any[] = [];
  const db = {
    inserted,
    updated,
    from() {
      const state: any = { statuses: null as string[] | null };
      const q: any = {
        select() { return q; },
        eq() { return q; },
        in(_col: string, vals: string[]) { state.statuses = vals; return q; },
        order() { return q; },
        limit() {
          return Promise.resolve({
            data: rows.filter((r) => !state.statuses || state.statuses.includes(r.status)),
          });
        },
        maybeSingle() { return Promise.resolve({ data: inserted[inserted.length - 1] ?? null }); },
        insert(payload: any) {
          const row = { id: `p${inserted.length + 1}`, ...payload };
          inserted.push(row);
          return q;
        },
        update(patch: any) { updated.push(patch); return q; },
      };
      return q;
    },
  };
  return db;
}

describe("golden 1 — rajada 'Ainda não' / 'sim' (2s) não gera pergunta órfã sem contexto", () => {
  const closed = {
    id: "pa1",
    intent: "create_follow_up",
    status: "cancelled",
    original_content: "Casa Final B — placa registada",
    structured_payload: { title: "o lembrete das placas" },
    updated_at: iso(2_000),
    created_at: iso(60_000),
  };

  it("encontra o pendente que a mesma rajada acabou de fechar", async () => {
    const db = fakeDb([closed]);
    const found = await findJustClosedPending(db as any, { userId: "u1", channel: "telegram" });
    expect(found?.id).toBe("pa1");
    expect(subjectOfPending(found)).toBe("o lembrete das placas");
  });

  it("a pergunta órfã nomeia o assunto em vez de perguntar às cegas", () => {
    const reply = orphanBurstReply("o lembrete das placas");
    expect(reply).toContain("o lembrete das placas");
    expect(reply.toLowerCase()).not.toContain("a que te referes");
    expect(reply).toMatch(/\?$/);
  });

  it("fora da janela de rajada não inventa contexto", async () => {
    const db = fakeDb([{ ...closed, updated_at: iso(60_000) }]);
    const found = await findJustClosedPending(db as any, { userId: "u1", channel: "telegram" });
    expect(found).toBeNull();
    expect(orphanBurstReply(subjectOfPending(found))).toBe("");
  });

  it("a pergunta fica gravada com expiração curta", async () => {
    const db = fakeDb([]);
    await recordOpenQuestion(db as any, {
      userId: "u1", channel: "telegram",
      question: orphanBurstReply("o lembrete das placas"),
      subject: "o lembrete das placas",
    });
    const row = db.inserted[0];
    expect(row.intent).toBe("open_question");
    expect(pendingSlot(row.intent)).toBe("clarify");
    const ttl = new Date(row.expires_at).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(OPEN_QUESTION_TTL_MS - 5_000);
    expect(ttl).toBeLessThanOrEqual(OPEN_QUESTION_TTL_MS);
  });
});

describe("golden 2 — resposta com nome de entidade resolve contra a pergunta em aberto", () => {
  const open = {
    id: "oq1",
    intent: "open_question",
    status: "collecting_information",
    original_content: "Claro. A que te referes?",
    structured_payload: { question: "Claro. A que te referes?" },
    expires_at: future(9 * 60_000),
    updated_at: iso(1_000),
    created_at: iso(1_000),
  };

  it("'Casa Final B' devolve o imóvel real, não Diversos", async () => {
    const db = fakeDb([open]);
    const calls: string[] = [];
    const res = await answerOpenQuestion(db as any, {
      userId: "u1", channel: "telegram", text: "Casa Final B",
      lookup: async (tool, args) => {
        calls.push(`${tool}:${(args as any).query}`);
        if (tool !== "search_properties") return { name: tool, ok: true, data: { items: [] } } as any;
        return {
          name: tool, ok: true,
          data: { items: [{ title: "Casa Final B", typology: "T3", location: "Espinho" }] },
        } as any;
      },
    });
    expect(calls).toContain("search_properties:Casa Final B");
    expect(res?.tool).toBe("search_properties");
    expect(res?.reply).toContain("Casa Final B");
    // a pergunta em aberto é fechada, não fica a apanhar respostas seguintes
    expect(db.updated.some((u) => u.status === "executed")).toBe(true);
  });

  it("cai para pessoas quando não é imóvel", async () => {
    const db = fakeDb([open]);
    const res = await answerOpenQuestion(db as any, {
      userId: "u1", channel: "telegram", text: "Paulo Lopes",
      lookup: async (tool) =>
        tool === "search_people"
          ? { name: tool, ok: true, data: { items: [{ name: "Paulo Lopes", phone: "912345678" }] } } as any
          : { name: tool, ok: true, data: { items: [] } } as any,
    });
    expect(res?.tool).toBe("search_people");
    expect(res?.reply).toContain("Paulo Lopes");
  });

  it("sem resultado nenhum devolve null e o turno segue o fluxo normal", async () => {
    const db = fakeDb([open]);
    const res = await answerOpenQuestion(db as any, {
      userId: "u1", channel: "telegram", text: "Casa Que Nao Existe",
      lookup: async (tool) => ({ name: tool, ok: true, data: { items: [] } }) as any,
    });
    expect(res).toBeNull();
  });
});

describe("golden 3 — pergunta em aberto sem resposta expira sozinha", () => {
  const expired = {
    id: "oq2",
    intent: "open_question",
    status: "collecting_information",
    original_content: "Claro. A que te referes?",
    structured_payload: {},
    expires_at: iso(60_000),
    updated_at: iso(11 * 60_000),
    created_at: iso(11 * 60_000),
  };

  it("é marcada como expirada e deixa de ser encontrada", async () => {
    const db = fakeDb([expired]);
    expect(await findOpenQuestion(db as any, { userId: "u1", channel: "telegram" })).toBeNull();
    expect(db.updated.some((u) => u.status === "expired")).toBe(true);
  });

  it("uma resposta tardia já não é lida contra ela", async () => {
    const db = fakeDb([expired]);
    const res = await answerOpenQuestion(db as any, {
      userId: "u1", channel: "telegram", text: "Casa Final B",
      lookup: async (tool) => ({ name: tool, ok: true, data: { items: [{ title: "Casa Final B" }] } }) as any,
    });
    expect(res).toBeNull();
  });

  it("isOpenQuestionExpired é a mesma regra, sem base de dados", () => {
    expect(isOpenQuestionExpired({ expires_at: iso(1_000) })).toBe(true);
    expect(isOpenQuestionExpired({ expires_at: future(60_000) })).toBe(false);
    expect(isOpenQuestionExpired(null)).toBe(true);
  });
});

describe("regressão — o que já funciona não muda", () => {
  it("a ranhura 'clarify' nunca rouba o assunto principal", () => {
    expect(pendingSlot("open_question")).toBe("clarify");
    expect(pendingSlot("create_follow_up")).toBe("main");
    expect(pendingSlot("choosing_cancel_target")).toBe("cancel");
  });

  it("sem pergunta em aberto, um nome solto não é reinterpretado", async () => {
    const db = fakeDb([]);
    const res = await answerOpenQuestion(db as any, {
      userId: "u1", channel: "telegram", text: "Casa Final B",
      lookup: async (tool) => ({ name: tool, ok: true, data: { items: [{ title: "Casa Final B" }] } }) as any,
    });
    expect(res).toBeNull();
  });

  it("sim/não e pedidos de acção não são lidos como resposta de entidade", () => {
    for (const t of ["sim", "Ainda não", "ok", "Marca visita à Casa Final B", "Manda mensagem ao Paulo"]) {
      expect(looksLikeEntityAnswer(t)).toBe(false);
    }
    expect(looksLikeEntityAnswer("Casa Final B")).toBe(true);
  });

  it("só perguntas sem ferramenta deixam âncora", () => {
    expect(shouldRecordOpenQuestion({ reply: "Claro. A que te referes?" })).toBe(true);
    expect(shouldRecordOpenQuestion({ reply: "Claro. A que te referes?", toolsExecuted: 1 })).toBe(false);
    expect(shouldRecordOpenQuestion({ reply: "Marcada a visita amanhã às 14:30." })).toBe(false);
  });
});
