// MODO DA CONTA APÓS DESCIDA DE PLANO.
//
// Descer de plano NÃO migra nem apaga a conta. Durante 90 dias o histórico
// que ficou fora do plano Base continua acessível em modo leitura
// (profiles.readonly_until). Registos estruturados nunca expiram.
//
// O aviso só faz sentido quando a conta está MESMO no plano Base: um
// readonly_until esquecido numa conta entretanto reposta em Pro/Team não
// pode fazer o produto anunciar um plano que não é o dela.

import { normalizeTier, tierLabel, type SubscriptionTier } from "./tiers";

export type AccountMode = {
  readOnlyArchive: boolean;
  readonlyUntil: string | null;
  daysLeft: number | null;
  tier: SubscriptionTier;
};

export async function loadAccountMode(
  supabase: any,
  userId: string,
  opts: { now?: Date } = {},
): Promise<AccountMode> {
  const now = opts.now ?? new Date();
  const { data } = await supabase
    .from("profiles")
    .select("readonly_until")
    .eq("id", userId)
    .maybeSingle();

  // Fonte de verdade do plano: effective_tier() na base de dados.
  let tier: SubscriptionTier = "base";
  try {
    const { data: tierRaw } = await supabase.rpc("effective_tier", { _user_id: userId });
    tier = normalizeTier(tierRaw as string | null);
  } catch {
    tier = "base";
  }

  const raw = (data as any)?.readonly_until as string | null | undefined;
  const none = { readOnlyArchive: false, readonlyUntil: raw ?? null, daysLeft: null, tier };
  if (!raw) return none;
  const until = new Date(raw).getTime();
  if (until <= now.getTime()) return { ...none, daysLeft: 0 };
  // Plano acima de Base: o arquivo em leitura não se aplica.
  if (tier !== "base") return { ...none, daysLeft: Math.ceil((until - now.getTime()) / 864e5) };
  return {
    readOnlyArchive: true,
    readonlyUntil: raw,
    daysLeft: Math.ceil((until - now.getTime()) / 864e5),
    tier,
  };
}

export function readOnlyArchiveNotice(
  daysLeft: number | null,
  tier: string | null | undefined = "base",
): string {
  const d = daysLeft ?? 0;
  return (
    `A tua conta está no plano ${tierLabel(tier)}. Nada foi apagado: o histórico completo continua acessível ` +
    `em leitura durante mais ${d} ${d === 1 ? "dia" : "dias"}, e as tuas pessoas, imóveis e seguimentos ficam para sempre.`
  );
}
