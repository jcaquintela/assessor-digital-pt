// Adapter do canal "dashboard" (Falar com Afonso, no painel web).
//
// O dashboard é um canal REATIVO: o consultor escreve e espera a resposta no
// mesmo ecrã. Por isso não há transporte externo — "enviar" é gravar a
// resposta em assessor_messages, que chega ao ecrã por Realtime.
//
// Tudo o resto (lock por consultor+canal, motor v3, rede de segurança,
// rascunhos) é o pipeline partilhado: este ficheiro não duplica lógica.
// Este canal NUNCA entra na regra de canal principal (WhatsApp > Telegram):
// lembretes e avisos proativos continuam a sair por onde já saíam.

import type {
  AdapterMediaBytes,
  AdapterSendResult,
  ChannelAdapter,
  NormalizedInbound,
} from "./types";

export const DASHBOARD_CHANNEL = "dashboard" as const;

// externalConversationId do dashboard = user_id do consultor.
export function buildDashboardInbound(args: {
  userId: string;
  text: string;
  messageId: string;
}): NormalizedInbound {
  return {
    channel: DASHBOARD_CHANNEL,
    externalConversationId: args.userId,
    externalMessageId: args.messageId,
    replyToMessageId: null,
    messageType: "text",
    text: args.text,
    media: null,
    callback: null,
    sender: null,
    metadata: { source_channel: DASHBOARD_CHANNEL },
    receivedAt: new Date(),
  };
}

export const dashboardAdapter: ChannelAdapter = {
  channel: DASHBOARD_CHANNEL,

  // O inbound é construído no servidor a partir da sessão autenticada; não
  // há payload cru de terceiros para fazer parse.
  parseUpdate(): NormalizedInbound[] {
    return [];
  },

  async persistInbound(supabaseAdmin: any, inbound: NormalizedInbound, userId: string | null) {
    if (!userId) return null;
    const { data, error } = await supabaseAdmin
      .from("assessor_messages")
      .insert({
        user_id: userId,
        role: "user",
        content: inbound.text ?? "",
        message_type: "dashboard_text",
        status: "received",
        channel: DASHBOARD_CHANNEL,
        conversation_id: inbound.externalMessageId,
      } as never)
      .select("id")
      .single();
    if (error) return null;
    return (data as { id: string } | null)?.id ?? null;
  },

  async isAlreadyProcessed(supabaseAdmin: any, externalMessageId: string) {
    const { data } = await supabaseAdmin
      .from("assessor_messages")
      .select("id")
      .eq("conversation_id", externalMessageId)
      .limit(1);
    return Array.isArray(data) && data.length > 0;
  },

  async fetchMedia(): Promise<AdapterMediaBytes> {
    return { ok: false, error: "dashboard não recebe ficheiros" };
  },

  // "Transporte": no dashboard a resposta é a própria linha em
  // assessor_messages, gravada pelo pipeline logo a seguir. Nada a enviar.
  async sendText(): Promise<AdapterSendResult> {
    return { ok: true, messageId: null };
  },

  replyUnassociated: "Não consegui identificar a tua conta. Volta a entrar no painel.",
  replyUnsupported: "Aqui no painel só leio texto. Manda ficheiros pelo WhatsApp ou Telegram.",
  replyEngineError: "Recebi a tua mensagem mas não consegui processá-la agora. Tenta daqui a pouco.",
  replyMediaError: "Aqui no painel ainda não recebo ficheiros.",
  replyTranscribeFail: "Aqui no painel ainda não recebo áudio.",
};
