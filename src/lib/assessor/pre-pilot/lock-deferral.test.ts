// (2) Conversa partilhada: sem lock no prazo, o turno NUNCA corre sem lock.
// A mensagem fica adiada (sem se perder) e é retomada pela corrida periódica.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "@/lib/assessor/cross-channel/test-fake-db";
import { __resetCrossChannelStateForTests } from "@/lib/assessor/cross-channel/scope.server";

const engineRuns: Array<{ text: string; channel: string }> = [];
vi.mock("@/lib/assessor/engine.server", () => ({
  processAssessorMessage: async (input: any) => {
    engineRuns.push({ text: String(input.content), channel: input.channel });
    return { reply: `Ok: ${input.content}` };
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

import { runInboundPipeline } from "@/lib/assessor/channel-gateway/ingest.server";
import { replayDeferredInbound, DEFERRED_STATUS, MAX_DEFERRED_ATTEMPTS } from "@/lib/assessor/channel-gateway/deferred.server";
import { withConversationLock, __setLockTimingForTests } from "@/lib/assessor/channel-gateway/lock.server";

const FLAG = "assessor.cross_channel.v1";
const A = "11111111-1111-4111-8111-111111111111";
const WA_A = "351910000001";
const TG_A = "7001";

function seed() {
  return createFakeDb({
    feature_flags: [{ key: FLAG, enabled_globally: false }],
    feature_flag_users: [{ flag_key: FLAG, user_id: A }],
    channel_links: [
      { user_id: A, channel: "whatsapp", external_id: WA_A },
      { user_id: A, channel: "telegram", external_id: TG_A },
    ],
  });
}
function holdLock(db: any, ms = 60_000) {
  db.tables.conversation_locks = [
    { user_id: A, channel: "account", locked_until: new Date(Date.now() + ms).toISOString(), holder: "outro-turno" },
  ];
}
function freeLock(db: any) {
  for (const l of db.tables.conversation_locks ?? []) l.locked_until = new Date(Date.now() - 1000).toISOString();
}
function adapter(channel: "whatsapp" | "telegram", outbox: any[]) {
  return {
    channel, coalesceBursts: false, parseUpdate: () => [],
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
    sendText: async (to: string, text: string) => { outbox.push({ channel, to, text }); return { ok: true, messageId: `o${outbox.length}` }; },
    replyUnassociated: "x", replyUnsupported: "x", replyEngineError: "erro", replyMediaError: "x", replyTranscribeFail: "x",
  } as any;
}
let n = 0;
const msg = (channel: "whatsapp" | "telegram", from: string, text: string) => ({
  channel, externalConversationId: from, externalMessageId: `${channel}-${++n}`,
  messageType: "text", text, media: null, callback: null, sender: null, metadata: {}, receivedAt: new Date(),
}) as any;
const userRows = (db: any) => db.tables.assessor_messages.filter((m: any) => m.role === "user");

beforeEach(() => {
  __resetCrossChannelStateForTests();
  engineRuns.length = 0;
  __setLockTimingForTests({ maxWaitMs: 40, pollMs: 5 });
});

describe("lock estrito (unidade)", () => {
  it("com onTimeout, a função nunca corre sem lock", async () => {
    const db = seed();
    holdLock(db);
    let ran = false;
    const r = await withConversationLock(db, A, "account", async () => { ran = true; return "done"; }, {
      strict: true, onTimeout: async () => "deferred",
    });
    expect(r).toBe("deferred");
    expect(ran).toBe(false);
  });
});

describe("pipeline partilhado sem lock", () => {
  it("adia a mensagem sem a perder e sem resposta; a retoma corre-a uma vez quando o lock fica livre", async () => {
    const db = seed();
    const out: any[] = [];
    const tg = adapter("telegram", out);
    holdLock(db);
    await runInboundPipeline(tg, db, msg("telegram", TG_A, "marca visita amanhã às 10h"));
    expect(engineRuns).toEqual([]);
    expect(out).toEqual([]);
    const row = userRows(db)[0];
    expect(row.status).toBe(DEFERRED_STATUS);
    expect(row.structured_payload.deferred).toMatchObject({ channel: "telegram", text: "marca visita amanhã às 10h", attempts: 0 });

    freeLock(db);
    const adapters = { telegram: tg, whatsapp: adapter("whatsapp", out) };
    const [r1, r2] = await Promise.all([
      replayDeferredInbound(db, { adapters, lockOpts: { maxWaitMs: 40, pollMs: 5 } }),
      replayDeferredInbound(db, { adapters, lockOpts: { maxWaitMs: 40, pollMs: 5 } }),
    ]);
    expect(r1.replayed + r2.replayed).toBe(1);
    expect(engineRuns).toEqual([{ text: "marca visita amanhã às 10h", channel: "telegram" }]);
    expect(out.at(-1)).toMatchObject({ channel: "telegram", text: "Ok: marca visita amanhã às 10h" });
    expect(userRows(db)[0].status).toBe("received");
  });

  it("se o consultor já escreveu outra coisa, a mensagem antiga não volta a correr — é avisado no mesmo canal", async () => {
    const db = seed();
    const out: any[] = [];
    const tg = adapter("telegram", out);
    const wa = adapter("whatsapp", out);
    holdLock(db);
    await runInboundPipeline(tg, db, msg("telegram", TG_A, "sim"));
    await new Promise((r) => setTimeout(r, 5));
    freeLock(db);
    await runInboundPipeline(wa, db, msg("whatsapp", WA_A, "afinal não"));
    engineRuns.length = 0;
    out.length = 0;
    const r = await replayDeferredInbound(db, { adapters: { telegram: tg, whatsapp: wa }, lockOpts: { maxWaitMs: 40, pollMs: 5 } });
    expect(r.superseded).toBe(1);
    expect(engineRuns).toEqual([]); // o "sim" velho nunca confirma nada
    expect(out).toHaveLength(1);
    expect(out[0].channel).toBe("telegram");
    expect(out[0].text).toContain("«sim»");
  });

  it("lock sempre ocupado: tenta até ao limite e depois pede para repetir (nunca em silêncio, nunca sem lock)", async () => {
    const db = seed();
    const out: any[] = [];
    const tg = adapter("telegram", out);
    holdLock(db);
    await runInboundPipeline(tg, db, msg("telegram", TG_A, "nota para o Rui"));
    const adapters = { telegram: tg };
    for (let i = 0; i < MAX_DEFERRED_ATTEMPTS; i++) {
      await replayDeferredInbound(db, { adapters, lockOpts: { maxWaitMs: 20, pollMs: 5 } });
    }
    expect(engineRuns).toEqual([]);
    expect(userRows(db)[0].status).toBe("deferred_failed");
    expect(out).toHaveLength(1);
    expect(out[0].text).toContain("Não consegui tratar a tua mensagem «nota para o Rui»");
  });

  it("interruptor desligado: o lock por canal continua com o comportamento antigo (turno corre)", async () => {
    const db = seed();
    db.tables.feature_flag_users = [];
    const out: any[] = [];
    const tg = adapter("telegram", out);
    holdLock(db); // lock "account" não afeta o modo por canal
    await runInboundPipeline(tg, db, msg("telegram", TG_A, "olá"));
    expect(engineRuns).toHaveLength(1);
  });
});
