// Resolve o tier a usar num pedido de servidor.
// A simulação "ver como" vive no cliente (sessionStorage) e por isso NÃO chega
// sozinha às server functions: tem de ser enviada e — obrigatoriamente —
// reconfirmada aqui contra `user_roles`. Só super admin pode simular; qualquer
// outro utilizador recebe sempre o tier real. Nunca escreve nada.
import { normalizeTier } from "./tiers";

export async function resolveTierForRequest(
  supabase: any,
  userId: string,
  previewTier?: string | null,
): Promise<string | null> {
  let real: string | null = null;
  try {
    const { data } = await supabase.rpc("effective_tier", { _user_id: userId });
    real = typeof data === "string" ? data : null;
  } catch {
    real = null;
  }
  if (!previewTier) return real;
  try {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!data) return real;
  } catch {
    return real;
  }
  return normalizeTier(previewTier);
}