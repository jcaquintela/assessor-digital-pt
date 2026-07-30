// Self-test end-to-end do onboarding aberto do Telegram, corrido contra a
// base de dados real (produção). Simula apenas o transporte do Bot API: o
// update entra pelo mesmo adapter e pela mesma pipeline do webhook.
//
// Valida: chat_id novo sem código → conta criada com tier 'base', link de
// canal, e exactamente UMA resposta (a saudação), sem o motor voltar a
// responder à mensagem original.
//
// No fim apaga tudo o que criou (mensagens, link, preferências, conta auth).

import { setTelegramProviderOverride, type TelegramProvider } from "@/lib/telegram/provider.server";
import { getAdapter } from "./adapter";
import { runInboundPipeline } from "./ingest.server";

export interface OnboardingE2ECheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface OnboardingE2EReport {
  ok: boolean;
  chatId: string;
  userId: string | null;
  repliesSent: string[];
  checks: OnboardingE2ECheck[];
  cleanedUp: boolean;
  ranAt: string;
}

const GREETING_MARKER = "Sou o teu Assessor";

function captureProvider(sink: string[]): TelegramProvider {
  return {
    async sendText({ text }) {
      sink.push(text);
      return { ok: true, messageId: `e2e-${sink.length}` };
    },
    async sendOptions({ text }) {
      sink.push(text);
      return { ok: true, messageId: `e2e-${sink.length}` };
    },
    async answerCallback() {
      return { ok: true };
    },
    async getFile() {
      return { ok: false, error: "e2e_no_media" };
    },
    async downloadFile() {
      return { ok: false, error: "e2e_no_media" };
    },
  };
}

export async function runTelegramOnboardingE2E(
  supabaseAdmin: any,
  opts?: { text?: string; firstName?: string },
): Promise<OnboardingE2EReport> {
  // chat_id sintético fora do espaço real do Telegram, único por execução.
  const chatId = `-99${Date.now()}${Math.floor(Math.random() * 100)}`;
  const firstName = opts?.firstName ?? "Teste E2E";
  const text = opts?.text ?? "Olá, bom dia";
  const replies: string[] = [];
  const checks: OnboardingE2ECheck[] = [];
  let userId: string | null = null;
  let cleanedUp = false;

  setTelegramProviderOverride(captureProvider(replies));
  try {
    const adapter = getAdapter("telegram");
    const inbounds = adapter.parseUpdate({
      update_id: Number(String(Date.now()).slice(-9)),
      message: {
        message_id: 1,
        chat: { id: chatId },
        from: { first_name: firstName },
        text,
      },
    });
    for (const n of inbounds) {
      await runInboundPipeline(adapter, supabaseAdmin, n);
    }

    // 1. Link de canal criado.
    const { data: link } = await supabaseAdmin
      .from("channel_links")
      .select("user_id, display_name")
      .eq("channel", "telegram")
      .eq("external_id", chatId)
      .maybeSingle();
    userId = (link as { user_id?: string } | null)?.user_id ?? null;
    checks.push({
      name: "conta criada automaticamente (sem código)",
      ok: Boolean(userId),
      detail: userId ? `channel_links → user ${userId}` : "nenhum channel_link criado",
    });

    // 2. Tier base no perfil.
    let tier: string | null = null;
    if (userId) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("subscription_tier, primary_channel")
        .eq("id", userId)
        .maybeSingle();
      tier = (prof as { subscription_tier?: string } | null)?.subscription_tier ?? null;
      checks.push({
        name: "subscription_tier = base",
        ok: tier === "base",
        detail: `profiles.subscription_tier = ${tier ?? "—"} · canal ${(prof as any)?.primary_channel ?? "—"}`,
      });
    } else {
      checks.push({ name: "subscription_tier = base", ok: false, detail: "sem perfil para validar" });
    }

    // 3. Exactamente uma resposta, e é a saudação.
    checks.push({
      name: "uma única resposta enviada",
      ok: replies.length === 1,
      detail: `${replies.length} mensagem(ns) enviada(s)`,
    });
    checks.push({
      name: "resposta é a saudação de boas-vindas",
      ok: Boolean(replies[0]?.includes(GREETING_MARKER)),
      detail: replies[0] ? replies[0].slice(0, 120) : "sem resposta",
    });

    // 4. Motor não respondeu à mensagem original (sem turno assistant na BD).
    if (userId) {
      const { data: msgs } = await supabaseAdmin
        .from("assessor_messages")
        .select("role, content")
        .eq("user_id", userId);
      const assistantRows = ((msgs as any[]) ?? []).filter((m) => m.role === "assistant");
      checks.push({
        name: "mensagem original não reentra no motor",
        ok: assistantRows.length === 0,
        detail: `${assistantRows.length} resposta(s) do motor gravada(s)`,
      });
    }
  } catch (err) {
    checks.push({
      name: "pipeline sem erros",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  } finally {
    setTelegramProviderOverride(null);
    cleanedUp = await cleanup(supabaseAdmin, chatId, userId);
  }

  return {
    ok: checks.length > 0 && checks.every((c) => c.ok),
    chatId,
    userId,
    repliesSent: replies,
    checks,
    cleanedUp,
    ranAt: new Date().toISOString(),
  };
}

async function cleanup(supabaseAdmin: any, chatId: string, userId: string | null): Promise<boolean> {
  try {
    await supabaseAdmin.from("channel_links").delete().eq("channel", "telegram").eq("external_id", chatId);
    if (userId) {
      await supabaseAdmin.from("assessor_messages").delete().eq("user_id", userId);
      await supabaseAdmin.from("consultant_preferences").delete().eq("user_id", userId);
      await supabaseAdmin.from("miscellaneous_items").delete().eq("user_id", userId);
      await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
      await supabaseAdmin.auth.admin.deleteUser(userId);
    }
    return true;
  } catch (err) {
    console.error("[telegram-onboarding-e2e] cleanup:", err instanceof Error ? err.message : err);
    return false;
  }
}