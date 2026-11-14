// Interruptor por conta: ligado globalmente OU por linha em
// `feature_flag_users`. Falha fechada — qualquer erro = desligado.
// Usa o cliente recebido (nos webhooks e corridas é o cliente de serviço).

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
