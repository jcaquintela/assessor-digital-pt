// "Falar com Afonso" no painel — escrita real, só para Pro e Team.
//
// Não há motor novo aqui: a mensagem entra no MESMO pipeline dos canais
// (runInboundPipeline), com lock por consultor+canal, THINK/DECIDE e rede
// de segurança. A única diferença é a origem, gravada como canal
// "dashboard" para a Auditoria e as Ações autónomas distinguirem.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MAX_LEN = 2000;

export const DASHBOARD_CHAT_MIN_TIER = "pro" as const;

export const sendDashboardMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { text: string }) => {
    const text = String(input?.text ?? "").trim();
    if (!text) throw new Error("Escreve uma mensagem.");
    if (text.length > MAX_LEN) throw new Error("Mensagem demasiado longa.");
    return { text };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Gating: o mesmo effective_tier() usado em todo o lado.
    const { data: tier, error: tierErr } = await supabase.rpc("effective_tier", {
      _user_id: userId,
    });
    if (tierErr) throw new Error("Não consegui confirmar o teu plano.");
    const { tierAtLeast } = await import("@/lib/subscription/tiers");
    if (!tierAtLeast(tier as string | null, DASHBOARD_CHAT_MIN_TIER)) {
      throw new Error("Escrever no painel está disponível nos planos Pro e Team.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runInboundPipeline } = await import("./channel-gateway/ingest.server");
    const { dashboardAdapter, buildDashboardInbound } = await import(
      "./channel-gateway/dashboard-adapter"
    );

    const inbound = buildDashboardInbound({
      userId,
      text: data.text,
      messageId: `dashboard_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    });

    await runInboundPipeline(dashboardAdapter, supabaseAdmin, inbound);
    return { ok: true };
  });
