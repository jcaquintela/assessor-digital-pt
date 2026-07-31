import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const CODE = `PRO-TESTE-${Date.now().toString().slice(-6)}`;
// Número genuinamente novo (prefixo de teste, nunca ligado a nenhuma conta)
const PHONE = `+35192${Date.now().toString().slice(-7)}`;

describe("promo pro via whatsapp", () => {
  it("cria conta pro e permite entrar no painel", async () => {
    const { data: pc, error: pe } = await admin
      .from("promo_codes")
      .insert({ code: CODE, grants_tier: "pro", max_uses: 1, note: "teste pré-piloto" })
      .select("*")
      .single();
    expect(pe).toBeNull();
    console.log("PROMO_CRIADO", JSON.stringify(pc));

    const { data: pre } = await admin.from("channel_links").select("user_id").eq("channel", "whatsapp").eq("external_id", PHONE);
    console.log("NUMERO_NOVO?", PHONE, "links existentes:", (pre ?? []).length);
    expect((pre ?? []).length).toBe(0);

    const { whatsappAdapter } = await import("@/lib/assessor/channel-gateway/whatsapp-adapter");
    const { runInboundPipeline } = await import("@/lib/assessor/channel-gateway/ingest.server");

    await runInboundPipeline(whatsappAdapter as any, admin as any, {
      channel: "whatsapp",
      externalConversationId: PHONE,
      externalMessageId: `wamid.test.${Date.now()}`,
      replyToMessageId: null,
      messageType: "text",
      text: CODE,
      media: null,
      callback: null,
      sender: null,
      metadata: { rawType: "text" },
      receivedAt: new Date(),
    } as any);

    const { data: link } = await admin
      .from("channel_links").select("user_id, linked_at").eq("channel", "whatsapp").eq("external_id", PHONE).maybeSingle();
    console.log("CHANNEL_LINK", JSON.stringify(link));
    expect(link?.user_id).toBeTruthy();
    const userId = (link as any).user_id as string;

    try {
      const { data: prof } = await admin.from("profiles").select("id,email,subscription_tier,primary_channel,whatsapp_link_status,phone").eq("id", userId).single();
      console.log("PERFIL", JSON.stringify(prof));
      expect((prof as any).subscription_tier).toBe("pro");

      const { data: eff } = await admin.rpc("effective_tier", { _user_id: userId });
      console.log("EFFECTIVE_TIER", eff);

      const { allowedAutonomyLevels, planSummary } = await import("@/lib/subscription/tiers");
      console.log("AUTONOMIA", JSON.stringify(allowedAutonomyLevels(eff as string)));
      console.log("MODULOS", JSON.stringify(planSummary(eff as string).modules));

      const { data: promoAfter } = await admin.from("promo_codes").select("used_count,max_uses").eq("code", CODE).single();
      console.log("PROMO_APOS", JSON.stringify(promoAfter));
      expect((promoAfter as any).used_count).toBe(1);

      // reutilização do mesmo código por outro número
      const { redeemPromoCode } = await import("@/lib/admin/promo.server");
      console.log("PROMO_REUSO", JSON.stringify(await redeemPromoCode(admin as any, CODE)));

      const { data: msgs } = await admin.from("assessor_messages").select("role,content,status").eq("sender_phone", PHONE).order("created_at");
      console.log("MENSAGENS", JSON.stringify(msgs, null, 2));

      // 2) login no painel sem email/password
      const { issueDashboardLoginLink, redeemDashboardLoginToken } = await import("@/lib/auth/dashboard-login.server");
      const l = await issueDashboardLoginLink(admin as any, userId, "whatsapp");
      console.log("LOGIN_LINK", l.url);
      const r = await redeemDashboardLoginToken(new URL(l.url).searchParams.get("token")!);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const anon = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
      const { data: s, error: se } = await anon.auth.verifyOtp({ type: "magiclink", token_hash: r.tokenHash });
      console.log("SESSAO", se ? `ERRO ${se.message}` : `ok user=${s.user?.id}`);
      expect(s.user?.id).toBe(userId);
      // o painel lê o tier com a sessão do próprio utilizador
      const { data: effAsUser, error: ee } = await anon.rpc("effective_tier", { _user_id: userId });
      console.log("TIER_COM_SESSAO_DO_UTILIZADOR", effAsUser, ee?.message ?? "");
    } finally {
      await admin.from("channel_links").delete().eq("external_id", PHONE);
      await admin.from("assessor_messages").delete().eq("sender_phone", PHONE);
      await admin.from("promo_codes").delete().eq("code", CODE);
      await admin.auth.admin.deleteUser(userId);
    }
  }, 90000);
});
