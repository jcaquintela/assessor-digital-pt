// GOLDEN — conta já paga não recebe trial e nunca desce por omissão.
//
// Regressão real: conta Team (hub) com subscrição ativa recebeu trial por
// engano e, ao expirar sem escolha, caiu para Base durante horas.

import { describe, it, expect, vi } from "vitest";
import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";

vi.mock("@/lib/whatsapp/send.server", () => ({
  sendWhatsAppText: async () => ({ ok: true, messageId: "wamid.1" }),
  sendWhatsAppPayload: async () => ({ ok: true, messageId: "wamid.2" }),
}));
vi.mock("@/lib/telegram/provider.server", () => ({
  getTelegramProvider: () => ({ sendText: async () => ({ ok: true, messageId: "tg" }) }),
}));
vi.mock("@/lib/whatsapp/template-status.server", () => ({
  isTemplateApproved: async () => true,
  isCheckinV2Approved: async () => true,
  TEMPLATES_APPROVED_FLAG: "whatsapp.templates.approved",
}));

import {
  expireDueTrials,
  startWhatsAppTrialIfEligible,
  startTrialForChannelChoice,
  isPaidAccount,
} from "./trial.server";
import { loadAccountMode, readOnlyArchiveNotice } from "./account-mode.server";

const USER = "33333333-3333-3333-3333-333333333333";
const NOW = new Date("2026-08-30T10:00:00.000Z");
const inDays = (d: number) => new Date(NOW.getTime() + d * 864e5).toISOString();

function db(profile: Record<string, any> = {}, audits: Record<string, any>[] = []) {
  return makeFakeSupabase({
    profiles: [{
      id: USER, name: "Júlio Teste", phone: "912345678",
      whatsapp_link_status: "linked", subscription_tier: "hub",
      billing_status: "none", stripe_subscription_id: null,
      trial_status: null, trial_expires_at: null, trial_choice: null,
      primary_channel: "whatsapp", readonly_until: null, ...profile,
    }],
    channel_links: [
      { user_id: USER, channel: "whatsapp", external_id: "351912345678" },
      { user_id: USER, channel: "telegram", external_id: "999" },
    ],
    consultant_preferences: [{ user_id: USER, primary_channel: "whatsapp" }],
    assessor_messages: [],
    subscription_events: [],
    people: [],
    properties: [],
    admin_audit_logs: audits.map((a, i) => ({
      id: `log-${i}`, target_user_id: USER, created_at: inDays(-14), ...a,
    })),
  });
}

describe("piso de expiração e trial em conta paga", () => {
  it("1) tier_before=hub e trial expira sem escolha → mantém-se em hub", async () => {
    const d = db(
      { trial_status: "active", trial_tier: "consultor", trial_expires_at: inDays(-1) },
      [{ action: "trial_started", metadata: { tier_before: "hub" } }],
    );
    const r = await expireDueTrials(d as any, { now: NOW });
    expect(r.expired[0]?.toTier).toBe("hub");
    const p = d.state.profiles[0];
    expect(p.subscription_tier).toBe("hub");
    expect(p.readonly_until).toBeNull();
    expect(p.trial_status).toBe("converted");
  });

  it("2) conta já paga (hub/Stripe ativo) nunca inicia trial", async () => {
    const a = db({ subscription_tier: "hub" });
    expect((await startWhatsAppTrialIfEligible(a as any, USER, "hub")).started).toBe(false);
    expect((await startTrialForChannelChoice(a as any, USER)).reason).toBe("already_paid");
    expect(a.state.profiles[0].trial_status).toBeNull();

    const b = db({
      subscription_tier: "base",
      billing_status: "active",
      stripe_subscription_id: "sub_123",
    });
    expect((await startWhatsAppTrialIfEligible(b as any, USER, "base")).reason).toBe("already_paid");
    expect(isPaidAccount({ subscription_tier: "consultor" })).toBe(false);
  });

  it("4a) banner não aparece com tier hub mesmo com readonly_until no futuro", async () => {
    const d: any = db({ readonly_until: inDays(90) });
    d.rpc = async () => ({ data: "hub", error: null });
    const mode = await loadAccountMode(d, USER, { now: NOW });
    expect(mode.readOnlyArchive).toBe(false);
    expect(mode.tier).toBe("hub");
  });

  it("4b) conta mesmo em base mostra banner com o nome correto do plano", async () => {
    const d: any = db({ subscription_tier: "base", readonly_until: inDays(30) });
    d.rpc = async () => ({ data: "base", error: null });
    const mode = await loadAccountMode(d, USER, { now: NOW });
    expect(mode.readOnlyArchive).toBe(true);
    expect(readOnlyArchiveNotice(mode.daysLeft, mode.tier)).toContain("plano Base");
    expect(readOnlyArchiveNotice(5, "hub")).toContain("plano Team");
  });

  it("5) regressão: conta que nunca teve plano pago continua a descer para base", async () => {
    const d = db(
      {
        subscription_tier: "consultor",
        trial_status: "active",
        trial_tier: "consultor",
        trial_expires_at: inDays(-1),
      },
      [{ action: "trial_started", metadata: { tier_before: "base" } }],
    );
    const r = await expireDueTrials(d as any, { now: NOW });
    expect(r.expired[0]?.toTier).toBe("base");
    const p = d.state.profiles[0];
    expect(p.subscription_tier).toBe("base");
    expect(p.trial_status).toBe("expired");
    expect(p.readonly_until).toBeTruthy();
  });
});
