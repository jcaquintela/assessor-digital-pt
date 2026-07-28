// Reasoning Engine v3 — feature flag gate.

export const V3_FLAG_KEY = "assessor.engine.v3";

export async function isEngineV3Enabled(
  supabase: any,
  userId: string | null | undefined,
): Promise<boolean> {
  try {
    const { data: flag } = await supabase
      .from("feature_flags")
      .select("enabled_globally")
      .eq("key", V3_FLAG_KEY)
      .maybeSingle();
    if (flag?.enabled_globally) return true;
    if (!userId) return false;
    const { data: userFlag } = await supabase
      .from("feature_flag_users")
      .select("user_id")
      .eq("flag_key", V3_FLAG_KEY)
      .eq("user_id", userId)
      .maybeSingle();
    return !!userFlag;
  } catch {
    return false;
  }
}