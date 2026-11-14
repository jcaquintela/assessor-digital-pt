// Interruptor por conta: ligado globalmente OU por linha em
// `feature_flag_users`. Falha fechada — qualquer erro = desligado.
// Usa o cliente recebido (nos webhooks e corridas é o cliente de serviço).
//
// Piloto AFONSO 2.0: com `pilot.v2_entitlement.v1` ligado, as funções 2.0
// (`PILOT_GATED_FLAGS`) só ficam ligadas para participantes ativos do piloto,
// por cima da regra normal. Beta, plano e papel não contam. Desligado = igual a antes.

import { PILOT_ENTITLEMENT_FLAG, PILOT_GATED_FLAGS } from "@/lib/pilot/pilot";
import { isPilotParticipant } from "@/lib/pilot/pilot-access.server";

const overrides = new Map<string, boolean>();

/** Só para testes: força um interruptor (global se userId = "*"). */
export function __setAccountFlagForTests(key: string, userId: string, value: boolean | null): void {
  const k = `${key}|${userId}`;
  if (value === null) overrides.delete(k);
  else overrides.set(k, value);
}

export function __resetAccountFlagsForTests(): void {
  overrides.clear();
}

export async function isAccountFlagEnabled(
  supabase: any,
  key: string,
  userId: string | null | undefined,
): Promise<boolean> {
  const o = overrides.get(`${key}|${userId ?? ""}`) ?? overrides.get(`${key}|*`);
  if (o !== undefined) return o;
  const on = await readFlag(supabase, key, userId);
  if (!on) return false;
  return pilotAllows(supabase, key, userId);
}

/**
 * Regra do piloto por cima de um interruptor já ligado. Usar também nos
 * leitores de interruptores que não passam por `isAccountFlagEnabled`.
 * Interruptor do piloto desligado (ou função fora da lista) = permite.
 */
export async function pilotAllows(supabase: any, key: string, userId: string | null | undefined): Promise<boolean> {
  if (!PILOT_GATED_FLAGS.has(key)) return true;
  if (!(await isAccountFlagEnabled(supabase, PILOT_ENTITLEMENT_FLAG, null))) return true;
  return isPilotParticipant(supabase, userId);
}

async function readFlag(supabase: any, key: string, userId: string | null | undefined): Promise<boolean> {
  try {
    const { data: flag } = await supabase
      .from("feature_flags")
      .select("enabled_globally")
      .eq("key", key)
      .maybeSingle();
    if (!flag) return false;
    if (flag.enabled_globally === true) return true;
    if (!userId) return false;
    const { data: row } = await supabase
      .from("feature_flag_users")
      .select("user_id")
      .eq("flag_key", key)
      .eq("user_id", userId)
      .maybeSingle();
    return !!row && (row as any).user_id === userId;
  } catch {
    return false;
  }
}
