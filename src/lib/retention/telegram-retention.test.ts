// Retenção de 3 semanas da conversa em bruto do Telegram.
// Cenário-base: conta sintética com mensagens de 25 dias.
// Confirma: aviso aos 18, arquivo aos 21, registos estruturados intactos.

import { describe, it, expect, vi } from "vitest";
import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";

const sendText = vi.fn(async () => ({ ok: true, messageId: "tg-1" }));
vi.mock("@/lib/telegram/provider.server", () => ({
  getTelegramProvider: () => ({ sendText }),
}));

import {
  warnExpiringTelegramConversations,
  archiveExpiredTelegramMessages,
  purgeArchivedTelegramMessages,
  RETENTION_WARNING_TEXT,
} from "./telegram-retention.server";

const USER = "11111111-1111-1111-1111-111111111111";
const NOW = new Date("2026-08-02T10:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 864e5).toISOString();

function seed() {
  return makeFakeSupabase({
    channel_links: [{ user_id: USER, channel: "telegram", external_id: "555" }],
    profiles: [{ id: USER, name: "Teste", subscription_tier: "base", readonly_until: null, telegram_retention_warned_at: null }],
    assessor_messages: [
      { id: "m-old", user_id: USER, channel: "telegram", role: "user", content: "há 25 dias", created_at: daysAgo(25), archived_at: null },
      { id: "m-mid", user_id: USER, channel: "telegram", role: "user", content: "há 19 dias", created_at: daysAgo(19), archived_at: null },
      { id: "m-new", user_id: USER, channel: "telegram", role: "user", content: "ontem", created_at: daysAgo(1), archived_at: null },
      { id: "m-wa", user_id: USER, channel: "whatsapp", role: "user", content: "wa antiga", created_at: daysAgo(40), archived_at: null },
    ],
    uploaded_files: [
      { id: "f-audio", user_id: USER, source_message_id: "m-old", mime_type: "audio/ogg", storage_path: `${USER}/a.ogg`, deleted_at: null },
      { id: "f-doc", user_id: USER, source_message_id: "m-old", mime_type: "application/pdf", storage_path: `${USER}/c.pdf`, deleted_at: null },
    ],
    people: [{ id: "p1", user_id: USER, name: "Ana" }],
    properties: [{ id: "i1", user_id: USER, title: "T2 Lisboa" }],
    follow_ups: [{ id: "s1", user_id: USER, status: "pending" }],
    admin_audit_logs: [],
  });
}

describe("retenção Telegram", () => {
  it("avisa aos 18 dias, uma só vez", async () => {
    const db = seed();
    const r = await warnExpiringTelegramConversations(db as any, { now: NOW });
    expect(r.warned).toEqual([USER]);
    expect(sendText).toHaveBeenCalledWith(expect.objectContaining({ text: RETENTION_WARNING_TEXT }));
    expect(db.state.profiles[0].telegram_retention_warned_at).toBeTruthy();

    const again = await warnExpiringTelegramConversations(db as any, { now: NOW });
    expect(again.warned).toHaveLength(0);
  });

  it("não avisa contas cuja conversa mais antiga tem menos de 18 dias", async () => {
    const db = makeFakeSupabase({
      channel_links: [{ user_id: USER, channel: "telegram", external_id: "555" }],
      profiles: [{ id: USER, subscription_tier: "base", readonly_until: null, telegram_retention_warned_at: null }],
      assessor_messages: [
        { id: "m", user_id: USER, channel: "telegram", created_at: daysAgo(5), archived_at: null },
      ],
    });
    const r = await warnExpiringTelegramConversations(db as any, { now: NOW });
    expect(r.warned).toHaveLength(0);
  });

  it("arquiva aos 21 dias sem tocar no que já está organizado", async () => {
    const db = seed();
    const r = await archiveExpiredTelegramMessages(db as any, { now: NOW });

    expect(r.archivedMessages).toBe(1);
    expect(r.byUser[USER]).toBe(1);

    const msgs = db.state.assessor_messages;
    expect(msgs.find((m) => m.id === "m-old")!.archived_at).toBeTruthy();
    expect(msgs.find((m) => m.id === "m-mid")!.archived_at).toBeNull();
    expect(msgs.find((m) => m.id === "m-new")!.archived_at).toBeNull();
    // Outro canal não é afectado por esta regra.
    expect(msgs.find((m) => m.id === "m-wa")!.archived_at).toBeNull();

    // Áudio acompanha a conversa; documento do Drive fica intacto.
    expect(db.state.uploaded_files.find((f) => f.id === "f-audio")!.deleted_at).toBeTruthy();
    expect(db.state.uploaded_files.find((f) => f.id === "f-doc")!.deleted_at).toBeNull();

    // Registos estruturados intactos.
    expect(db.state.people).toHaveLength(1);
    expect(db.state.properties).toHaveLength(1);
    expect(db.state.follow_ups).toHaveLength(1);

    // Auditoria com contagem e conta.
    const log = db.state.admin_audit_logs.find((a) => a.action === "telegram.retention_archived");
    expect(log).toBeTruthy();
    expect(log!.target_user_id).toBe(USER);
    expect(log!.metadata.messages).toBe(1);
  });

  it("nunca elimina fisicamente antes de 30 dias em arquivo", async () => {
    const db = seed();
    await archiveExpiredTelegramMessages(db as any, { now: NOW });
    const r = await purgeArchivedTelegramMessages(db as any, { now: NOW });
    expect(r.purgedMessages).toBe(0);
    expect(db.state.assessor_messages).toHaveLength(4);
  });

  it("limpa fisicamente 30 dias depois do arquivo", async () => {
    const db = seed();
    db.state.assessor_messages.find((m) => m.id === "m-old")!.archived_at = daysAgo(31);
    const r = await purgeArchivedTelegramMessages(db as any, { now: NOW });
    expect(r.purgedMessages).toBe(1);
    expect(db.state.assessor_messages.find((m) => m.id === "m-old")).toBeUndefined();
    expect(db.removedPaths).toContain(`${USER}/a.ogg`);
    expect(db.state.people).toHaveLength(1);
    expect(db.state.admin_audit_logs.some((a) => a.action === "telegram.retention_purged")).toBe(true);
  });
});