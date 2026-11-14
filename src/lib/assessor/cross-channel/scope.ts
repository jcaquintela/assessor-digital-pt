// Âmbito da conversa: por canal (comportamento antigo) ou por conta.
//
// Com o interruptor `assessor.cross_channel.v1` ligado para a conta, o
// WhatsApp e o Telegram partilham UMA conversa: o mesmo contexto, as mesmas
// perguntas pendentes e a mesma confirmação. Cada mensagem continua a ser
// gravada com o seu canal de origem (assessor_messages.channel,
// pending_actions.channel) — só a LEITURA do contexto passa a ser por conta.
//
// O painel ("dashboard") nunca entra no âmbito partilhado.
//
// Módulo puro (sem I/O): as decisões aqui são testáveis sem base de dados.

export const CROSS_CHANNEL_FLAG = "assessor.cross_channel.v1";

/** Canais de mensagens que partilham conversa quando o interruptor está ligado. */
export const MESSAGING_CHANNELS = ["whatsapp", "telegram"] as const;
export type MessagingChannel = (typeof MESSAGING_CHANNELS)[number];

/** Chave da linha única de estado partilhado em `conversation_states`. */
export const ACCOUNT_SCOPE = "account";

export function isMessagingChannel(channel: string | null | undefined): channel is MessagingChannel {
  return channel === "whatsapp" || channel === "telegram";
}

export interface ConversationScope {
  /** true = conversa partilhada por conta. */
  shared: boolean;
  /** Canal de onde veio a mensagem deste turno (origem). */
  origin: string;
  /** Canais cujos pendentes/histórico contam como "esta conversa". */
  channels: string[];
  /** Chave do lock de turno (um turno de cada vez por este âmbito). */
  lockChannel: string;
}

export function scopeFor(shared: boolean, channel: string): ConversationScope {
  const on = shared && isMessagingChannel(channel);
  return {
    shared: on,
    origin: channel,
    channels: on ? [...MESSAGING_CHANNELS] : [channel],
    lockChannel: on ? ACCOUNT_SCOPE : channel,
  };
}

export interface StateKey {
  channel: string;
  externalId: string;
  /** Campos extra a gravar em cada escrita (origem preservada). */
  extra: Record<string, unknown>;
  shared: boolean;
}

/**
 * Linha de `conversation_states` a usar. Desligado: exactamente a chave que
 * cada chamador já usava (`fallbackExternalId`). Ligado: a linha da conta.
 */
export function stateKeyFor(shared: boolean, channel: string, fallbackExternalId: string = channel): StateKey {
  if (shared && isMessagingChannel(channel)) {
    return { channel: ACCOUNT_SCOPE, externalId: ACCOUNT_SCOPE, extra: { last_channel: channel }, shared: true };
  }
  return { channel, externalId: fallbackExternalId, extra: {}, shared: false };
}

/** Nome do canal em linguagem do consultor. */
export function channelLabelPt(channel: string | null | undefined): string {
  if (channel === "whatsapp") return "WhatsApp";
  if (channel === "telegram") return "Telegram";
  if (channel === "dashboard") return "painel";
  return "outra conversa";
}
