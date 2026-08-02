// MODO DA CONTA APÓS DESCIDA DE PLANO.
//
// Descer de plano NÃO migra nem apaga a conta. Durante 90 dias o histórico
// que ficou fora do plano Base continua acessível em modo leitura
// (profiles.readonly_until). Registos estruturados nunca expiram.

export type AccountMode = {
  readOnlyArchive: boolean;
  readonlyUntil: string | null;
  daysLeft: number | null;
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
  const raw = (data as any)?.readonly_until as string | null | undefined;
  if (!raw) return { readOnlyArchive: false, readonlyUntil: null, daysLeft: null };
  const until = new Date(raw).getTime();
  if (until <= now.getTime()) return { readOnlyArchive: false, readonlyUntil: raw, daysLeft: 0 };
  return {
    readOnlyArchive: true,
    readonlyUntil: raw,
    daysLeft: Math.ceil((until - now.getTime()) / 864e5),
  };
}

export function readOnlyArchiveNotice(daysLeft: number | null): string {
  const d = daysLeft ?? 0;
  return (
    "A tua conta está no plano Base. Nada foi apagado: o histórico completo continua acessível " +
    `em leitura durante mais ${d} ${d === 1 ? "dia" : "dias"}, e as tuas pessoas, imóveis e seguimentos ficam para sempre.`
  );
}