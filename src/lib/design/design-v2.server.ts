// Feature flag da paleta operacional + sidebar consolidada (redesenho v2).
// Regra: nunca activar globalmente sem aprovação; primeiro só por utilizador
// via feature_flag_users. Kill switch: apagar a linha do utilizador (ou pôr
// enabled_globally a false).

export const DESIGN_V2_FLAG_KEY = "assessor.design.v2";

export async function isDesignV2Enabled(
  supabase: any,
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false;
  try {
    const { data: flag } = await supabase
      .from("feature_flags")
      .select("enabled_globally")
      .eq("key", DESIGN_V2_FLAG_KEY)
      .maybeSingle();
    if (flag?.enabled_globally) return true;
    const { data: userFlag } = await supabase
      .from("feature_flag_users")
      .select("user_id")
      .eq("flag_key", DESIGN_V2_FLAG_KEY)
      .eq("user_id", userId)
      .maybeSingle();
    return !!userFlag;
  } catch {
    return false;
  }
}
