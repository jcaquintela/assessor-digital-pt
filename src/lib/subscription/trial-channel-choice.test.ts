// Escolha de canal no arranque: WhatsApp inicia o período experimental de 14
// dias sem cartão e o consultor fica com capacidades de Consultor.

import { describe, it, expect, vi } from "vitest";
import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";

vi.mock("@/lib/whatsapp/send.server", () => ({
  sendWhatsAppText: async () => ({ ok: true, messageId: "wamid.1" }),
  sendWhatsAppPayload: async () => ({ ok: true, messageId: "wamid.2" }),
}));
vi.mock("@/lib/telegram/provider.server", () => ({
  getTelegramProvider: () => ({ sendText: async () => ({ ok: true, messageId: "tg" }) }),
}));

import { startTrialForChannelChoice, TRIAL_DAYS } from "./trial.server";
import { canUseWhatsApp, normalizeTier } from "./tiers";

const USER = "33333333-3333-3333-3333-333333333333";
const NOW = new Date("2026-08-07T10:00:00.000Z");

function db(profile: Record<string, any> = {}) {
  return makeFakeSupabase({
    profiles: [{
      id: USER, name: "Novo Consultor", phone: null,
      whatsapp_link_status: "unlinked", subscription_tier: "base",
      trial_status: null, trial_expires_at: null, ...profile,
    }],
    admin_audit_logs: [],
    subscription_events: [],
  });
}

describe("trial ao escolher WhatsApp no arranque", () => {
  it("inicia 14 dias e dá capacidades de Consultor, sem WhatsApp ligado nem cartão", async () => {
    const s = db();
    const r = await startTrialForChannelChoice(s as any, USER, { now: NOW });

    expect(r.started).toBe(true);
    expect(r.alreadyActive).toBe(false);

    const p = s.state.profiles[0];
    expect(p.trial_status).toBe("active");
    expect(p.trial_tier).toBe("consultor");
    expect(p.subscription_tier).toBe("consultor");
    expect(new Date(p.trial_expires_at).getTime() - NOW.getTime()).toBe(TRIAL_DAYS * 864e5);

    // Capacidades: WhatsApp desbloqueado pelo tier efectivo do trial.
    expect(canUseWhatsApp(normalizeTier(p.subscription_tier))).toBe(true);

    // Sem cartão: nada de pagamento é registado no arranque.
    expect(p.stripe_customer_id ?? null).toBeNull();
    expect(s.state.subscription_events.some((e) => e.event === "trial_started")).toBe(true);
    expect(s.state.subscription_events.some((e) => String(e.event).includes("payment"))).toBe(false);
    expect(s.state.admin_audit_logs.some((a) => a.action === "trial_started")).toBe(true);
  });

  it("não volta a arrancar se já estiver activo (idempotente)", async () => {
    const s = db();
    await startTrialForChannelChoice(s as any, USER, { now: NOW });
    const first = s.state.profiles[0].trial_expires_at;

    const again = await startTrialForChannelChoice(s as any, USER, { now: new Date(NOW.getTime() + 864e5) });
    expect(again.started).toBe(false);
    expect(again.alreadyActive).toBe(true);
    expect(s.state.profiles[0].trial_expires_at).toBe(first);
    expect(s.state.admin_audit_logs.filter((a) => a.action === "trial_started").length).toBe(1);
  });

  it("recusa um segundo período experimental depois de expirado", async () => {
    const s = db({ trial_status: "expired" });
    const r = await startTrialForChannelChoice(s as any, USER, { now: NOW });
    expect(r.started).toBe(false);
    expect(r.alreadyActive).toBe(false);
    expect(r.reason).toBe("trial_already_used");
    expect(s.state.profiles[0].subscription_tier).toBe("base");
  });

  it("não inicia trial em conta já paga (Pro/Team) — mantém o plano intacto", async () => {
    const s = db({ subscription_tier: "pro" });
    const r = await startTrialForChannelChoice(s as any, USER, { now: NOW });
    expect(r.started).toBe(false);
    expect(r.reason).toBe("already_paid");
    expect(s.state.profiles[0].subscription_tier).toBe("pro");
    expect(s.state.profiles[0].trial_status ?? null).toBeNull();
  });

});
