// Pipeline única de ingestão. Recebe um inbound normalizado e um adapter e
// executa exactamente o mesmo fluxo em qualquer canal: dedupe → intercept
// → resolver utilizador → onboarding → persistir → motor v3 → responder.

import { findUserIdByChannel } from "@/lib/assessor/channels.server";
import type { AdapterSendResult, ChannelAdapter, NormalizedInbound } from "./types";
import type { EngineOutcome } from "@/lib/assessor/engine.server";
import { withConversationLock } from "./lock.server";
import { deriveInteractivePrompt } from "@/lib/assessor/interactive";

export async function runInboundPipeline(
  adapter: ChannelAdapter,
  supabaseAdmin: any,
  inbound: NormalizedInbound,
): Promise<void> {
  return runInboundPipelineInner(adapter, supabaseAdmin, inbound);
}

async function runInboundPipelineInner(
  adapter: ChannelAdapter,
  supabaseAdmin: any,
  inbound: NormalizedInbound,
): Promise<void> {
  // 1. Dedupe.
  if (await adapter.isAlreadyProcessed(supabaseAdmin, inbound.externalMessageId)) return;

  // 2. Reacções e afins: só regista, sem resposta.
  if (inbound.messageType === "reaction") {
    await adapter.persistInbound(supabaseAdmin, inbound, null);
    return;
  }

  // 3. Intercept específico do canal (ex.: LIGAR-XXXXXX no WhatsApp).
  if (adapter.interceptBeforeIngest) {
    const r = await adapter.interceptBeforeIngest(supabaseAdmin, inbound);
    if (r.handled) return;
  }

  // 4. Resolver utilizador.
  let userId = await findUserIdByChannel(
    supabaseAdmin,
    inbound.channel,
    inbound.externalConversationId,
  );

  // 5. Se ainda não existe, tenta onboarding próprio do canal.
  if (!userId && adapter.onboardIfMissingUser) {
    const onboard = await adapter.onboardIfMissingUser(supabaseAdmin, inbound);
    if (onboard.handled && !onboard.userId) {
      // Onboarding respondeu (convite inválido/erro); persistir turno para trilha.
      await adapter.persistInbound(supabaseAdmin, inbound, null);
      return;
    }
    userId = onboard.userId ?? null;

    // Conta acabada de criar: a saudação de boas-vindas já foi enviada e é a
    // única resposta deste turno — a mensagem original (ex.: "/start CÓDIGO")
    // não volta a entrar no motor.
    if (userId && onboard.stopPipeline) {
      await adapter.persistInbound(supabaseAdmin, inbound, userId);
      return;
    }
  }

  // 6. Persistir turno do utilizador (uma única vez, agora que sabemos userId).
  const persistedUuid = await adapter.persistInbound(supabaseAdmin, inbound, userId);

  // 7. Sem utilizador → resposta "não associado".
  if (!userId) {
    await adapter.sendText(inbound.externalConversationId, adapter.replyUnassociated);
    return;
  }

  // 7b. A partir daqui há estado conversacional em jogo (rascunhos, memória).
  // Pedido de entrada no painel ("entrar"/"login"): link temporário e fim de
  // turno — não passa pelo motor.
  if (inbound.messageType === "text") {
    const { looksLikeLoginRequest, issueDashboardLoginLink, LOGIN_LINK_REPLY } = await import(
      "@/lib/auth/dashboard-login.server"
    );
    if (looksLikeLoginRequest(inbound.text)) {
      const { url } = await issueDashboardLoginLink(supabaseAdmin, userId, inbound.channel);
      await adapter.sendText(inbound.externalConversationId, LOGIN_LINK_REPLY(url));
      return;
    }
  }

  // Um turno de cada vez por consultor+canal — mensagens seguidas ficam em
  // fila em vez de correrem em paralelo sobre o mesmo rascunho.
  await withConversationLock(supabaseAdmin, userId, inbound.channel, () =>
    routeInbound(adapter, supabaseAdmin, inbound, userId as string, persistedUuid),
  );
}

async function routeInbound(
  adapter: ChannelAdapter,
  supabaseAdmin: any,
  inbound: NormalizedInbound,
  userId: string,
  persistedUuid: string | null,
): Promise<void> {
  // 8. Rotear por tipo.
  if (inbound.messageType === "text" || inbound.messageType === "callback") {
    const content =
      inbound.messageType === "callback"
        ? inbound.callback?.data ?? ""
        : inbound.text ?? "";
    if (!content.trim()) return;
    try {
      const { processAssessorMessage } = await import("@/lib/assessor/engine.server");
      const outcome = await processAssessorMessage({
        supabase: supabaseAdmin,
        userId,
        channel: inbound.channel,
        content,
        receivedAt: inbound.receivedAt,
        sourceMessageId: persistedUuid,
      });
      await deliverReply(adapter, supabaseAdmin, {
        userId,
        externalConversationId: inbound.externalConversationId,
        outcome,
        replyTo: inbound.replyToMessageId ?? null,
      });
      if (inbound.messageType === "callback" && inbound.callback && adapter.answerInteraction) {
        try { await adapter.answerInteraction(inbound.callback.callbackQueryId); }
        catch { /* Telegram acknowledge é best-effort */ }
      }
    } catch (err) {
      console.error(
        `[channel-gateway/${adapter.channel}] engine:`,
        err instanceof Error ? err.message : err,
      );
      await adapter.sendText(inbound.externalConversationId, adapter.replyEngineError);
    }
    return;
  }

  if (inbound.messageType === "image" || inbound.messageType === "document" || inbound.messageType === "audio") {
    await handleInboundMedia(adapter, supabaseAdmin, inbound, userId, persistedUuid);
    return;
  }

  await adapter.sendText(inbound.externalConversationId, adapter.replyUnsupported);
}

async function deliverReply(
  adapter: ChannelAdapter,
  supabaseAdmin: any,
  args: {
    userId: string;
    externalConversationId: string;
    outcome: EngineOutcome;
    replyTo: string | null;
  },
): Promise<AdapterSendResult> {
  const { outcome, externalConversationId, userId, replyTo } = args;
  const alreadyPersisted = outcome.messageType === "__ALREADY_PERSISTED__";

  // Perguntas de resposta fechada seguem como botões tocáveis. Se o canal
  // não suportar, ou o envio interativo falhar (ex.: fora da janela de 24h),
  // cai para texto simples — a conversa nunca bloqueia por isto.
  let send: AdapterSendResult | null = null;
  if (adapter.sendInteractive) {
    try {
      const prompt = deriveInteractivePrompt(outcome.reply, {
        hasPendingConfirmation: await hasPendingConfirmation(
          supabaseAdmin,
          userId,
          adapter.channel,
        ),
      });
      if (prompt) {
        const r = await adapter.sendInteractive(externalConversationId, prompt, { replyTo });
        if (r.ok) send = r;
        else console.error(
          `[channel-gateway/${adapter.channel}] interactive falhou, fallback texto:`,
          r.error ?? "unknown",
        );
      }
    } catch (err) {
      console.error(
        `[channel-gateway/${adapter.channel}] interactive:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  if (!send) {
    send = await adapter.sendText(externalConversationId, outcome.reply, { replyTo });
  }
  if (!alreadyPersisted) {
    await supabaseAdmin.from("assessor_messages").insert({
      user_id: userId,
      role: "assistant",
      content: outcome.reply,
      message_type: `${adapter.channel}_text`,
      status: send.ok ? "sent" : "failed",
      channel: adapter.channel,
      sender_phone: externalConversationId,
      whatsapp_message_id: send.ok ? send.messageId : null,
    });
  }
  return send;
}

// Só propomos "Sim"/"Ainda não" quando existe mesmo um rascunho à espera de
// confirmação. Perguntas abertas (ex.: "A que horas?") continuam em texto.
async function hasPendingConfirmation(
  supabaseAdmin: any,
  userId: string,
  channel: string,
): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin
      .from("pending_actions")
      .select("id")
      .eq("user_id", userId)
      .eq("channel", channel)
      .eq("status", "pending_confirmation")
      .gt("expires_at", new Date().toISOString())
      .limit(1);
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

async function handleInboundMedia(
  adapter: ChannelAdapter,
  supabaseAdmin: any,
  inbound: NormalizedInbound,
  userId: string,
  persistedUuid: string | null,
): Promise<void> {
  const dl = await adapter.fetchMedia(inbound);
  if (!dl.ok || !dl.bytes) {
    console.error(
      `[channel-gateway/${adapter.channel}] media download:`,
      dl.error ?? "unknown",
    );
    await adapter.sendText(inbound.externalConversationId, adapter.replyMediaError);
    return;
  }

  const mimeType = dl.mimeType ?? inbound.media?.mimeType ?? "application/octet-stream";
  const { processIncomingFile } = await import("@/lib/assessor/files.server");
  const result = await processIncomingFile({
    supabase: supabaseAdmin,
    userId,
    channel: adapter.channel,
    externalFileId: inbound.media?.externalFileId ?? null,
    fileName: dl.fileName ?? inbound.media?.fileName ?? null,
    mimeType,
    size: dl.bytes.byteLength,
    bytes: dl.bytes,
    sourceMessageId: persistedUuid,
  });

  // Áudio → transcreve e re-entra no motor com o texto resultante.
  if (result.ok && inbound.messageType === "audio") {
    try {
      const { transcribeAudio } = await import("@/lib/ai/transcribe.server");
      const t = await transcribeAudio(dl.bytes, mimeType);
      if (!t.ok || !t.text) {
        await adapter.sendText(inbound.externalConversationId, adapter.replyTranscribeFail);
        return;
      }
      // Log da transcrição como user turn para o motor ter contexto textual.
      await supabaseAdmin.from("assessor_messages").insert({
        user_id: userId,
        role: "user",
        content: t.text,
        message_type: `${adapter.channel}_audio_transcript`,
        status: "received",
        channel: adapter.channel,
        sender_phone: inbound.externalConversationId,
      });
      const { processAssessorMessage } = await import("@/lib/assessor/engine.server");
      const outcome = await processAssessorMessage({
        supabase: supabaseAdmin,
        userId,
        channel: adapter.channel,
        content: t.text,
        receivedAt: inbound.receivedAt,
        sourceMessageId: persistedUuid,
      });
      await deliverReply(adapter, supabaseAdmin, {
        userId,
        externalConversationId: inbound.externalConversationId,
        outcome,
        replyTo: inbound.replyToMessageId ?? null,
      });
      return;
    } catch (err) {
      console.error(
        `[channel-gateway/${adapter.channel}] transcribe:`,
        err instanceof Error ? err.message : err,
      );
      await adapter.sendText(inbound.externalConversationId, adapter.replyTranscribeFail);
      return;
    }
  }

  // Imagem → o modelo lê o texto visível (placas "Vende-se") e o motor
  // segue o fluxo normal, como se o consultor tivesse escrito o número.
  if (result.ok && inbound.messageType === "image") {
    try {
      const { readImage, readingToEngineText, supportsVision } = await import("@/lib/ai/vision.server");
      if (supportsVision(mimeType)) {
        const vision = await readImage(dl.bytes, mimeType);
        if (vision.ok) {
          const reading = vision.reading;
          if (result.fileId) {
            await supabaseAdmin
              .from("uploaded_files")
              .update({
                extracted_text: reading.visible_text,
                extracted_metadata: reading as unknown as Record<string, unknown>,
                classification: reading.is_sign ? "prospecao" : "imagem",
              })
              .eq("id", result.fileId);
          }
          const engineText = readingToEngineText(reading, inbound.media?.caption ?? inbound.text);
          if (engineText) {
            // A pergunta "A que se refere?" deixa de fazer sentido: já sabemos.
            const { findActivePendingAction, markPendingActionStatus } =
              await import("@/lib/assessor/memory.server");
            const prev = await findActivePendingAction(supabaseAdmin, userId, adapter.channel);
            if (prev?.intent === "classify_file") {
              await markPendingActionStatus(supabaseAdmin, prev.id, "cancelled");
            }
            await supabaseAdmin.from("assessor_messages").insert({
              user_id: userId,
              role: "user",
              content: engineText,
              message_type: `${adapter.channel}_image_reading`,
              status: "received",
              channel: adapter.channel,
              sender_phone: inbound.externalConversationId,
            });
            const { processAssessorMessage } = await import("@/lib/assessor/engine.server");
            const outcome = await processAssessorMessage({
              supabase: supabaseAdmin,
              userId,
              channel: adapter.channel,
              content: engineText,
              receivedAt: inbound.receivedAt,
              sourceMessageId: persistedUuid,
            });
            await deliverReply(adapter, supabaseAdmin, {
              userId,
              externalConversationId: inbound.externalConversationId,
              outcome,
              replyTo: inbound.replyToMessageId ?? null,
            });
            return;
          }
        } else {
          console.error(`[channel-gateway/${adapter.channel}] vision:`, vision.error);
        }
      }
    } catch (err) {
      console.error(
        `[channel-gateway/${adapter.channel}] vision:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  await adapter.sendText(inbound.externalConversationId, result.reply);
}
