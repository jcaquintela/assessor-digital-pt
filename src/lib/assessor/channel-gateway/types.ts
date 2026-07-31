// Channel Gateway — tipos comuns.
// Todos os canais (WhatsApp, Telegram, futuros) normalizam a entrada para
// NormalizedInbound e implementam ChannelAdapter. O motor v3 nunca conhece
// diferenças de canal: recebe sempre user_id + content e devolve reply.

export type Channel = "whatsapp" | "telegram";

export type NormalizedMessageType =
  | "text"
  | "image"
  | "document"
  | "audio"
  | "callback"
  | "reaction"
  | "unsupported";

export interface NormalizedMedia {
  externalFileId: string;
  fileName: string | null;
  mimeType: string | null;
  size: number | null;
  caption?: string | null;
}

export interface NormalizedCallback {
  data: string;
  callbackQueryId: string;
}

export interface NormalizedSender {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
}

export interface NormalizedInbound {
  channel: Channel;
  externalConversationId: string; // wa phone (E.164) ou tg chat_id (string)
  externalMessageId: string;      // wamid ou telegram_<update_id>
  replyToMessageId?: string | null;
  messageType: NormalizedMessageType;
  text: string | null;
  media: NormalizedMedia | null;
  callback: NormalizedCallback | null;
  sender: NormalizedSender | null;
  metadata: Record<string, unknown>;
  receivedAt: Date;
}

export interface AdapterSendResult {
  ok: boolean;
  messageId: string | null;
  error?: string | null;
}

export interface AdapterMediaBytes {
  ok: boolean;
  bytes?: Uint8Array;
  mimeType?: string;
  fileName?: string | null;
  error?: string;
}

export interface ChannelAdapter {
  channel: Channel;

  // 1. Payload cru -> N inbounds normalizados.
  parseUpdate(rawPayload: unknown): NormalizedInbound[];

  // 2. Hook opcional que corre ANTES da resolução de utilizador (ex.:
  //    LIGAR-XXXXXX no WhatsApp). Devolve handled=true se já respondeu.
  interceptBeforeIngest?(
    supabaseAdmin: any,
    inbound: NormalizedInbound,
  ): Promise<{ handled: boolean }>;

  // 3. Hook opcional quando o utilizador não existe (ex.: convite Telegram).
  //    Se devolver userId, o pipeline continua com esse id.
  onboardIfMissingUser?(
    supabaseAdmin: any,
    inbound: NormalizedInbound,
  ): Promise<{ handled: boolean; userId?: string | null; stopPipeline?: boolean }>;

  // 4. Persistência do turno "user" com dedupe por externalMessageId.
  //    Devolve o UUID interno (usado como source_message_id do motor) ou null.
  persistInbound(
    supabaseAdmin: any,
    inbound: NormalizedInbound,
    userId: string | null,
  ): Promise<string | null>;

  // 5. Verificação de duplicado (Meta reenvia; Telegram idem).
  isAlreadyProcessed(supabaseAdmin: any, externalMessageId: string): Promise<boolean>;

  // 6. Descarrega os bytes de um media a partir do inbound.
  fetchMedia(inbound: NormalizedInbound): Promise<AdapterMediaBytes>;

  // 7. Transporte.
  sendText(
    externalConversationId: string,
    text: string,
    opts?: { replyTo?: string | null },
  ): Promise<AdapterSendResult>;

  // 7b. Envio interativo (botões / lista). Opcional: se o canal não
  //     suportar, ou se falhar, o pipeline cai para sendText.
  sendInteractive?(
    externalConversationId: string,
    prompt: import("@/lib/assessor/interactive").InteractivePrompt,
    opts?: { replyTo?: string | null },
  ): Promise<AdapterSendResult>;

  answerInteraction?(callbackQueryId: string, feedback?: string): Promise<void>;

  // 8. Strings padrão por canal (podem partilhar copy, ficam no adapter
  //    para permitir tom/emoji/HTML específico).
  replyUnassociated: string;
  replyUnsupported: string;
  replyEngineError: string;
  replyMediaError: string;
  replyTranscribeFail: string;
}
