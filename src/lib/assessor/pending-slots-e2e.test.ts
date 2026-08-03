// E2E: dois pedidos pendentes ao mesmo tempo (pergunta de agendamento do motor
// + lista de escolha de documentos do Drive). Um "sim"/"não" só pode resolver
// o pedido a que pertence — nunca o outro.

import { beforeEach, describe, expect, it, vi } from "vitest";

const hits = [
  { id: "aaaaaaaa-0000-4000-8000-000000000001", fileName: "CPU Gondomar.pdf", mimeType: "application/pdf", storagePath: "p/1", docType: "cpu", summary: null, entityLabels: ["Gondomar"], score: 5 },
  { id: "bbbbbbbb-0000-4000-8000-000000000002", fileName: "Caderneta Benfica.pdf", mimeType: "application/pdf", storagePath: "p/2", docType: "caderneta", summary: null, entityLabels: ["Benfica"], score: 5 },
  { id: "cccccccc-0000-4000-8000-000000000003", fileName: "Certidao Porto.pdf", mimeType: "application/pdf", storagePath: "p/3", docType: "certidao", summary: null, entityLabels: ["Porto"], score: 5 },
];

vi.mock("@/lib/drive/retrieve.server", () => ({
  findDocuments: vi.fn(async () => hits),
  findDocumentsForSubject: vi.fn(async () => ({ label: "Ana", hits })),
  findDocumentsByMeta: vi.fn(async () => []),
  loadDocument: vi.fn(async (_s: any, _u: string, id: string) => {
    const h = hits.find((x) => x.id === id)!;
    return { ok: true, fileName: h.fileName, mimeType: h.mimeType, bytes: new Uint8Array([1]), signedUrl: "https://x/y" };
  }),
}));

import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";
import { createPendingAction, findActivePendingAction, markPendingActionStatus } from "./memory.server";
import { handleDocumentRequest } from "@/lib/drive/retrieve-channel.server";
import { encodeDocCommand, shortDocId } from "@/lib/drive/retrieve";

const USER = "00000000-0000-4000-8000-0000000000e2";
const CHANNEL = "whatsapp";

function makeAdapter() {
  const texts: string[] = [];
  const interactives: any[] = [];
  const documents: any[] = [];
  return {
    adapter: {
      channel: CHANNEL,
      async sendText(_to: string, text: string) { texts.push(text); return { ok: true, messageId: "m" }; },
      async sendInteractive(_to: string, p: any) { interactives.push(p); return { ok: true, messageId: "m" }; },
      async sendDocument(_to: string, d: any) { documents.push(d); return { ok: true, messageId: "m" }; },
    } as any,
    texts,
    interactives,
    documents,
  };
}

/** Pergunta de agendamento do motor (ranhura "main"). */
async function askSchedule(db: any) {
  return createPendingAction(db, {
    userId: USER,
    channel: CHANNEL,
    intent: "create_follow_up",
    originalContent: "Pré-angariação Gondomar",
    payload: { title: "Apresentação Gondomar" },
    pendingQuestion: "Queres agendar essa apresentação?",
  });
}

/** O motor normal ao receber "não": resolve contra a ranhura "main". */
async function engineAnswers(db: any, text: string) {
  const pending = await findActivePendingAction(db, USER, CHANNEL);
  if (!pending) return null;
  await markPendingActionStatus(db, pending.id, /^n[aã]o?$/i.test(text.trim()) ? "cancelled" : "executed");
  return pending;
}

describe("E2E — dois pendentes em simultâneo", () => {
  let db: any;
  beforeEach(() => {
    db = makeFakeSupabase({ profiles: [{ id: USER, name: "Júlio" }] });
  });

  it("'não' ao agendamento não destrói a lista de documentos — o botão ainda funciona", async () => {
    const ch = makeAdapter();
    await askSchedule(db);

    // Lista de documentos (ranhura "documents")
    const handled = await handleDocumentRequest(ch.adapter, db, {
      userId: USER, to: "351900000000", content: "manda-me a caderneta predial do T2 de Benfica",
    });
    expect(handled).toBe(true);
    expect(ch.interactives).toHaveLength(1);

    // Ambos vivos, cada um na sua ranhura
    expect((await findActivePendingAction(db, USER, CHANNEL))?.intent).toBe("create_follow_up");
    expect((await findActivePendingAction(db, USER, CHANNEL, "documents"))?.intent).toBe("choosing_document");

    // "não" → o recuperador devolve o turno ao motor sem tocar na lista
    const grabbed = await handleDocumentRequest(ch.adapter, db, { userId: USER, to: "351900000000", content: "não" });
    expect(grabbed).toBe(false);
    const resolved = await engineAnswers(db, "não");
    expect(resolved?.intent).toBe("create_follow_up");

    // Agendamento cancelado, lista intacta
    expect(await findActivePendingAction(db, USER, CHANNEL)).toBeNull();
    const docs = await findActivePendingAction(db, USER, CHANNEL, "documents");
    expect(docs?.intent).toBe("choosing_document");
    expect((docs!.structured_payload as any).candidates).toHaveLength(3);

    // O botão da lista continua a entregar o ficheiro certo
    const tapped = await handleDocumentRequest(ch.adapter, db, {
      userId: USER, to: "351900000000", content: encodeDocCommand(hits[0]!.id),
    });
    expect(tapped).toBe(true);
    expect(ch.documents).toHaveLength(1);
    expect(ch.documents[0].fileName).toBe("CPU Gondomar.pdf");
  });

  it("'sim' à confirmação de envio não executa o agendamento pendente", async () => {
    db = makeFakeSupabase({
      profiles: [{ id: USER, name: "Júlio" }],
      consultant_preferences: [{ user_id: USER, confirm_document_send: true }],
    });
    const ch = makeAdapter();
    await askSchedule(db);

    await handleDocumentRequest(ch.adapter, db, {
      userId: USER, to: "351900000000", content: "manda-me a caderneta predial do T2 de Benfica",
    });
    await handleDocumentRequest(ch.adapter, db, {
      userId: USER, to: "351900000000", content: encodeDocCommand(hits[1]!.id),
    });
    expect((await findActivePendingAction(db, USER, CHANNEL, "documents"))?.intent).toBe("confirming_document_send");
    expect(ch.documents).toHaveLength(0);

    // "sim" é consumido pela confirmação do documento
    const handled = await handleDocumentRequest(ch.adapter, db, { userId: USER, to: "351900000000", content: "sim" });
    expect(handled).toBe(true);
    expect(ch.documents.map((d: any) => d.fileName)).toEqual(["Caderneta Benfica.pdf"]);

    // Agendamento continua por responder
    const main = await findActivePendingAction(db, USER, CHANNEL);
    expect(main?.intent).toBe("create_follow_up");
    expect(main?.status).toBe("pending_confirmation");
  });

  it("'não' à confirmação de envio cancela só o documento", async () => {
    db = makeFakeSupabase({
      profiles: [{ id: USER, name: "Júlio" }],
      consultant_preferences: [{ user_id: USER, confirm_document_send: true }],
    });
    const ch = makeAdapter();
    await askSchedule(db);
    await handleDocumentRequest(ch.adapter, db, {
      userId: USER, to: "351900000000", content: "manda-me a caderneta predial do T2 de Benfica",
    });
    await handleDocumentRequest(ch.adapter, db, {
      userId: USER, to: "351900000000", content: encodeDocCommand(hits[2]!.id),
    });

    const handled = await handleDocumentRequest(ch.adapter, db, { userId: USER, to: "351900000000", content: "não" });
    expect(handled).toBe(true);
    expect(ch.documents).toHaveLength(0);
    expect(await findActivePendingAction(db, USER, CHANNEL, "documents")).toBeNull();
    expect((await findActivePendingAction(db, USER, CHANNEL))?.intent).toBe("create_follow_up");
  });

  it("escolha por texto livre resolve a lista e deixa o agendamento intacto", async () => {
    const ch = makeAdapter();
    await askSchedule(db);
    await handleDocumentRequest(ch.adapter, db, {
      userId: USER, to: "351900000000", content: "manda-me a caderneta predial do T2 de Benfica",
    });

    const handled = await handleDocumentRequest(ch.adapter, db, { userId: USER, to: "351900000000", content: "CPU Gondomar" });
    expect(handled).toBe(true);
    expect(ch.documents[0].fileName).toBe("CPU Gondomar.pdf");
    expect(shortDocId(hits[0]!.id)).toHaveLength(10);
    expect((await findActivePendingAction(db, USER, CHANNEL))?.intent).toBe("create_follow_up");
  });
});

/** Envelhece um rascunho: o TTL passou (o consultor respondeu tarde demais). */
function expire(db: any, id: string) {
  const row = db.state.pending_actions.find((r: any) => r.id === id);
  row.expires_at = new Date(Date.now() - 60_000).toISOString();
}

describe("E2E — pendentes expirados (TTL) deixam de ser resolvidos", () => {
  let db: any;
  beforeEach(() => {
    db = makeFakeSupabase({
      profiles: [{ id: USER, name: "Júlio" }],
      consultant_preferences: [{ user_id: USER, confirm_document_send: true }],
    });
  });

  it("'não' já não cancela um agendamento expirado — fica marcado como expirado", async () => {
    const draft = await askSchedule(db);
    expire(db, draft!.id);

    expect(await findActivePendingAction(db, USER, CHANNEL)).toBeNull();
    expect(await engineAnswers(db, "não")).toBeNull();
    expect(db.state.pending_actions.find((r: any) => r.id === draft!.id).status).toBe("expired");
  });

  it("'sim' já não envia o documento quando a confirmação expirou", async () => {
    const ch = makeAdapter();
    await handleDocumentRequest(ch.adapter, db, {
      userId: USER, to: "351900000000", content: "manda-me a caderneta predial do T2 de Benfica",
    });
    await handleDocumentRequest(ch.adapter, db, {
      userId: USER, to: "351900000000", content: encodeDocCommand(hits[1]!.id),
    });
    const confirm = db.state.pending_actions.find((r: any) => r.intent === "confirming_document_send");
    expire(db, confirm.id);

    const handled = await handleDocumentRequest(ch.adapter, db, { userId: USER, to: "351900000000", content: "sim" });
    expect(handled).toBe(false); // segue para conversa normal
    expect(ch.documents).toHaveLength(0);
    expect(db.state.pending_actions.find((r: any) => r.id === confirm.id).status).toBe("expired");
  });

  it("botão de uma lista expirada não resolve o pedido antigo", async () => {
    const ch = makeAdapter();
    await handleDocumentRequest(ch.adapter, db, {
      userId: USER, to: "351900000000", content: "manda-me a caderneta predial do T2 de Benfica",
    });
    const list = db.state.pending_actions.find((r: any) => r.intent === "choosing_document");
    expire(db, list.id);

    const handled = await handleDocumentRequest(ch.adapter, db, {
      userId: USER, to: "351900000000", content: encodeDocCommand(hits[0]!.id),
    });
    expect(handled).toBe(true);
    expect(ch.documents).toHaveLength(0);
    expect(ch.texts.some((t) => /j[áa] n[ãa]o est[áa] dispon[íi]vel/i.test(t))).toBe(true);
    expect(db.state.pending_actions.find((r: any) => r.id === list.id).status).toBe("expired");
  });

  it("lista expirada não impede um novo pedido de documentos", async () => {
    const ch = makeAdapter();
    await handleDocumentRequest(ch.adapter, db, {
      userId: USER, to: "351900000000", content: "manda-me a caderneta predial do T2 de Benfica",
    });
    const first = db.state.pending_actions.find((r: any) => r.intent === "choosing_document");
    expire(db, first.id);

    await handleDocumentRequest(ch.adapter, db, {
      userId: USER, to: "351900000000", content: "manda-me a caderneta predial do T2 de Benfica",
    });
    const fresh = await findActivePendingAction(db, USER, CHANNEL, "documents");
    expect(fresh?.intent).toBe("choosing_document");
    expect(fresh?.id).not.toBe(first.id);
  });
});
