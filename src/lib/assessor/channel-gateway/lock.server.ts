// Serialização por consultor+canal.
//
// Duas mensagens seguidas do mesmo consultor (ex.: "938111222 Casa Teste B"
// logo a seguir a "925512111 Casa Teste A") corriam em paralelo em workers
// diferentes e liam o mesmo rascunho activo. Resultado real: respostas
// trocadas e propostas perdidas. Aqui garantimos um turno de cada vez,
// com um lock em base de dados (funciona entre instâncias).

const LOCK_TTL_SECONDS = 90;
const POLL_MS = 300;
const MAX_WAIT_MS = 45_000;

export async function withConversationLock<T>(
  supabaseAdmin: any,
  userId: string,
  channel: string,
  fn: () => Promise<T>,
): Promise<T> {
  const holder = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const deadline = Date.now() + MAX_WAIT_MS;
  let acquired = false;

  while (Date.now() < deadline) {
    try {
      const { data, error } = await supabaseAdmin.rpc("try_acquire_conversation_lock", {
        _user_id: userId,
        _channel: channel,
        _ttl_seconds: LOCK_TTL_SECONDS,
        _holder: holder,
      });
      if (error) break; // sem lock disponível (ex.: RPC indisponível) → não bloquear o turno
      if (data === true) { acquired = true; break; }
    } catch {
      break;
    }
    await sleep(POLL_MS);
  }

  try {
    return await fn();
  } finally {
    if (acquired) {
      try {
        await supabaseAdmin.rpc("release_conversation_lock", {
          _user_id: userId,
          _channel: channel,
          _holder: holder,
        });
      } catch { /* o TTL liberta na mesma */ }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
