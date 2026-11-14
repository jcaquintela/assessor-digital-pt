// Mensagens adiadas por falta de lock (conversa partilhada WhatsApp+Telegram).
//
// Regra: um turno da conversa partilhada nunca corre sem o lock da conta.
// Quando o lock não chega no prazo, a mensagem (já gravada) fica com
// status `deferred_lock` e é retomada aqui, por ordem de chegada.
//
// Segurança da retoma (escolhas conservadoras):
// - reserva atómica da linha (`deferred_lock` → `deferred_replaying`): duas
//   corridas nunca retomam a mesma mensagem;
// - se entretanto o consultor escreveu outra mensagem, a antiga NÃO volta a
//   correr (poderia confirmar uma coisa já ultrapassada): o Afonso diz-lhe,
//   no mesmo canal, que essa mensagem pode não ter sido tratada;
// - ao fim de MAX_ATTEMPTS sem lock, pede para repetir — nunca em silêncio;
// - só texto/botões são retomados; ficheiros pedem reenvio.

import type { ChannelAdapter, NormalizedInbound } from "./types";

export const DEFERRED_STATUS = "deferred_lock";
const REPLAYING_STATUS = "deferred_replaying";
export const MAX_DEFERRED_ATTEMPTS = 3;
const MAX_AGE_MS = 24 * 3600_000;

export interface DeferredMeta {
  attempts: number;
  first_at: string;
  channel: string;
  external_conversation_id: string;
  external_message_id: string;
  message_type: string;
  text: string | null;
  callback_data: string | null;
  callback_query_id: string | null;
  reply_to: string | null;
}

export const DEFERRED_TEXT = {
  superseded: (quote: string) =>
    `A tua mensagem «${quote}» chegou quando eu ainda estava a tratar outra e pode não ter sido tratada. Se ainda for preciso, repete-a.`,
  failed: (quote: string) =>
    `Não consegui tratar a tua mensagem «${quote}». Podes repeti-la?`,
  media: "Não consegui tratar o ficheiro que enviaste há pouco. Podes reenviá-lo?",
  notPersisted:
    "Estou a tratar de outra mensagem tua — repete esta daqui a um minuto, para não se perder.",
};

function quote(t: string | null | undefined): string {
  const s = String(t ?? "").replace(/\s+/g, " ").trim();
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
}

/** Marca a mensagem como adiada. Nunca apaga nem duplica o evento. */
export async function deferInbound(
  supabaseAdmin: any,
  adapter: ChannelAdapter,
  args: { userId: string; inbound: NormalizedInbound; messageId: string | null },
): Promise<void> {
  const { inbound } = args;
  if (!args.messageId) {
    // Sem linha gravada não há como retomar: diz-lho em vez de perder.
    try { await adapter.sendText(inbound.externalConversationId, DEFERRED_TEXT.notPersisted); } catch { /* */ }
    return;
  }
  const { data: row } = await supabaseAdmin
    .from("assessor_messages")
    .select("structured_payload, status")
    .eq("id", args.messageId)
    .eq("user_id", args.userId)
    .maybeSingle();
  const prev = ((row as any)?.structured_payload ?? {}) as Record<string, any>;
  const attempts = Number(prev?.deferred?.attempts ?? 0);
  const meta: DeferredMeta = {
    attempts,
    first_at: prev?.deferred?.first_at ?? new Date().toISOString(),
    channel: inbound.channel,
    external_conversation_id: inbound.externalConversationId,
    external_message_id: inbound.externalMessageId,
    message_type: inbound.messageType,
    text: inbound.text ?? null,
    callback_data: inbound.callback?.data ?? null,
    callback_query_id: inbound.callback?.callbackQueryId ?? null,
    reply_to: inbound.replyToMessageId ?? null,
  };
  await supabaseAdmin
    .from("assessor_messages")
    .update({ status: DEFERRED_STATUS, structured_payload: { ...prev, deferred: meta } } as never)
    .eq("id", args.messageId)
    .eq("user_id", args.userId);
}

function toInbound(meta: DeferredMeta): NormalizedInbound {
  return {
    channel: meta.channel as any,
    externalConversationId: meta.external_conversation_id,
    externalMessageId: meta.external_message_id,
    replyToMessageId: meta.reply_to,
    messageType: meta.message_type as any,
    text: meta.text,
    media: null,
    callback: meta.callback_data != null
      ? { data: meta.callback_data, callbackQueryId: meta.callback_query_id ?? "" } as any
      : null,
    sender: null,
    metadata: { replayed: true },
    receivedAt: new Date(meta.first_at),
  };
}

export interface ReplayResult {
  replayed: number;
  superseded: number;
  failed: number;
  stillDeferred: number;
  media: number;
}

export async function replayDeferredInbound(
  supabaseAdmin: any,
  args: {
    adapters: Partial<Record<string, ChannelAdapter>>;
    now?: Date;
    maxPerRun?: number;
    lockOpts?: { maxWaitMs?: number; pollMs?: number };
  },
): Promise<ReplayResult> {
  const now = args.now ?? new Date();
  const out: ReplayResult = { replayed: 0, superseded: 0, failed: 0, stillDeferred: 0, media: 0 };
  const since = new Date(now.getTime() - MAX_AGE_MS).toISOString();
  const { data } = await supabaseAdmin
    .from("assessor_messages")
    .select("id, user_id, content, channel, created_at, structured_payload")
    .eq("status", DEFERRED_STATUS)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(args.maxPerRun ?? 20);
  const rows = ((data as any[]) ?? []);
  const { runDeferredInbound } = await import("./ingest.server");

  for (const row of rows) {
    const meta = (row.structured_payload?.deferred ?? null) as DeferredMeta | null;
    const adapter = meta ? args.adapters[meta.channel] : undefined;
    if (!meta || !adapter || !row.user_id) continue;

    // Reserva atómica: só uma corrida retoma esta mensagem.
    const { data: claimed } = await supabaseAdmin
      .from("assessor_messages")
      .update({ status: REPLAYING_STATUS } as never)
      .eq("id", row.id)
      .eq("status", DEFERRED_STATUS)
      .select("id");
    if (!Array.isArray(claimed) || !claimed.length) continue;

    const finish = async (status: string, attempts = meta.attempts) => {
      await supabaseAdmin
        .from("assessor_messages")
        .update({
          status,
          structured_payload: { ...(row.structured_payload ?? {}), deferred: { ...meta, attempts } },
        } as never)
        .eq("id", row.id);
    };
    const say = async (text: string) => {
      try {
        const s = await adapter.sendText(meta.external_conversation_id, text);
        await supabaseAdmin.from("assessor_messages").insert({
          user_id: row.user_id, role: "assistant", content: text, channel: meta.channel,
          message_type: `${meta.channel}_text`, status: s.ok ? "sent" : "failed",
          sender_phone: meta.external_conversation_id,
        } as never);
      } catch { /* o estado final fica registado na mesma */ }
    };

    // Mais recente da mesma conta (qualquer dos dois canais)? Não retoma.
    const { data: newer } = await supabaseAdmin
      .from("assessor_messages")
      .select("id")
      .eq("user_id", row.user_id)
      .eq("role", "user")
      .in("channel", ["whatsapp", "telegram"])
      .gt("created_at", row.created_at)
      .limit(1);
    if (Array.isArray(newer) && newer.length) {
      await say(DEFERRED_TEXT.superseded(quote(meta.text ?? meta.callback_data ?? row.content)));
      await finish("deferred_superseded");
      out.superseded++;
      continue;
    }
    if (meta.message_type !== "text" && meta.message_type !== "callback") {
      await say(DEFERRED_TEXT.media);
      await finish("deferred_unsupported");
      out.media++;
      continue;
    }

    let r: "done" | "deferred" = "deferred";
    try {
      r = await runDeferredInbound(adapter, supabaseAdmin, toInbound(meta), row.user_id, row.id, args.lockOpts);
    } catch {
      r = "deferred";
    }
    if (r === "done") {
      await finish("received");
      out.replayed++;
      continue;
    }
    // Voltou a não haver lock: `deferInbound` já repôs `deferred_lock`.
    const attempts = meta.attempts + 1;
    if (attempts >= MAX_DEFERRED_ATTEMPTS) {
      await say(DEFERRED_TEXT.failed(quote(meta.text ?? meta.callback_data ?? row.content)));
      await finish("deferred_failed", attempts);
      out.failed++;
    } else {
      await finish(DEFERRED_STATUS, attempts);
      out.stillDeferred++;
    }
  }
  return out;
}
