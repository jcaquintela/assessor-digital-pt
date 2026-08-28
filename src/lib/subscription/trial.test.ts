// Período experimental de 14 dias no WhatsApp.
// Confirma: arranque, aviso aos 11 dias, downgrade aos 14 sem perder dados.

import { describe, it, expect, vi } from "vitest";
import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";

const sendWhatsAppText = vi.fn(async () => ({ ok: true, messageId: "wamid.1" }));
const sendWhatsAppPayload = vi.fn(async () => ({ ok: true, messageId: "wamid.2" }));
vi.mock("@/lib/whatsapp/send.server", () => ({
  sendWhatsAppText: (...a: any[]) => (sendWhatsAppText as any)(...a),
  sendWhatsAppPayload: (...a: any[]) => (sendWhatsAppPayload as any)(...a),
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
  startWhatsAppTrialIfEligible,
  warnExpiringTrials,
  expireDueTrials,
  markTrialConverted,
  sendTrialValueSummaries,
  runTrialLifecycle,
  readTrialChoice,
  setTrialChoice,
  TRIAL_DAYS,
} from "./trial.server";

const USER = "22222222-2222-2222-2222-222222222222";
const NOW = new Date("2026-08-02T10:00:00.000Z");
const inDays = (d: number) => new Date(NOW.getTime() + d * 864e5).toISOString();

function baseDb(profile: Record<string, any> = {}, extra: Record<string, any[]> = {}) {
  return makeFakeSupabase({
    profiles: [{
      id: USER, name: "Teste Sintético", phone: "912345678",
      whatsapp_link_status: "linked", subscription_tier: "consultor",
      trial_status: null, trial_expires_at: null, trial_warned_at: null,
      primary_channel: "whatsapp", ...profile,
    }],
    channel_links: [
      { user_id: USER, channel: "whatsapp", external_id: "351912345678" },
      { user_id: USER, channel: "telegram", external_id: "999" },
    ],
    consultant_preferences: [{ user_id: USER, primary_channel: "whatsapp" }],
    assessor_messages: [],
    admin_audit_logs: [],
    subscription_events: [],
    people: [{ id: "p1", user_id: USER }],
    properties: [{ id: "i1", user_id: USER }],
    ...extra,
  });
}

describe("trial WhatsApp de 14 dias", () => {
  it("arranca ao subir para Consultor com WhatsApp ligado", async () => {
    const db = baseDb();
    const r = await startWhatsAppTrialIfEligible(db as any, USER, "consultor", { now: NOW });
    expect(r.started).toBe(true);
    const p = db.state.profiles[0];
    expect(p.trial_status).toBe("active");
    expect(p.trial_tier).toBe("consultor");
    expect(new Date(p.trial_expires_at).getTime() - NOW.getTime()).toBe(TRIAL_DAYS * 864e5);
    expect(db.state.admin_audit_logs.some((a) => a.action === "trial_started")).toBe(true);
  });

  it("não arranca sem WhatsApp, nem duas vezes", async () => {
    const noWa = makeFakeSupabase({
      profiles: [{ id: USER, whatsapp_link_status: "unlinked", trial_status: null }],
      channel_links: [{ user_id: USER, channel: "telegram", external_id: "999" }],
    });
    expect((await startWhatsAppTrialIfEligible(noWa as any, USER, "pro", { now: NOW })).started).toBe(false);

    const used = baseDb({ trial_status: "expired" });
    expect((await startWhatsAppTrialIfEligible(used as any, USER, "pro", { now: NOW })).started).toBe(false);
  });

  it("avisa no dia 12 (2 antes de terminar) e só uma vez", async () => {
    const db = baseDb({ trial_status: "active", trial_tier: "consultor", trial_expires_at: inDays(2) });
    const r = await warnExpiringTrials(db as any, { now: NOW });
    expect(r.warned).toEqual([USER]);
    expect(db.state.profiles[0].trial_warned_at).toBeTruthy();
    expect(db.state.assessor_messages.some((m) => m.message_type === "trial_ending")).toBe(true);

    const again = await warnExpiringTrials(db as any, { now: NOW });
    expect(again.warned).toHaveLength(0);
  });

  it("não avisa quando ainda faltam mais de 2 dias", async () => {
    const db = baseDb({ trial_status: "active", trial_expires_at: inDays(7) });
    expect((await warnExpiringTrials(db as any, { now: NOW })).warned).toHaveLength(0);
  });

  it("é um só modelo: arranca mesmo em Base e dá capacidades completas", async () => {
    const db = baseDb({ subscription_tier: "base" });
    expect((await startWhatsAppTrialIfEligible(db as any, USER, "base", { now: NOW })).started).toBe(true);
    expect(db.state.profiles[0].subscription_tier).toBe("consultor");
    expect(db.state.subscription_events?.some((e: any) => e.event === "trial_started")).toBe(true);
  });

  it("dia 7: envia resumo de valor uma só vez", async () => {
    const db = baseDb({
      trial_status: "active", trial_started_at: inDays(-7), trial_expires_at: inDays(7),
    });
    const r = await sendTrialValueSummaries(db as any, { now: NOW });
    expect(r.sent).toEqual([USER]);
    expect(db.state.assessor_messages.some((m) => m.message_type === "trial_value_summary")).toBe(true);
    expect((await sendTrialValueSummaries(db as any, { now: NOW })).sent).toHaveLength(0);
  });

  it("dia 12: um só aviso de fim de período experimental (nunca dois)", async () => {
    const db = baseDb({
      trial_status: "active", trial_started_at: inDays(-12), trial_expires_at: inDays(2),
    });
    await runTrialLifecycle(db as any, { now: NOW });
    const avisos = db.state.assessor_messages.filter(
      (m: any) => m.message_type === "trial_ending" || m.message_type === "trial_choice",
    );
    expect(avisos).toHaveLength(1);
    expect(avisos[0].content).toMatch(/Consultor/);
    expect(avisos[0].content).toMatch(/ficas no Base/i);
    // O aviso vale também como pedido de escolha: a resposta é lida como plano.
    expect(db.state.profiles[0].trial_choice_asked_at).toBeTruthy();

    await runTrialLifecycle(db as any, { now: NOW });
    expect(
      db.state.assessor_messages.filter((m: any) => m.message_type === "trial_ending"),
    ).toHaveLength(1);
  });

  it("lê a escolha em linguagem natural", () => {
    expect(readTrialChoice("Pro, por favor")).toBe("pro");
    expect(readTrialChoice("fico no consultor")).toBe("consultor");
    expect(readTrialChoice("base")).toBe("base");
    expect(readTrialChoice("olá, tudo bem?")).toBeNull();
  });

  it("aplica a escolha Pro no dia 14 sem perder dados", async () => {
    const db = baseDb({
      trial_status: "active", trial_started_at: inDays(-14), trial_expires_at: inDays(-1),
      trial_choice: "pro",
    });
    const r = await expireDueTrials(db as any, { now: NOW });
    expect(r.expired[0].toTier).toBe("pro");
    expect(db.state.profiles[0].subscription_tier).toBe("pro");
    expect(db.state.profiles[0].readonly_until).toBeNull();
    expect(db.state.subscription_events.some((e: any) => e.event === "trial_to_pro")).toBe(true);
    expect(db.state.people).toHaveLength(1);
  });

  it("guarda a escolha durante o período experimental", async () => {
    const db = baseDb({ trial_status: "active", trial_expires_at: inDays(2) });
    expect((await setTrialChoice(db as any, USER, "consultor")).saved).toBe(true);
    expect(db.state.profiles[0].trial_choice).toBe("consultor");
  });

  it("ao expirar volta a base, recalcula canal e regista auditoria", async () => {
    const db = baseDb({
      trial_status: "active", trial_tier: "consultor",
      trial_expires_at: inDays(-1), trial_warned_at: inDays(-4),
    });
    const r = await expireDueTrials(db as any, { now: NOW });
    expect(r.expired).toHaveLength(1);

    const p = db.state.profiles[0];
    expect(p.subscription_tier).toBe("base");
    expect(p.trial_status).toBe("expired");
    // WhatsApp continua ligado tecnicamente.
    expect(p.whatsapp_link_status).toBe("linked");
    // Dados organizados intactos.
    expect(db.state.people).toHaveLength(1);
    expect(db.state.properties).toHaveLength(1);

    const log = db.state.admin_audit_logs.find((a) => a.action === "trial_expired_downgrade");
    expect(log).toBeTruthy();
    expect(log!.metadata.after.subscription_tier).toBe("base");
    // Sem escolha explícita: Base, com arquivo em leitura de 90 dias.
    expect(p.readonly_until).toBeTruthy();
    expect(db.state.subscription_events.some((e: any) => e.event === "trial_to_base")).toBe(true);
  });

  it("recalcula para Telegram quando o WhatsApp deixa de estar disponível", async () => {
    const db = makeFakeSupabase({
      profiles: [{
        id: USER, name: "Teste", phone: null, whatsapp_link_status: "unlinked",
        subscription_tier: "pro", trial_status: "active", trial_tier: "pro",
        trial_expires_at: inDays(-1), primary_channel: "whatsapp",
      }],
      channel_links: [{ user_id: USER, channel: "telegram", external_id: "999" }],
      consultant_preferences: [{ user_id: USER, primary_channel: "whatsapp" }],
      admin_audit_logs: [],
    });
    const r = await expireDueTrials(db as any, { now: NOW });
    expect(r.expired[0].primaryChannel).toBe("telegram");
    expect(db.state.profiles[0].primary_channel).toBe("telegram");
  });

  it("pagamento confirmado impede o downgrade", async () => {
    const db = baseDb({ trial_status: "active", trial_expires_at: inDays(-1) });
    expect((await markTrialConverted(db as any, USER)).converted).toBe(true);
    const r = await expireDueTrials(db as any, { now: NOW });
    expect(r.expired).toHaveLength(0);
    expect(db.state.profiles[0].subscription_tier).toBe("consultor");
  });
});