// Proteção contra rondas sobrepostas + contagem de chamadas à API por dia.
//
// A cadência de 2 minutos torna real o risco de uma ronda começar enquanto a
// anterior ainda corre. Usamos uma "lease" em `app_settings` (chave + inteiro):
// quem consegue empurrar o prazo para o futuro fica com a ronda; os outros
// saltam (skip-if-running), nunca esperam.

const LOCK_KEY = "calendar_poll_lock_until";

async function ensureRow(supabaseAdmin: any, key: string) {
  await supabaseAdmin.from("app_settings").upsert(
    { key, value_int: 0, updated_at: new Date().toISOString() },
    { onConflict: "key", ignoreDuplicates: true },
  );
}

/** Tenta ficar com a ronda. `null` = outra ronda está a correr (saltar). */
export async function acquireRoundLock(
  supabaseAdmin: any,
  ttlSeconds = 110,
  key = LOCK_KEY,
): Promise<{ release: () => Promise<void> } | null> {
  const nowSec = Math.floor(Date.now() / 1000);
  await ensureRow(supabaseAdmin, key);
  const { data, error } = await supabaseAdmin
    .from("app_settings")
    .update({ value_int: nowSec + ttlSeconds, updated_at: new Date().toISOString() })
    .eq("key", key)
    .lt("value_int", nowSec)
    .select("key");
  if (error) return { release: async () => {} }; // sem lock disponível: não bloquear o sync
  if (!data || (data as unknown[]).length === 0) return null;
  return {
    release: async () => {
      try {
        await supabaseAdmin
          .from("app_settings")
          .update({ value_int: 0, updated_at: new Date().toISOString() })
          .eq("key", key);
      } catch { /* o TTL liberta na mesma */ }
    },
  };
}

/** Soma as chamadas desta ronda ao contador do dia (por provider). */
export async function recordApiCalls(
  supabaseAdmin: any,
  counts: Record<string, number>,
  today = new Date().toISOString().slice(0, 10),
): Promise<void> {
  for (const [provider, n] of Object.entries(counts)) {
    if (!n) continue;
    const key = `calendar_api_calls:${provider}:${today}`;
    try {
      await ensureRow(supabaseAdmin, key);
      const { data } = await supabaseAdmin
        .from("app_settings").select("value_int").eq("key", key).maybeSingle();
      const current = Number((data as { value_int?: number } | null)?.value_int ?? 0);
      await supabaseAdmin.from("app_settings")
        .update({ value_int: current + n, updated_at: new Date().toISOString() })
        .eq("key", key);
    } catch { /* telemetria nunca quebra o sync */ }
  }
}
