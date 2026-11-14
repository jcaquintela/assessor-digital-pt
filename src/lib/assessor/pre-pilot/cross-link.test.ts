// (3) Contas separadas WhatsApp/Telegram: ligação segura com prova de posse,
// sem fusão automática e sem revelar se um número tem conta.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "@/lib/assessor/cross-channel/test-fake-db";
import { __resetAccountFlagsForTests, __setAccountFlagForTests } from "@/lib/flags/account-flag.server";

const waSent: Array<{ to: string; text: string }> = [];
vi.mock("@/lib/whatsapp/send.server", () => ({
  sendWhatsAppText: async (to: string, text: string) => { waSent.push({ to, text }); return { ok: true }; },
}));
vi.mock("@/lib/assessor/primary-channel.server", () => ({ recomputePrimaryChannel: async () => {} }));
vi.mock("@/lib/assessor/channels.server", () => ({
  linkChannelToUser: async (db: any, channel: string, externalId: string, userId: string, displayName?: string) => {
    await db.from("channel_links").upsert(
      { user_id: userId, channel, external_id: externalId, display_name: displayName ?? null, linked_at: new Date().toISOString() },
      { onConflict: "channel,external_id" },
    );
  },
}));

import { handleCrossLink } from "@/lib/assessor/channel-link/cross-link.server";
import { CROSS_LINK_FLAG, LINK_TEXT, wantsToLinkChannel } from "@/lib/assessor/channel-link/cross-link";
import { stepPairing, CODE_SENT_UNIFORM } from "@/lib/telegram/pairing.server";

const W = "11111111-1111-4111-8111-111111111111"; // conta do WhatsApp (com registos)
const T = "22222222-2222-4222-8222-222222222222"; // conta criada no Telegram
const WA_W = "351910000001";
const TG_T = "7002";

function seed(extra: Record<string, any[]> = {}) {
  return createFakeDb(
    {
      channel_links: [
        { user_id: W, channel: "whatsapp", external_id: WA_W },
        { user_id: T, channel: "telegram", external_id: TG_T },
      ],
      people: [{ id: "p-w", user_id: W, name: "Joana Silva (cliente do W)" }],
      ...extra,
    },
    { rpc: { effective_tier: () => "base" } },
  );
}
const out: Array<{ channel: string; to: string; text: string }> = [];
const adapter = (channel: "whatsapp" | "telegram") => ({
  channel,
  sendText: async (to: string, text: string) => { out.push({ channel, to, text }); return { ok: true }; },
}) as any;
let n = 0;
const msg = (channel: "whatsapp" | "telegram", from: string, text: string) => ({
  channel, externalConversationId: from, externalMessageId: `m${++n}`, messageType: "text", text,
  media: null, callback: null, sender: { firstName: "Iolanda" }, metadata: {}, receivedAt: new Date(),
}) as any;
const tg = (db: any, text: string) => handleCrossLink(adapter("telegram"), db, msg("telegram", TG_T, text), T, text);
const tgOwner = (db: any) => db.tables.channel_links.find((l: any) => l.channel === "telegram" && l.external_id === TG_T)?.user_id;
const codeFrom = (t: string) => /LIGAR-\d{6}/.exec(t)?.[0] ?? "";
const allReplies = () => out.map((o) => o.text);

beforeEach(() => {
  out.length = 0;
  waSent.length = 0;
  __resetAccountFlagsForTests();
  __setAccountFlagForTests(CROSS_LINK_FLAG, T, true);
  __setAccountFlagForTests(CROSS_LINK_FLAG, W, true);
});

describe("deteção do pedido", () => {
  it("reconhece pedidos para ligar o outro canal e ignora conversa normal", () => {
    expect(wantsToLinkChannel("já uso o Afonso no WhatsApp", "whatsapp")).toBe(true);
    expect(wantsToLinkChannel("liga isto ao meu whatsapp", "whatsapp")).toBe(true);
    expect(wantsToLinkChannel("quero juntar as minhas contas", "whatsapp")).toBe(true);
    expect(wantsToLinkChannel("liga o meu Telegram", "telegram")).toBe(true);
    expect(wantsToLinkChannel("manda whatsapp à Joana amanhã", "whatsapp")).toBe(false);
    expect(wantsToLinkChannel("liga à Joana às 10h", "whatsapp")).toBe(false);
  });
});

describe("Telegram → WhatsApp por código", () => {
  it("conta do Telegram vazia: código no WhatsApp certo → o Telegram passa para a conta do WhatsApp (sem fusão)", async () => {
    const db = seed();
    expect(await tg(db, "já uso o Afonso no WhatsApp")).toBe(true);
    expect(out.at(-1)!.text).toBe(LINK_TEXT.askPhone);
    await tg(db, "+351 910 000 001");
    expect(out.at(-1)!.text).toBe(LINK_TEXT.uniformCodeSent);
    expect(waSent).toHaveLength(1);
    expect(waSent[0].to).toBe(WA_W);
    await tg(db, codeFrom(waSent[0].text));
    expect(out.at(-1)!.text).toBe(LINK_TEXT.relinked);
    expect(tgOwner(db)).toBe(W);
    expect(db.tables.people).toHaveLength(1); // nada copiado nem apagado
    expect(db.tables.admin_audit_logs.at(-1)).toMatchObject({ action: "channel_relink", target_user_id: W });
  });

  it("conta do Telegram com registos: não muda nada sozinho e avisa a equipa", async () => {
    const db = seed({ people: [{ id: "p-w", user_id: W, name: "x" }, { id: "p-t", user_id: T, name: "Rui (do T)" }] });
    await tg(db, "liga ao meu whatsapp");
    await tg(db, "+351910000001");
    await tg(db, codeFrom(waSent[0].text));
    expect(out.at(-1)!.text).toBe(LINK_TEXT.needsTeam);
    expect(tgOwner(db)).toBe(T);
    expect(db.tables.admin_audit_logs.at(-1)).toMatchObject({ action: "account_link_request", target_user_id: W });
  });

  it("número sem conta: a MESMA resposta, nenhum WhatsApp enviado, nenhum código serve", async () => {
    const db = seed();
    await tg(db, "já uso o whatsapp");
    await tg(db, "+351939999999");
    expect(out.at(-1)!.text).toBe(LINK_TEXT.uniformCodeSent);
    expect(waSent).toEqual([]);
    await tg(db, "LIGAR-123456");
    expect(out.at(-1)!.text).toContain("não bate certo");
    expect(tgOwner(db)).toBe(T);
  });

  it("código errado 5 vezes: desiste sem mudar nada", async () => {
    const db = seed();
    await tg(db, "já uso o whatsapp");
    await tg(db, "+351910000001");
    for (let i = 0; i < 5; i++) await tg(db, "LIGAR-000000");
    expect(out.at(-1)!.text).toBe(LINK_TEXT.codeWrong(0));
    expect(db.tables.telegram_pairings).toHaveLength(0);
    expect(tgOwner(db)).toBe(T);
  });

  it("nenhuma resposta revela registos da outra conta", async () => {
    const db = seed();
    await tg(db, "já uso o whatsapp");
    await tg(db, "+351910000001");
    await tg(db, codeFrom(waSent[0].text));
    expect(allReplies().join(" ")).not.toMatch(/Joana|910000001|11111111/);
  });

  it("cancelar a meio não muda nada", async () => {
    const db = seed();
    await tg(db, "já uso o whatsapp");
    await tg(db, "cancelar");
    expect(out.at(-1)!.text).toBe(LINK_TEXT.cancelled);
    expect(tgOwner(db)).toBe(T);
  });

  it("interruptor desligado: não trata a mensagem", async () => {
    __setAccountFlagForTests(CROSS_LINK_FLAG, T, false);
    const db = seed();
    expect(await tg(db, "já uso o whatsapp")).toBe(false);
    expect(out).toEqual([]);
  });
});

describe("WhatsApp → Telegram por link de uso único", () => {
  it("link pedido no WhatsApp liga o Telegram (vazio) e só funciona uma vez", async () => {
    const db = seed();
    const handled = await handleCrossLink(adapter("whatsapp"), db, msg("whatsapp", WA_W, "liga o meu telegram"), W, "liga o meu telegram");
    expect(handled).toBe(true);
    const url = out.at(-1)!.text.match(/https:\/\/t\.me\/\S+\?start=(tg_[0-9a-f]+)/);
    expect(url).toBeTruthy();
    const token = url![1];
    await tg(db, `/start ${token}`);
    expect(out.at(-1)!.text).toBe(LINK_TEXT.relinked);
    expect(tgOwner(db)).toBe(W);
    // Reutilizar o mesmo link noutro chat não faz nada.
    __setAccountFlagForTests(CROSS_LINK_FLAG, "33333333-3333-4333-8333-333333333333", true);
    db.tables.channel_links.push({ user_id: "33333333-3333-4333-8333-333333333333", channel: "telegram", external_id: "7003" });
    await handleCrossLink(adapter("telegram"), db, msg("telegram", "7003", `/start ${token}`), "33333333-3333-4333-8333-333333333333", `/start ${token}`);
    expect(out.at(-1)!.text).toBe(LINK_TEXT.tokenInvalid);
  });

  it("já com Telegram ligado: diz só isso", async () => {
    const db = seed({ channel_links: [
      { user_id: W, channel: "whatsapp", external_id: WA_W },
      { user_id: W, channel: "telegram", external_id: "7009" },
    ] });
    await handleCrossLink(adapter("whatsapp"), db, msg("whatsapp", WA_W, "liga o meu telegram"), W, "liga o meu telegram");
    expect(out.at(-1)!.text).toBe(LINK_TEXT.telegramAlreadyLinked);
  });
});

describe("primeiro contacto no Telegram (sem conta) — sem enumeração", () => {
  it("número com e sem conta recebem exatamente a mesma resposta", async () => {
    const db = seed();
    await stepPairing(db, "8001", "olá", null);
    await stepPairing(db, "8001", "sim", null);
    const known = await stepPairing(db, "8001", "+351910000001", null);
    await stepPairing(db, "8002", "olá", null);
    await stepPairing(db, "8002", "sim", null);
    const unknown = await stepPairing(db, "8002", "+351939999999", null);
    expect(known.reply).toBe(CODE_SENT_UNIFORM);
    expect(unknown.reply).toBe(CODE_SENT_UNIFORM);
    expect(waSent).toHaveLength(1);
  });
});
