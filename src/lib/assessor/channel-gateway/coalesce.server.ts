// Coalescência de rajadas — parte com I/O.

import {
  COALESCE_MAX_MESSAGES,
  COALESCE_GAP_MS,
  SETTLE_MS,
  mergeBurstContent,
  selectBurst,
  type BurstRow,
} from "./coalesce";

const POLL_MS = 1_500;

async function recentTurns(
  supabase: any,
  userId: string,
  channel: string,
): Promise<BurstRow[]> {
  const { data } = await supabase
    .from("assessor_messages")
    .select("id, role, content, created_at, message_type")
    .eq("user_id", userId)
    .eq("channel", channel)
    .order("created_at", { ascending: false })
    .limit(COALESCE_MAX_MESSAGES * 3);
  return Array.isArray(data) ? (data as BurstRow[]) : [];
}

/**
 * Corre dentro do bloqueio de conversa, antes do motor.
 *
 * - `{ yield: true }` → chegou entretanto uma mensagem mais recente do mesmo
 *   consultor: este turno cala-se e o turno seguinte responde por todos.
 * - `{ content }` → texto único, já com as mensagens da rajada por ordem de
 *   chegada (FIFO), para um só ciclo de raciocínio.
 */
export async function coalesceInboundText(
  supabase: any,
  args: {
    userId: string;
    channel: string;
    currentMessageId: string | null;
    fallbackContent: string;
    settleMs?: number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<{ yield: true } | { yield: false; content: string; merged: number }> {
  const { userId, channel, currentMessageId, fallbackContent } = args;
  if (!currentMessageId) return { yield: false, content: fallbackContent, merged: 1 };

  const sleep = args.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const settleMs = args.settleMs ?? SETTLE_MS;

  let rows = await recentTurns(supabase, userId, channel);
  const current = rows.find((r) => r.id === currentMessageId);
  if (!current) return { yield: false, content: fallbackContent, merged: 1 };

  // Só cedemos a uma mensagem que vá mesmo responder por esta — ou seja, que
  // esteja dentro da janela de rajada. Uma pergunta nova enviada minutos
  // depois é um turno distinto: ceder aqui deixava a mensagem sem resposta.
  const supersedes = (r: BurstRow): boolean =>
    r.role === "user" &&
    r.created_at > current.created_at &&
    Date.parse(r.created_at) - Date.parse(current.created_at) <= COALESCE_GAP_MS;

  // Espera curta para deixar a rajada assentar. Se aparecer mensagem mais
  // recente, este turno desiste em favor dela.
  const deadline = Date.now() + settleMs;
  while (Date.now() < deadline) {
    if (rows.some(supersedes)) return { yield: true };
    await sleep(POLL_MS);
    rows = await recentTurns(supabase, userId, channel);
  }
  if (rows.some(supersedes)) return { yield: true };

  const burst = selectBurst(rows, currentMessageId);
  return {
    yield: false,
    content: mergeBurstContent(burst, fallbackContent),
    merged: Math.max(1, burst.length),
  };
}