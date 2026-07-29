// Feature flag gate para o Assessor Supremo v1.
// Regra: nunca activar globalmente sem aprovação; só por utilizador via feature_flag_users.

export const SUPREME_FLAG_KEY = "assessor.supreme.v1";

export async function isSupremeEnabled(
  supabase: any,
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false;
  try {
    const { data: flag } = await supabase
      .from("feature_flags")
      .select("enabled_globally")
      .eq("key", SUPREME_FLAG_KEY)
      .maybeSingle();
    if (flag?.enabled_globally) return true;
    const { data: userFlag } = await supabase
      .from("feature_flag_users")
      .select("user_id")
      .eq("flag_key", SUPREME_FLAG_KEY)
      .eq("user_id", userId)
      .maybeSingle();
    return !!userFlag;
  } catch {
    return false;
  }
}

export async function listSupremeUsers(supabase: any): Promise<string[]> {
  try {
    const { data: flag } = await supabase
      .from("feature_flags")
      .select("enabled_globally")
      .eq("key", SUPREME_FLAG_KEY)
      .maybeSingle();
    if (flag?.enabled_globally) {
      const { data: profs } = await supabase.from("profiles").select("id");
      return ((profs as any[]) ?? []).map((r) => r.id);
    }
    const { data: rows } = await supabase
      .from("feature_flag_users")
      .select("user_id")
      .eq("flag_key", SUPREME_FLAG_KEY);
    return ((rows as any[]) ?? []).map((r) => r.user_id);
  } catch {
    return [];
  }
}