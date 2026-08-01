import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { setTelegramProviderOverride } from "@/lib/telegram/provider.server";
import { getAdapter } from "./adapter";
import { runInboundPipeline } from "./ingest.server";

const url = process.env['SUPABASE_URL']!;
const key = process.env['SUPABASE_SERVICE_ROLE_KEY']!;

describe("resgate de código promocional em conta existente", () => {
  it("aplica o plano após confirmação", async () => {
    const admin: any = createClient(url, key, { auth: { persistSession: false } });
    const stamp = Date.now();
    const code = `E2EPROMO-${stamp}`;
    const chatId = `-99${stamp}`;
    const email = `e2e.promo.${stamp}@example.test`;
    const replies: string[] = [];
    setTelegramProviderOverride({
      async sendText({ text }) { replies.push(text); return { ok: true, messageId: `m${replies.length}` }; },
      async sendOptions({ text }) { replies.push(text); return { ok: true, messageId: `m${replies.length}` }; },
      async answerCallback() { return { ok: true }; },
      async getFile() { return { ok: false, error: "n/a" }; },
      async downloadFile() { return { ok: false, error: "n/a" }; },
    } as any);

    const { data: created } = await admin.auth.admin.createUser({ email, email_confirm: true });
    const userId = created.user.id as string;
    await admin.from("profiles").upsert({ id: userId, email, name: "Teste Promo", subscription_tier: "base" });
    await admin.from("channel_links").insert({ user_id: userId, channel: "telegram", external_id: chatId, display_name: "Teste Promo" });
    const { data: promo } = await admin.from("promo_codes")
      .insert({ code, grants_tier: "pro", max_uses: 5, active: true, note: "e2e" })
      .select("id").single();

    const adapter = getAdapter("telegram");
    const send = async (text: string, n: number) => {
      const inbounds = adapter.parseUpdate({
        update_id: Number(`${String(stamp).slice(-7)}${n}`),
        message: { message_id: n, chat: { id: chatId }, from: { first_name: "Teste" }, text },
      });
      for (const i of inbounds) await runInboundPipeline(adapter, admin, i);
    };

    try {
      await send(code, 1);
      expect(replies.join("\n")).toContain("Encontrei um código que dá acesso a Pro");

      await send("sim", 2);
      const { data: prof } = await admin.from("profiles").select("subscription_tier").eq("id", userId).single();
      expect(prof.subscription_tier).toBe("pro");

      const { data: red } = await admin.from("promo_redemptions").select("status").eq("user_id", userId).single();
      expect(red.status).toBe("applied");

      const { data: pc } = await admin.from("promo_codes").select("used_count").eq("id", promo.id).single();
      expect(pc.used_count).toBe(1);

      // notifyPlanActivated → aviso pelo Telegram
      expect(replies.join("\n")).toMatch(/plano Pro/i);

      // Plano igual ou superior: avisa em vez de aplicar
      replies.length = 0;
      await send(code, 3);
      expect(replies.join("\n")).toContain("igual ou superior");

      // Código inexistente: resposta honesta
      replies.length = 0;
      await send(`E2ENAOEXISTE-${stamp}`, 4);
      expect(replies.join("\n")).toContain("não existe");
    } finally {
      setTelegramProviderOverride(null);
      await admin.from("promo_redemptions").delete().eq("user_id", userId);
      await admin.from("promo_codes").delete().eq("code", code);
      await admin.from("assessor_messages").delete().eq("user_id", userId);
      await admin.from("channel_links").delete().eq("external_id", chatId);
      await admin.from("admin_audit_logs").delete().eq("target_user_id", userId);
      await admin.from("consultant_preferences").delete().eq("user_id", userId);
      await admin.from("user_roles").delete().eq("user_id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
  }, 120000);
});
