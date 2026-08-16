// Estado local da conversa do painel (módulo puro, sem I/O).
//
// Regra: a mensagem do consultor aparece SEMPRE assim que é enviada, mesmo
// que o motor demore. Enquanto o servidor não confirma, vive aqui como
// "pendente"; quando a linha real chega da base de dados, a pendente sai.

/**
 * Estado visível de cada mensagem do consultor. O objectivo é simples: em
 * qualquer momento ele percebe o que está a acontecer àquela linha.
 */
export type MessageStatus = "sending" | "processing" | "sent" | "failed" | "requeued";

export interface PendingMessage {
  id: string;
  content: string;
  created_at: string;
  failed: boolean;
  status: MessageStatus;
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
    status: "sending",
  };
}

/** Etiqueta curta, em português, para cada estado. */
export const STATUS_LABEL: Record<MessageStatus, string> = {
  sending: "a enviar…",
  processing: "a processar…",
  sent: "enviado",
  failed: "falhou",
  requeued: "reagendado",
};

/** Ao fim de alguns segundos, "a enviar" passa a ser "a processar". */
export const PROCESSING_AFTER_MS = 4_000;

/** Muda o estado de uma pendente, mantendo `failed` coerente. */
export function setStatus(p: PendingMessage, status: MessageStatus): PendingMessage {
  return { ...p, status, failed: status === "failed" };
}

/** Uma pendente continua à vista enquanto não estiver resolvida com sucesso. */
export function isTerminal(p: PendingMessage): boolean {
  return p.status === "failed" || p.status === "requeued";
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
  return pending.filter((p) => isTerminal(p) || !isSettled(p, msgs));
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
