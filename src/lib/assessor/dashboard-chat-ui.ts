// Estado local da conversa do painel (módulo puro, sem I/O).
//
// Regra: a mensagem do consultor aparece SEMPRE assim que é enviada, mesmo
// que o motor demore. Enquanto o servidor não confirma, vive aqui como
// "pendente"; quando a linha real chega da base de dados, a pendente sai.

export interface PendingMessage {
  id: string;
  content: string;
  created_at: string;
  failed: boolean;
}

export interface MinimalMessage {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

/** Tempo máximo que esperamos pelo motor antes de assumir falha (ms). */
export const DASHBOARD_SEND_TIMEOUT_MS = 120_000;

export function makePending(content: string, now: Date = new Date()): PendingMessage {
  return {
    id: `pending_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
    content,
    created_at: now.toISOString(),
    failed: false,
  };
}

/** Uma pendente é substituída quando existe já a mesma mensagem do consultor. */
export function isSettled(p: PendingMessage, msgs: MinimalMessage[]): boolean {
  return msgs.some(
    (m) =>
      m.role === "user" &&
      m.content.trim() === p.content.trim() &&
      Date.parse(m.created_at) >= Date.parse(p.created_at) - 5_000,
  );
}

/** Remove as pendentes que já existem na conversa real. */
export function reconcilePending(
  pending: PendingMessage[],
  msgs: MinimalMessage[],
): PendingMessage[] {
  return pending.filter((p) => p.failed || !isSettled(p, msgs));
}

/** Corre a promessa com limite de tempo — nunca deixamos o spinner infinito. */
export async function withTimeout<T>(
  p: Promise<T>,
  ms: number = DASHBOARD_SEND_TIMEOUT_MS,
): Promise<{ ok: true; value: T } | { ok: false; timedOut: true }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ ok: false; timedOut: true }>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, timedOut: true }), ms);
  });
  try {
    const r = await Promise.race([
      p.then((value) => ({ ok: true, value }) as const),
      timeout,
    ]);
    return r;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const TIMEOUT_MESSAGE =
  "Demorou demasiado tempo. A tua mensagem ficou guardada — tenta outra vez.";
