// Assessor v2 — feature flag gate.
//
// Consulta `feature_flags(assessor.engine.v2)` para decidir se um utilizador
// específico corre pelo novo motor. Ligado globalmente OU por linha em
// `feature_flag_users`. Falhas silenciosas devolvem false (v1 continua a
// servir todos por defeito).

export const V2_FLAG_KEY = "assessor.engine.v2";

export async function isEngineV2Enabled(
  supabase: any,
  userId: string | null | undefined,
): Promise<boolean> {
  try {
    const { data: flag } = await supabase
      .from("feature_flags")
      .select("enabled_globally, rollout_percentage")
      .eq("key", V2_FLAG_KEY)
      .maybeSingle();
    if (flag?.enabled_globally) return true;
    if (!userId) return false;
    const { data: userFlag } = await supabase
      .from("feature_flag_users")
      .select("user_id")
      .eq("flag_key", V2_FLAG_KEY)
      .eq("user_id", userId)
      .maybeSingle();
    return !!userFlag;
  } catch {
    return false;
  }
}
