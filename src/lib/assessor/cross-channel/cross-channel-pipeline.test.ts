// Integração simulada ponta-a-ponta do pipeline de entrada com DOIS canais
// (WhatsApp e Telegram simulados) sobre a mesma conta e uma base em
// memória. O motor é substituído por um executor determinístico que usa a
// memória real (findActivePendingAction / createPendingAction) — o que se
// testa é o gateway: lock por conta, guarda de "sim" noutro canal,
// idempotência e isolamento.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createFakeDb } from "./test-fake-db";
import { __resetCrossChannelStateForTests } from "./scope.server";

const executions: Array<{ pendingId: string; channel: string; userId: string }> = [];

vi.mock("@/lib/assessor/engine.server", () => ({
  processAssessorMessage: async (input: any) => {
    const mem = await import("@/lib/assessor/memory.server");
    const text = String(input.content).trim().toLowerCase();
    if (text === "sim") {
      const p = await mem.findActivePendingAction(input.supabase, input.userId, input.channel);
      if (!p) return { reply: "Claro. A que te referes?" };
      await new Promise((r) => setTimeout(r, 20)); // escrita demora
      executions.push({ pendingId: p.id, channel: input.channel, userId: input.userId });
      await mem.markPendingActionStatus(input.supabase, p.id, "executed");
      return { reply: `Feito: ${p.structured_payload?.title}.` };
    }
    if (text.startsWith("lembra-me")) {
      const title = input.content.replace(/^lembra-me de\s*/i, "");
      const q = `Crio o lembrete "${title}" para amanhã?`;
      await mem.createPendingAction(input.supabase, {
        userId: input.userId, channel: input.channel, intent: "create_reminder",
        originalContent: input.content, payload: { title }, currentQuestion: q,
      });
      return { reply: q };
    }
    return { reply: "Ok." };
  },
}));
vi.mock("@/lib/auth/dashboard-login.server", () => ({
  looksLikeLoginRequest: () => false, issueDashboardLoginLink: async () => ({ url: "" }), LOGIN_LINK_REPLY: () => "",
}));
vi.mock("@/lib/admin/admin-messages.server", () => ({ captureAdminReply: async () => ({ captured: false }) }));
vi.mock("@/lib/admin/promo-existing.server", () => ({
  loadPendingPromo: async () => null, readConfirmation: () => null,
  checkPromoForUser: async () => ({ ok: false, reason: "not_found" }), promoConfirmQuestion: () => "",
  stagePromoConfirmation: async () => {}, cancelPendingPromo: async () => {}, applyPromoToUser: async () => ({ reply: "" }),
}));
vi.mock("@/lib/admin/promo.server", () => ({ looksLikePromoCode: () => false }));
vi.mock("@/lib/drive/retrieve-channel.server", () => ({ handleDocumentRequest: async () => false }));
vi.mock("@/lib/assessor/business-card.server", () => ({
  BUSINESS_CARD_INTENT: "create_contact_from_business_card", confirmBusinessCardContact: async () => ({ ok: false }),
}));
vi.mock("@/lib/assessor/channels.server", () => ({
  findUserIdByChannel: async (db: any, channel: string, ext: string) => {
    const { data } = await db.from("channel_links").select("user_id").eq("channel", channel).eq("external_id", ext).maybeSingle();
    return data?.user_id ?? null;
  },
}));

import { runInboundPipeline } from "../channel-gateway/ingest.server";

const FLAG = "assessor.cross_channel.v1";
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const WA_A = "351910000001";
const TG_A = "7001";
const TG_B = "7002";

function seed(flagUsers: string[]) {
  return createFakeDb({
    feature_flags: [{ key: FLAG, enabled_globally: false }],
    feature_flag_users: flagUsers.map((u) => ({ flag_key: FLAG, user_id: u })),
    channel_links: [
      { user_id: A, channel: "whatsapp", external_id: WA_A },
      { user_id: A, channel: "telegram", external_id: TG_A },
      { user_id: B, channel: "telegram", external_id: TG_B },
    ],
  });
}

function adapter(channel: "whatsapp" | "telegram", outbox: Array<{ channel: string; to: string; text: string }>) {
  return {
    channel,
    coalesceBursts: false,
    parseUpdate: () => [],
    persistInbound: async (db: any, inb: any, userId: string | null) => {
      const { data } = await db.from("assessor_messages").insert({
        user_id: userId, role: "user", content: inb.text, channel, external_message_id: inb.externalMessageId,
        message_type: `${channel}_text`, status: "received", archived_at: null,
      }).select("id").single();
      return data?.id ?? null;
    },
    isAlreadyProcessed: async (db: any, ext: string) => {
      const { data } = await db.from("assessor_messages").select("id").eq("external_message_id", ext).limit(1);
      return (data ?? []).length > 0;
    },
    fetchMedia: async () => ({ ok: false }),
    sendText: async (to: string, text: string) => {
      outbox.push({ channel, to, text });
      return { ok: true, messageId: `out-${outbox.length}` };
    },
    replyUnassociated: "não associado",
    replyUnsupported: "não suportado",
    replyEngineError: "erro",
    replyMediaError: "erro media",
    replyTranscribeFail: "erro áudio",
  } as any;
}

let n = 0;
const msg = (channel: "whatsapp" | "telegram", from: string, text: string, id?: string) => ({
  channel, externalConversationId: from, externalMessageId: id ?? `${channel}-${++n}`,
  messageType: "text", text, media: null, callback: null, sender: null, metadata: {}, receivedAt: new Date(),
}) as any;

beforeEach(() => {
  __resetCrossChannelStateForTests();
  executions.length = 0;
});

describe("pipeline com WhatsApp + Telegram na mesma conta (interruptor ligado)", () => {
  it("pergunta no WhatsApp, 'sim' no Telegram: re-pergunta; 2.º 'sim' executa uma vez; 'sim' tardio no WhatsApp não repete", async () => {
    const db = seed([A]);
    const out: any[] = [];
    const wa = adapter("whatsapp", out);
    const tg = adapter("telegram", out);

    await runInboundPipeline(wa, db, msg("whatsapp", WA_A, "lembra-me de ligar à Joana"));
    expect(out.at(-1)).toMatchObject({ channel: "whatsapp", text: expect.stringContaining("Crio o lembrete") });

    await runInboundPipeline(tg, db, msg("telegram", TG_A, "sim"));
    expect(out.at(-1).channel).toBe("telegram");
    expect(out.at(-1).text).toContain("no WhatsApp ficou em aberto");
    expect(executions).toHaveLength(0); // nada executado às cegas

    await runInboundPipeline(tg, db, msg("telegram", TG_A, "sim"));
    expect(executions).toHaveLength(1);
    expect(executions[0].channel).toBe("telegram");
    expect(out.at(-1).text).toContain("Feito: ligar à Joana");

    const row = db.tables.pending_actions[0];
    expect(row.channel).toBe("whatsapp"); // origem preservada
    expect(row.resolved_channel).toBe("telegram"); // onde foi confirmado
    expect(row.status).toBe("executed");

    // O 'sim' ainda no WhatsApp (pergunta lá visível) não executa outra vez.
    await runInboundPipeline(wa, db, msg("whatsapp", WA_A, "sim"));
    expect(executions).toHaveLength(1);
    expect(out.at(-1)).toMatchObject({ channel: "whatsapp", text: "Isso já ficou tratado: respondeste no Telegram." });

    // Cada mensagem ficou gravada com o seu canal de origem.
    const chans = db.tables.assessor_messages.filter((m: any) => m.role === "user").map((m: any) => m.channel);
    expect(chans).toEqual(["whatsapp", "telegram", "telegram", "whatsapp"]);
  });

  it("dois 'sim' ao mesmo tempo (WhatsApp e Telegram) executam exatamente uma vez", async () => {
    const db = seed([A]);
    const out: any[] = [];
    const wa = adapter("whatsapp", out);
    const tg = adapter("telegram", out);
    await runInboundPipeline(wa, db, msg("whatsapp", WA_A, "lembra-me de enviar a proposta"));
    await db.rpc("mark_pending_presented", { _user_id: A, _ids: [db.tables.pending_actions[0].id], _channel: "telegram" });

    await Promise.all([
      runInboundPipeline(wa, db, msg("whatsapp", WA_A, "sim")),
      runInboundPipeline(tg, db, msg("telegram", TG_A, "sim")),
    ]);
    expect(executions).toHaveLength(1);
  });

  it("reenvio do mesmo evento pelo canal (retry do webhook) não executa duas vezes", async () => {
    const db = seed([A]);
    const out: any[] = [];
    const wa = adapter("whatsapp", out);
    await runInboundPipeline(wa, db, msg("whatsapp", WA_A, "lembra-me de pedir a caderneta"));
    const yes = msg("whatsapp", WA_A, "sim", "wamid.REPETIDO");
    await Promise.all([runInboundPipeline(wa, db, yes), runInboundPipeline(wa, db, { ...yes })]);
    await runInboundPipeline(wa, db, { ...yes });
    expect(executions).toHaveLength(1);
  });

  it("isolamento: o 'sim' de outra conta nunca toca nos pendentes desta", async () => {
    const db = seed([A, B]);
    const out: any[] = [];
    const wa = adapter("whatsapp", out);
    const tg = adapter("telegram", out);
    await runInboundPipeline(wa, db, msg("whatsapp", WA_A, "lembra-me de ligar ao notário"));
    await runInboundPipeline(tg, db, msg("telegram", TG_B, "sim"));
    expect(executions).toHaveLength(0);
    expect(db.tables.pending_actions[0].status).toBe("pending_confirmation");
    expect(out.at(-1)).toMatchObject({ to: TG_B, text: "Claro. A que te referes?" });
  });
});

describe("interruptor desligado (rollback): comportamento antigo por canal", () => {
  it("o 'sim' no Telegram não vê a pergunta do WhatsApp e não há re-pergunta", async () => {
    const db = seed([]);
    const out: any[] = [];
    const wa = adapter("whatsapp", out);
    const tg = adapter("telegram", out);
    await runInboundPipeline(wa, db, msg("whatsapp", WA_A, "lembra-me de ligar à Joana"));
    await runInboundPipeline(tg, db, msg("telegram", TG_A, "sim"));
    expect(executions).toHaveLength(0);
    expect(out.at(-1)).toMatchObject({ channel: "telegram", text: "Claro. A que te referes?" });
    // Sem linha de estado partilhado, sem lock de conta.
    expect((db.tables.conversation_states ?? []).some((r: any) => r.channel === "account")).toBe(false);
    expect((db.tables.conversation_locks ?? []).some((r: any) => r.channel === "account")).toBe(false);
    await runInboundPipeline(wa, db, msg("whatsapp", WA_A, "sim"));
    expect(executions).toHaveLength(1);
  });
});
