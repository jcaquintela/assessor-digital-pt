import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/whatsapp/send.server", () => ({
  sendWhatsAppText: vi.fn(async () => ({ ok: true })),
}));
const linked: any[] = [];
vi.mock("@/lib/assessor/channels.server", () => ({
  linkChannelToUser: vi.fn(async (_s: any, ch: string, ext: string, uid: string) => {
    linked.push({ ch, ext, uid });
  }),
}));

import { stepPairing, extractLinkToken, consumeLinkToken } from "@/lib/telegram/pairing.server";
import { hashLinkCode } from "@/lib/whatsapp/link-code.server";

// stub minimal do supabaseAdmin
function makeDb(seed: Record<string, any[]> = {}) {
  const t: Record<string, any[]> = { telegram_pairings: [], channel_links: [], profiles: [], telegram_link_tokens: [], ...seed };
  const q = (name: string) => {
    let rows = [...t[name]];
    const f: any = {
      select: () => f,
      eq: (c: string, v: any) => { rows = rows.filter((r) => r[c] === v); return f; },
      is: () => f,
      maybeSingle: async () => ({ data: rows[0] ?? null }),
      upsert: async (row: any) => { const key = name === "telegram_pairings" ? "chat_id" : "token";
        const i = t[name].findIndex((r) => r[key] === row[key]);
        if (i >= 0) t[name][i] = { ...t[name][i], ...row }; else t[name].push(row); return { error: null }; },
      insert: async (row: any) => { t[name].push(row); return { error: null }; },
      update: (patch: any) => ({ eq: async (c: string, v: any) => { t[name] = t[name].map((r) => (r[c] === v ? { ...r, ...patch } : r)); return { error: null }; } }),
      delete: () => ({ eq: async (c: string, v: any) => { t[name] = t[name].filter((r) => r[c] !== v); return { error: null }; } }),
    };
    return f;
  };
  return { from: q, _t: t };
}

describe("emparelhamento Telegram", () => {
  it("1. chat novo sem WhatsApp prévio -> cria conta nova", async () => {
    const db = makeDb();
    const a = await stepPairing(db, "111", "/start", "Novo");
    expect(a.reply).toContain("já falas comigo pelo WhatsApp");
    expect(a.createAccount).toBeFalsy();
    const b = await stepPairing(db, "111", "não", "Novo");
    expect(b.createAccount).toBe(true);
    expect(db._t.telegram_pairings).toHaveLength(0);
  });

  it("2. responde sim + número com conta existente -> liga, não cria", async () => {
    const db = makeDb({ channel_links: [{ channel: "whatsapp", external_id: "351932950353", user_id: "user-original" }] });
    await stepPairing(db, "222", "/start", "Iolanda");
    expect((await stepPairing(db, "222", "sim", "Iolanda")).reply).toContain("número de WhatsApp");
    const asked = await stepPairing(db, "222", "+351 932 950 353", "Iolanda");
    expect(asked.reply).toContain("Enviei-te um código");
    const code = db._t.telegram_pairings[0].code_hash;
    // código errado
    const bad = await stepPairing(db, "222", "LIGAR-000000", "Iolanda");
    expect(bad.reply).toContain("não bate certo");
    // código certo (força hash conhecido)
    let found = "";
    for (let i = 0; i < 1000000 && !found; i++) {} // não força bruta; usa hash directo
    db._t.telegram_pairings[0].code_hash = hashLinkCode("LIGAR-123456");
    const ok = await stepPairing(db, "222", "LIGAR-123456", "Iolanda");
    expect(ok.userId).toBe("user-original");
    expect(ok.createAccount).toBeFalsy();
    expect(linked.at(-1)).toEqual({ ch: "telegram", ext: "222", uid: "user-original" });
    expect(code).toBeTruthy();
  });

  it("3. deep link das Definições liga directo", async () => {
    const token = "tg_" + "a".repeat(32);
    const db = makeDb({ telegram_link_tokens: [{ token, user_id: "user-app", expires_at: new Date(Date.now() + 6e5).toISOString(), used_at: null }] });
    expect(extractLinkToken(`/start ${token}`)).toBe(token);
    const r = await consumeLinkToken(db, token, "333", "Júlio");
    expect(r.userId).toBe("user-app");
    expect(linked.at(-1)).toEqual({ ch: "telegram", ext: "333", uid: "user-app" });
    // uso único
    const again = await consumeLinkToken(db, token, "444", "Júlio");
    expect(again.userId).toBeUndefined();
    expect(again.reply).toContain("já não é válido");
  });
});
