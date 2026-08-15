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

export type DashboardSendResult =
  | { ok: true; reply: string | null }
  | { ok: false; error: string };

// Mensagem honesta quando o ciclo falha: nunca uma resposta que parece
// normal, nunca um spinner sem fim.
export const DASHBOARD_CHAT_ERROR =
  "Não consegui processar isto agora. Tenta outra vez daqui a pouco.";

export const sendDashboardMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { text: string }) => {
    const text = String(input?.text ?? "").trim();
    if (!text) throw new Error("Escreve uma mensagem.");
    if (text.length > MAX_LEN) throw new Error("Mensagem demasiado longa.");
    return { text };
  })
  .handler(async ({ data, context }): Promise<DashboardSendResult> => {
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

    const startedAt = new Date().toISOString();
    try {
      await runInboundPipeline(dashboardAdapter, supabaseAdmin, inbound);
    } catch (err) {
      console.error(
        "[dashboard-chat] pipeline:",
        err instanceof Error ? err.message : err,
      );
      return { ok: false, error: DASHBOARD_CHAT_ERROR };
    }

    // Devolvemos a resposta gravada neste turno: o painel deixa de depender
    // só do Realtime para saber que o ciclo acabou.
    const { data: rows } = await supabaseAdmin
      .from("assessor_messages")
      .select("content, created_at, role")
      .eq("user_id", userId)
      .eq("channel", "dashboard")
      .neq("role", "user")
      .gte("created_at", startedAt)
      .order("created_at", { ascending: false })
      .limit(1);
    const reply = (rows as { content: string }[] | null)?.[0]?.content ?? null;
    return { ok: true, reply };
  });
