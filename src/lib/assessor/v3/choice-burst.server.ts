// Janela de graça para perguntas de escolha ("qual delas queres desmarcar?").
//
// Caso real (24/08): a resposta veio em três mensagens seguidas com ~1s de
// intervalo. A primeira fechava o pendente e as seguintes já não encontravam
// nada vivo — a resposta final ("não tinhas nada por desmarcar") contradizia
// a anterior ("desmarquei as 15h"). Aqui, quando a escolha só cobre parte dos
// candidatos, esperamos uma janela curta pelas mensagens que faltam da mesma
// rajada antes de executar e fechar.

export const CHOICE_GRACE_MS = 2_500;

const TEXT_TYPES = (t: string | null | undefined): boolean => {
  const v = String(t ?? "text");
  return v === "text" || /_text$/.test(v);
};

/**
 * Devolve o texto das mensagens do consultor que chegaram logo depois da
 * mensagem actual (mesma rajada), esperando `graceMs` por elas. Sem
 * `sourceMessageId` não espera nada: uma escolha isolada fecha de imediato.
 */
export async function collectChoiceBurstFollowUps(
  supabase: any,
  args: {
    userId: string;
    channel: string;
    sourceMessageId: string | null | undefined;
    graceMs?: number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<string[]> {
  const { userId, channel, sourceMessageId } = args;
  if (!sourceMessageId) return [];
  const graceMs = args.graceMs ?? CHOICE_GRACE_MS;
  const sleep = args.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  try {
    const { data: cur } = await supabase
      .from("assessor_messages")
      .select("created_at")
      .eq("id", sourceMessageId)
      .maybeSingle();
    const since = (cur as any)?.created_at;
    if (!since) return [];

    if (graceMs > 0) await sleep(graceMs);

    const { data } = await supabase
      .from("assessor_messages")
      .select("content, created_at, message_type, role")
      .eq("user_id", userId)
      .eq("channel", channel)
      .eq("role", "user")
      .gt("created_at", since)
      .order("created_at", { ascending: true })
      .limit(5);

    return ((data as any[]) ?? [])
      .filter((r) => TEXT_TYPES(r?.message_type))
      .map((r) => String(r?.content ?? "").trim())
      .filter((s) => s.length > 0);
  } catch {
    return [];
  }
}
