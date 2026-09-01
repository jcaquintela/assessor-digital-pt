// Golden tests — Definições por conversa: read_settings + update_setting.
import { describe, it, expect } from "vitest";
import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";
import { dispatchToolCall } from "./v2/domain.server";

const USER = "11111111-1111-4111-8111-111111111111";

function ctx(supabase: any) {
  return { supabase, userId: USER } as any;
}
const run = (c: any, name: string, args: unknown = {}) =>
  dispatchToolCall(c, name, JSON.stringify(args));

function prefs(over: Record<string, any> = {}) {
  return {
    user_id: USER,
    primary_channel: "telegram",
    morning_briefing_enabled: true,
    morning_time: "07:30",
    morning_days: [1, 2, 3, 4, 5],
    evening_wrap_enabled: true,
    evening_time: "19:00",
    evening_review_detail: "normal",
    evening_checkin_enabled: true,
    evening_checkin_time: "15:00",
    max_daily_nudges: 5,
    proactive_push_enabled: true,
    quiet_hours_start: "22:00",
    quiet_hours_end: "08:00",
    reminder_lead_minutes: 30,
    autonomy_level: "conservador",
    confirm_document_send: true,
    ...over,
  };
}

function fake(tier: string, over: Record<string, any> = {}) {
  const supabase: any = makeFakeSupabase({
    consultant_preferences: [prefs(over)],
    profiles: [{ id: USER, subscription_tier: tier, is_beta_tester: false, beta_expires_at: null }],
  });
  supabase.rpc = async (_fn: string, _args: any) => ({ data: tier, error: null });
  return supabase;
}

describe("golden — definições por conversa", () => {
  it("1. 'Que plano tenho?' devolve o tier real de effective_tier()", async () => {
    const res: any = await run(ctx(fake("hub")), "read_settings");
    expect(res.ok).toBe(true);
    expect(res.data.tier).toBe("hub");
    expect(res.data.summary).toContain("Plano: Team");
  });

  it("2. 'Como está o meu resumo configurado?' lista hora e detalhe corretos", async () => {
    const res: any = await run(ctx(fake("pro", { evening_time: "20:15", evening_review_detail: "curto" })), "read_settings");
    expect(res.data.summary).toContain("Resumo de fim de dia: ligado às 20:15");
    expect(res.data.summary).toContain("detalhe curto");
  });

  it("3. 'Muda o meu resumo para Detalhado' confirma, grava e aplica-se ao próximo resumo", async () => {
    const supabase = fake("pro");
    const proposal: any = await run(ctx(supabase), "update_setting", {
      setting: "detalhe do resumo",
      value: "detalhado",
    });
    expect(proposal.data.needs_confirmation).toBe(true);
    expect(proposal.data.reply).toContain("Confirma");
    // Nada foi gravado antes da confirmação.
    let read: any = await run(ctx(supabase), "read_settings");
    expect(read.data.preferences.evening_review_detail).toBe("normal");

    const done: any = await run(ctx(supabase), "update_setting", {
      setting: "evening_review_detail",
      value: "detalhado",
      confirmed: true,
    });
    expect(done.data.updated).toBe(true);
    read = await run(ctx(supabase), "read_settings");
    expect(read.data.preferences.evening_review_detail).toBe("detalhado");
  });

  it("4. 'Muda o meu plano para Pro' recusa e aponta para o painel", async () => {
    const supabase = fake("base");
    const res: any = await run(ctx(supabase), "update_setting", { setting: "plano", value: "pro", confirmed: true });
    expect(res.data.blocked).toBe(true);
    expect(res.data.where).toBe("/subscricao");
    const read: any = await run(ctx(supabase), "read_settings");
    expect(read.data.tier).toBe("base");
  });

  it("5. Autonomia exige confirmação explícita e nunca muda em silêncio", async () => {
    const supabase = fake("pro");
    const proposal: any = await run(ctx(supabase), "update_setting", { setting: "autonomia", value: "proativo" });
    expect(proposal.data.needs_confirmation).toBe(true);
    expect(proposal.data.high_impact).toBe(true);
    let read: any = await run(ctx(supabase), "read_settings");
    expect(read.data.preferences.autonomy_level).toBe("conservador");

    const done: any = await run(ctx(supabase), "update_setting", {
      setting: "autonomy_level",
      value: "proativo",
      confirmed: true,
    });
    expect(done.data.updated).toBe(true);
    read = await run(ctx(supabase), "read_settings");
    expect(read.data.preferences.autonomy_level).toBe("proativo");
  });

  it("6. Campos fora da lista branca nunca escrevem — explicam e redirecionam", async () => {
    const supabase = fake("pro");
    for (const setting of ["ligar o Google Calendar", "desligar o Gmail", "fundir contas", "cartão de pagamento"]) {
      const res: any = await run(ctx(supabase), "update_setting", { setting, value: "x", confirmed: true });
      expect(res.ok).toBe(true);
      expect(res.data.blocked).toBe(true);
      expect(res.data.reply).toMatch(/painel/);
      expect(res.data.updated).toBeUndefined();
    }
    // Autonomia acima do teto do plano também não escreve.
    const base = fake("base");
    const capped: any = await run(ctx(base), "update_setting", {
      setting: "autonomy_level",
      value: "proativo",
      confirmed: true,
    });
    expect(capped.data.blocked).toBe(true);
    const read: any = await run(ctx(base), "read_settings");
    expect(read.data.preferences.autonomy_level).toBe("conservador");
  });
});
