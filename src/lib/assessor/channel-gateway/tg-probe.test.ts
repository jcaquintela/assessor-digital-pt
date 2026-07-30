import { describe, it, expect, vi } from "vitest";

const sent: string[] = [];
vi.mock("@/lib/telegram/provider.server", () => ({
  getTelegramProvider: () => ({
    sendText: async ({ text }: any) => { sent.push(text); return { ok: true, messageId: "m1" }; },
  }),
}));
const links: any[] = [];
vi.mock("@/lib/assessor/channels.server", () => ({
  findUserIdByChannel: async (_s: any, ch: string, ext: string) =>
    links.find((l) => l.ch === ch && l.ext === ext)?.userId ?? null,
  linkChannelToUser: async (_s: any, ch: string, ext: string, userId: string) => { links.push({ ch, ext, userId }); },
}));
const engineCalls: string[] = [];
vi.mock("@/lib/assessor/engine.server", () => ({
  processAssessorMessage: async ({ content }: any) => {
    engineCalls.push(content);
    return { reply: "Estou aqui.", messageType: "text" };
  },
}));

const db: any = { profiles: [], messages: [], prefs: [] };
const supabaseAdmin: any = {
  auth: { admin: { createUser: async ({ email }: any) => ({ data: { user: { id: "u-" + email } }, error: null }) } },
  from(table: string) {
    const q: any = {
      _t: table,
      select: () => q, eq: () => q, order: () => q, limit: () => q, is: () => q,
      maybeSingle: async () => ({ data: null }),
      single: async () => ({ data: { id: "msg1" } }),
      insert(row: any) { if (table === "assessor_messages") db.messages.push(row); return q; },
      update(row: any) { if (table === "profiles") db.profiles.push(row); return q; },
      upsert(row: any) { db.prefs.push(row); return q; },
      delete: () => q,
    };
    return q;
  },
};

describe("telegram onboarding aberto", () => {
  it("chat_id novo sem código cria conta base e responde só a saudação", async () => {
    const { telegramAdapter } = await import("@/lib/assessor/channel-gateway/telegram-adapter");
    const { runInboundPipeline } = await import("@/lib/assessor/channel-gateway/ingest.server");
    const inbounds = telegramAdapter.parseUpdate({
      update_id: 991001,
      message: { message_id: 1, chat: { id: 900001234 }, from: { first_name: "Rita" }, text: "Olá, bom dia" },
    });
    await runInboundPipeline(telegramAdapter, supabaseAdmin, inbounds[0]);
    console.log("RESPOSTAS:", JSON.stringify(sent, null, 2));
    console.log("PERFIL:", JSON.stringify(db.profiles));
    console.log("MOTOR:", JSON.stringify(engineCalls));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("Sou o teu Assessor");
    expect(db.profiles[0].subscription_tier).toBe("base");
    expect(engineCalls).toHaveLength(0);
  });
});
