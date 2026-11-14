// Vaga diária única de intervenções não solicitadas, partilhada por TODOS
// os emissores proativos (avisos, push, preparação de reuniões, guias).
// A reserva é atómica na base de dados (`reserve_unsolicited_slot`):
// dois emissores em corridas diferentes nunca gastam a mesma vaga, e um
// retry da mesma intervenção (mesma ref) é idempotente.

import { isAccountFlagEnabled } from "@/lib/flags/account-flag.server";
import { lisbonYmd } from "@/lib/assessor/lisbon-day";
import {
  GLOBAL_CAP_FLAG,
  classifyIntervention,
  unsolicitedWindow,
  type InterventionClass,
  type ProactiveSource,
} from "./intervention-policy";
import { DEFAULT_MAX_UNSOLICITED_PER_DAY } from "./daily-cap";

export async function isGlobalCapEnabled(supabase: any, userId: string): Promise<boolean> {
  return isAccountFlagEnabled(supabase, GLOBAL_CAP_FLAG, userId);
}

export interface PolicyPrefs {
  explicit_opt_ins: string[];
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  cap: number;
}

export async function loadPolicyPrefs(supabase: any, userId: string): Promise<PolicyPrefs> {
  try {
    const { data } = await supabase
      .from("consultant_preferences")
      .select("explicit_opt_ins, quiet_hours_start, quiet_hours_end, max_unsolicited_nudges_per_day")
      .eq("user_id", userId)
      .maybeSingle();
    const d = (data as any) ?? {};
    return {
      explicit_opt_ins: Array.isArray(d.explicit_opt_ins) ? d.explicit_opt_ins : [],
      quiet_hours_start: d.quiet_hours_start ?? null,
      quiet_hours_end: d.quiet_hours_end ?? null,
      cap: typeof d.max_unsolicited_nudges_per_day === "number"
        ? Math.min(d.max_unsolicited_nudges_per_day, DEFAULT_MAX_UNSOLICITED_PER_DAY)
        : DEFAULT_MAX_UNSOLICITED_PER_DAY,
    };
  } catch {
    return { explicit_opt_ins: [], quiet_hours_start: null, quiet_hours_end: null, cap: DEFAULT_MAX_UNSOLICITED_PER_DAY };
  }
}

export function lisbonDay(now: Date): string {
  return lisbonYmd(now);
}

/** Reserva a vaga do dia. Erro = não reservado (falha fechada: não envia). */
export async function reserveUnsolicited(
  supabase: any,
  args: { userId: string; now: Date; source: string; refKey: string; cap?: number },
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("reserve_unsolicited_slot", {
      _user_id: args.userId,
      _day: lisbonDay(args.now),
      _source: args.source,
      _ref_key: args.refKey,
      _cap: args.cap ?? DEFAULT_MAX_UNSOLICITED_PER_DAY,
    });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

/** Devolve a vaga quando o envio falhou (para não perder o dia por um erro de rede). */
export async function releaseUnsolicited(
  supabase: any,
  args: { userId: string; now: Date; refKey: string },
): Promise<void> {
  try {
    await supabase.rpc("release_unsolicited_slot", {
      _user_id: args.userId, _day: lisbonDay(args.now), _ref_key: args.refKey,
    });
  } catch { /* a vaga fica gasta: conservador (no máximo menos uma mensagem) */ }
}

export type DirectGate =
  | { allow: true; cls: InterventionClass; reserved: boolean; policy: boolean }
  | { allow: false; cls: InterventionClass; reason: string; policy: true };

/**
 * Para emissores diretos (fora do `dispatchPendingNudges`). Com a política
 * desligada devolve sempre allow (comportamento antigo).
 */
export async function gateDirectProactive(
  supabase: any,
  args: { userId: string; source: ProactiveSource; refKey: string; now?: Date },
): Promise<DirectGate> {
  const now = args.now ?? new Date();
  if (!(await isGlobalCapEnabled(supabase, args.userId))) {
    return { allow: true, cls: "unsolicited", reserved: false, policy: false };
  }
  const prefs = await loadPolicyPrefs(supabase, args.userId);
  const cls = classifyIntervention(args.source, prefs.explicit_opt_ins);
  if (cls === "requested" || cls === "service" || cls === "activated") {
    return { allow: true, cls, reserved: false, policy: true };
  }
  if (cls === "retired") return { allow: false, cls, reason: "retired", policy: true };
  const w = unsolicitedWindow(now, { start: prefs.quiet_hours_start, end: prefs.quiet_hours_end });
  if (!w.ok) return { allow: false, cls, reason: w.reason, policy: true };
  const ok = await reserveUnsolicited(supabase, {
    userId: args.userId, now, source: args.source.type, refKey: args.refKey, cap: prefs.cap,
  });
  if (!ok) return { allow: false, cls, reason: "daily_cap", policy: true };
  return { allow: true, cls, reserved: true, policy: true };
}
