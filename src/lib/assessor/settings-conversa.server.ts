// Definições por conversa — leitura e escrita (lista branca).
//
// Leitura: tudo, incluindo o que só se muda no painel (plano, canais).
// Escrita: só as preferências reversíveis, e sempre depois de confirmação
// explícita do consultor. A IA nunca escreve sem passar por aqui.

import {
  CONFIRM_QUESTION,
  UPDATED_REPLY,
  classifySetting,
  formatSettingsSummary,
  normalizeSettingValue,
  EDITABLE_SETTINGS,
} from "./settings-conversa";
import {
  AUTONOMY_CAP_BY_TIER,
  allowedAutonomyLevels,
  normalizeTier,
  type AutonomyLevel,
} from "@/lib/subscription/tiers";

interface Ctx { supabase: any; userId: string }
type Result = { ok: true; data: any } | { ok: false; error: string };

const ok = (data: any): Result => ({ ok: true, data });
const fail = (error: string): Result => ({ ok: false, error });

async function readTier(supabase: any, userId: string): Promise<string> {
  try {
    if (typeof supabase.rpc === "function") {
      const { data } = await supabase.rpc("effective_tier", { _user_id: userId });
      if (typeof data === "string") return normalizeTier(data);
    }
  } catch {
    /* fallback abaixo */
  }
  const { data } = await supabase
    .from("profiles")
    .select("subscription_tier, is_beta_tester, beta_expires_at")
    .eq("id", userId)
    .maybeSingle();
  const row = (data ?? {}) as any;
  const betaLive = row.is_beta_tester && (!row.beta_expires_at || new Date(row.beta_expires_at) > new Date());
  return betaLive ? "hub" : normalizeTier(row.subscription_tier);
}

async function readPreferences(supabase: any, userId: string): Promise<Record<string, any> | null> {
  const { data } = await supabase
    .from("consultant_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as any) ?? null;
}

export async function execReadSettings(ctx: Ctx): Promise<Result> {
  const [tier, prefs] = await Promise.all([
    readTier(ctx.supabase, ctx.userId),
    readPreferences(ctx.supabase, ctx.userId),
  ]);
  const snapshot = {
    tier,
    preferences: prefs,
    primaryChannel: prefs?.primary_channel ?? null,
    calendarProvider: prefs?.active_calendar_provider ?? null,
    mailProvider: prefs?.active_mail_provider ?? null,
  };
  return ok({ ...snapshot, summary: formatSettingsSummary(snapshot) });
}

export async function execUpdateSetting(ctx: Ctx, args: unknown): Promise<Result> {
  const a = (args ?? {}) as { setting?: unknown; value?: unknown; confirmed?: unknown };
  const cls = classifySetting(a.setting);

  if (cls.kind === "blocked") {
    // Nunca escreve: explica e aponta o caminho.
    return ok({ blocked: true, setting: cls.key, where: cls.where, reply: cls.message });
  }
  if (cls.kind === "unknown") return fail("definicao_desconhecida");

  const norm = normalizeSettingValue(cls.key, a.value);
  if (!norm.ok) return fail(norm.error);

  if (cls.key === "autonomy_level") {
    const tier = await readTier(ctx.supabase, ctx.userId);
    const allowed = new Set<AutonomyLevel>(allowedAutonomyLevels(tier));
    if (!allowed.has(norm.value as AutonomyLevel)) {
      return ok({
        blocked: true,
        setting: "plan",
        where: "/subscricao",
        reply: `O teu plano não permite esse nível de autonomia (máximo: ${AUTONOMY_CAP_BY_TIER[normalizeTier(tier)]}). O plano muda-se no painel, em /subscricao.`,
      });
    }
  }

  // Confirmação explícita antes de qualquer escrita.
  if (a.confirmed !== true) {
    return ok({
      needs_confirmation: true,
      high_impact: Boolean(EDITABLE_SETTINGS[cls.key].highImpact),
      setting: cls.key,
      value: norm.value,
      reply: CONFIRM_QUESTION(cls.key, norm.display),
    });
  }

  const patch = { [cls.key]: norm.value } as Record<string, unknown>;
  const existing = await readPreferences(ctx.supabase, ctx.userId);
  const { error } = existing
    ? await ctx.supabase.from("consultant_preferences").update(patch).eq("user_id", ctx.userId)
    : await ctx.supabase.from("consultant_preferences").insert({ user_id: ctx.userId, ...patch });
  if (error) return fail(String((error as any)?.message ?? "erro_ao_gravar"));

  return ok({ updated: true, setting: cls.key, value: norm.value, reply: UPDATED_REPLY(cls.key, norm.display) });
}
