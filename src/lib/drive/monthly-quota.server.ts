// Leitura da contagem mensal de ficheiros. A decisão vive no módulo puro
// `monthly-quota.ts`; aqui só se conta o que está na BD.

import {
  monthStartISO,
  monthlyFileQuota,
  monthlyQuotaExceededText,
  usageHintText,
  withinMonthlyQuota,
} from "./monthly-quota";

/**
 * Ficheiros criados neste mês de calendário que contam para a quota.
 * Critério único (ver `./archived.ts`): conta arquivados, não conta o que foi
 * para a reciclagem. Assim a quota bate certo com a grelha: quota = ativos +
 * arquivados do mês.
 */
export async function filesThisMonth(
  supabase: any,
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const { count } = await supabase
    .from("uploaded_files")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("deleted_at", null)
    .gte("created_at", monthStartISO(now));
  return Number(count ?? 0);
}


/** Pode processar mais um ficheiro este mês? */
export async function canProcessAnotherFile(
  supabase: any,
  userId: string,
  tier: string | null | undefined,
  now: Date = new Date(),
): Promise<{ ok: true; used: number; hint: string | null } | { ok: false; used: number; reply: string }> {
  if (monthlyFileQuota(tier) === null) return { ok: true, used: 0, hint: null };
  const used = await filesThisMonth(supabase, userId, now);
  if (!withinMonthlyQuota(used, tier)) {
    return { ok: false, used, reply: monthlyQuotaExceededText(tier, used) };
  }
  // O ficheiro que está a entrar já conta para a linha do recibo.
  return { ok: true, used, hint: usageHintText(used + 1, tier) };
}
