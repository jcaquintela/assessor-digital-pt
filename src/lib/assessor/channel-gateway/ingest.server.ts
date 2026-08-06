// Pipeline única de ingestão. Recebe um inbound normalizado e um adapter e
// executa exactamente o mesmo fluxo em qualquer canal: dedupe → intercept
// → resolver utilizador → onboarding → persistir → motor v3 → responder.

import { findUserIdByChannel } from "@/lib/assessor/channels.server";
import type { AdapterSendResult, ChannelAdapter, NormalizedInbound } from "./types";
import type { EngineOutcome } from "@/lib/assessor/engine.server";
import { withConversationLock } from "./lock.server";
import { deriveInteractivePrompt, parseOutcomeCommand } from "@/lib/assessor/interactive";

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

    // Botão de resultado do check-in da tarde: actualiza o seguimento na
    // hora e responde curto. Não passa pelo motor. Se a resposta vier
    // escrita ("já liguei", "fica sem efeito"), resolvemos o seguimento a
    // que o Assessor se referiu há pouco e fechamos na mesma.
    let outcomeCmd = parseOutcomeCommand(content);
    if (!outcomeCmd && inbound.messageType === "text") {
      const { detectOutcomeFromText } = await import("@/lib/assessor/outcome-intent");
      const detected = detectOutcomeFromText(content);
      if (detected) {
        const { resolveOutcomeTargetFollowUp } = await import("@/lib/assessor/proactive/outcomes.server");
        const target = await resolveOutcomeTargetFollowUp(supabaseAdmin, userId);
        if (target) outcomeCmd = { followUpId: target.id, outcome: detected };
      }
    }
    if (outcomeCmd) {
      const { applyFollowUpOutcome, outcomeAck } = await import("@/lib/assessor/proactive/outcomes.server");
      const r = await applyFollowUpOutcome(
        supabaseAdmin, userId, outcomeCmd.followUpId, outcomeCmd.outcome,
      );
      const ack = r.ok
        ? outcomeAck(outcomeCmd.outcome, r.title)
        : "Não encontrei esse seguimento. Deve ter sido fechado entretanto.";
      const send = await adapter.sendText(inbound.externalConversationId, ack);
      await supabaseAdmin.from("assessor_messages").insert({
        user_id: userId, role: "assistant", content: ack,
        message_type: "outcome_ack", channel: adapter.channel,
        status: send.ok ? "sent" : "failed",
        related_resource_type: "follow_up", related_resource_id: outcomeCmd.followUpId,
      } as never);
      if (inbound.callback && adapter.answerInteraction) {
        try { await adapter.answerInteraction(inbound.callback.callbackQueryId); } catch { /* best-effort */ }
      }
      return;
    }

    // Resgate de código promocional numa conta já existente: confirmação
    // explícita antes de mexer no plano. Não passa pelo motor.
    if (await handlePromoRedeem(adapter, supabaseAdmin, inbound, userId, content)) {
      if (inbound.callback && adapter.answerInteraction) {
        try { await adapter.answerInteraction(inbound.callback.callbackQueryId); }
        catch { /* best-effort */ }
      }
      return;
    }

    // Escolha de plano no fim do período experimental (dia 12). Só corre se
    // a escolha tiver sido pedida e ainda não estiver registada.
    if (await handleTrialChoiceAnswer(adapter, supabaseAdmin, inbound, userId, content)) {
      if (inbound.callback && adapter.answerInteraction) {
        try { await adapter.answerInteraction(inbound.callback.callbackQueryId); }
        catch { /* best-effort */ }
      }
      return;
    }

    // Confirmação de um cartão de visita lido numa foto: cria o contacto e
    // devolve o ficheiro pronto a guardar. Não passa pelo motor.
    if (await handleBusinessCardAnswer(adapter, supabaseAdmin, inbound, userId, content)) {
      if (inbound.callback && adapter.answerInteraction) {
        try { await adapter.answerInteraction(inbound.callback.callbackQueryId); }
        catch { /* best-effort */ }
      }
      return;
    }

    // Recuperador do Drive: "manda-me a caderneta predial do T2 de Benfica"
    // ou "que documentos tenho da Sra. Ana?". Devolve o ficheiro real como
    // anexo — não uma descrição. Não passa pelo motor.
    {
      const { handleDocumentRequest } = await import("@/lib/drive/retrieve-channel.server");
      if (
        await handleDocumentRequest(adapter, supabaseAdmin, {
          userId,
          to: inbound.externalConversationId,
          content,
        })
      ) {
        if (inbound.callback && adapter.answerInteraction) {
          try { await adapter.answerInteraction(inbound.callback.callbackQueryId); }
          catch { /* best-effort */ }
        }
        return;
      }
    }

    try {
      const { processAssessorMessage } = await import("@/lib/assessor/engine.server");
      // Rajada de mensagens seguidas: junta-as num só turno em vez de correr
      // um ciclo de raciocínio por mensagem (evita perguntas duplicadas).
      let engineContent = content;
      if (inbound.messageType === "text") {
        const { coalesceInboundText } = await import("./coalesce.server");
        const c = await coalesceInboundText(supabaseAdmin, {
          userId,
          channel: adapter.channel,
          currentMessageId: persistedUuid,
          fallbackContent: content,
        });
        if (c.yield) return; // mensagem mais recente responde por esta.
        engineContent = c.content;
      }
      const outcome = await processAssessorMessage({
        supabase: supabaseAdmin,
        userId,
        channel: inbound.channel,
        content: engineContent,
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

  // Idempotência de entrega: um reenvio do mesmo evento (retry do webhook,
  // worker duplicado) não pode voltar a mandar a mesma frase ao consultor.
  if (await alreadyDelivered(supabaseAdmin, userId, adapter.channel, outcome.reply)) {
    return { ok: true } as AdapterSendResult;
  }

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

// Janela curta: só bloqueia repetições sem novo pedido do consultor.
const DELIVERY_DEDUPE_MS = 120_000;

export async function alreadyDelivered(
  supabaseAdmin: any,
  userId: string,
  channel: string,
  content: string,
): Promise<boolean> {
  const text = String(content ?? "").trim();
  if (!text) return false;
  try {
    const since = new Date(Date.now() - DELIVERY_DEDUPE_MS).toISOString();
    const { data } = await supabaseAdmin
      .from("assessor_messages")
      .select("id, content, created_at, role")
      .eq("user_id", userId)
      .eq("channel", channel)
      .eq("role", "assistant")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5);
    if (!Array.isArray(data)) return false;
    return data.some((r: any) => String(r?.content ?? "").trim() === text);
  } catch {
    return false;
  }
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
  return handleInboundMediaInner(adapter, supabaseAdmin, inbound, userId, persistedUuid);
}

/**
 * Resposta a uma proposta de contacto a partir de cartão de visita.
 * Devolve true quando tratou o turno (e já respondeu).
 */
async function handleBusinessCardAnswer(
  adapter: ChannelAdapter,
  supabaseAdmin: any,
  inbound: NormalizedInbound,
  userId: string,
  content: string,
): Promise<boolean> {
  try {
    const { findActivePendingAction, markPendingActionStatus } = await import(
      "@/lib/assessor/memory.server"
    );
    const pending = await findActivePendingAction(supabaseAdmin, userId, adapter.channel);
    const { BUSINESS_CARD_INTENT, confirmBusinessCardContact } = await import(
      "@/lib/assessor/business-card.server"
    );
    if (!pending || pending.intent !== BUSINESS_CARD_INTENT) return false;

    const { isConfirmation, isRejection } = await import(
      "@/lib/assessor/culture/short-answers"
    );
    if (isRejection(content)) {
      await markPendingActionStatus(supabaseAdmin, pending.id, "cancelled");
      await adapter.sendText(
        inbound.externalConversationId,
        "Está bem, não registei nada. Guardei a foto em Diversos.",
      );
      return true;
    }
    if (!isConfirmation(content)) return false;

    const payload = (pending.structured_payload ?? {}) as any;
    const card = payload.card ?? null;
    if (!card?.name) {
      await markPendingActionStatus(supabaseAdmin, pending.id, "cancelled");
      return false;
    }

    const res = await confirmBusinessCardContact({
      supabase: supabaseAdmin,
      userId,
      channel: adapter.channel,
      card,
      fileId: payload.file_id ?? null,
    });
    await markPendingActionStatus(supabaseAdmin, pending.id, res.ok ? "executed" : "failed");

    const send = await adapter.sendText(inbound.externalConversationId, res.reply);
    await supabaseAdmin.from("assessor_messages").insert({
      user_id: userId,
      role: "assistant",
      content: res.reply,
      message_type: `${adapter.channel}_text`,
      status: send.ok ? "sent" : "failed",
      channel: adapter.channel,
      sender_phone: inbound.externalConversationId,
    } as never);

    if (res.ok && res.vcard && res.card) {
      await deliverContactCard(adapter, inbound.externalConversationId, res.card, res.vcard);
    }
    return true;
  } catch (err) {
    console.error(
      `[channel-gateway/${adapter.channel}] business-card:`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

/** Envia o contacto: cartão nativo quando existir, .vcf como alternativa. */
async function deliverContactCard(
  adapter: ChannelAdapter,
  externalConversationId: string,
  card: { name: string; phone: string | null; email?: string | null; company?: string | null },
  vcard: { fileName: string; content: string; signedUrl: string | null },
): Promise<void> {
  const bytes = new TextEncoder().encode(vcard.content);

  if (adapter.channel === "telegram" && adapter.sendContact && card.phone) {
    const r = await adapter.sendContact(externalConversationId, { ...card, vcard: vcard.content });
    if (r.ok) return;
  }

  if (adapter.sendDocument) {
    const r = await adapter.sendDocument(externalConversationId, {
      bytes,
      fileName: vcard.fileName,
      mimeType: "text/vcard",
      caption: `Cartão de ${card.name}`,
      url: vcard.signedUrl,
    });
    if (r.ok) return;
    console.error(`[channel-gateway/${adapter.channel}] vcf falhou:`, r.error);
  }

  if (adapter.sendContact && card.phone) {
    const r = await adapter.sendContact(externalConversationId, { ...card, vcard: vcard.content });
    if (r.ok) return;
    console.error(`[channel-gateway/${adapter.channel}] contacto nativo falhou:`, r.error);
  }

  const linha = [card.name, card.phone, card.email].filter(Boolean).join(" · ");
  await adapter.sendText(
    externalConversationId,
    `Não consegui enviar o ficheiro do contacto. Fica aqui: ${linha}`,
  );
}

/**
 * Resposta a uma imagem, com coalescência de rajada.
 *
 * Uma rajada de fotos (páginas de um documento) é um assunto só: cada foto é
 * tratada e ligada normalmente, mas só a última fala — e fala por todas.
 */
async function deliverMediaReply(
  adapter: ChannelAdapter,
  supabaseAdmin: any,
  inbound: NormalizedInbound,
  userId: string,
  persistedUuid: string | null,
  outcome: EngineOutcome,
): Promise<void> {
  let finalOutcome = outcome;
  if (inbound.messageType === "image") {
    const { decideImageBurstReply, buildImageBurstReply } = await import("./image-burst.server");
    const decision = await decideImageBurstReply(supabaseAdmin, {
      userId,
      channel: adapter.channel,
      currentMessageId: persistedUuid,
    });
    // Vem outra foto a seguir: esta cala-se.
    if (!decision.answer) return;
    if (decision.count > 1) {
      const reply = await buildImageBurstReply(supabaseAdmin, {
        userId,
        channel: adapter.channel,
        count: decision.count,
        since: decision.since,
      });
      finalOutcome = { ...outcome, reply };
    }
  }
  await deliverReply(adapter, supabaseAdmin, {
    userId,
    externalConversationId: inbound.externalConversationId,
    outcome: finalOutcome,
    replyTo: inbound.replyToMessageId ?? null,
  });
}

async function handleInboundMediaInner(
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
    // Imagens: só ligamos depois de ler o documento (morada, NIF, artigo).
    deferAutoLink: inbound.messageType === "image",
  });

  // Anexo a um erro/sugestão por confirmar → junta ao rascunho e não segue
  // pelo fluxo normal de Drive/visão.
  if (result.ok && result.fileId) {
    const { attachFileToPendingFeedback } = await import("@/lib/assessor/v3/feedback.server");
    const attached = await attachFileToPendingFeedback(supabaseAdmin, {
      userId,
      channel: adapter.channel,
      fileId: result.fileId,
    });
    if (attached) {
      const { FEEDBACK_ATTACHMENT_ADDED_REPLY } = await import("@/lib/assessor/v3/feedback");
      await deliverReply(adapter, supabaseAdmin, {
        userId,
        externalConversationId: inbound.externalConversationId,
        outcome: { reply: FEEDBACK_ATTACHMENT_ADDED_REPLY },
        replyTo: inbound.replyToMessageId ?? null,
      });
      return;
    }
  }

  // Áudio → transcreve e re-entra no motor com o texto resultante.
  if (result.ok && inbound.messageType === "audio") {
    try {
      const { transcribeAudio } = await import("@/lib/ai/transcribe.server");
      const t = await transcribeAudio(dl.bytes, mimeType);
      if (!t.ok || !t.text) {
        await adapter.sendText(inbound.externalConversationId, adapter.replyTranscribeFail);
        return;
      }
      // Guarda a transcrição e dá um nome legível ao ficheiro no Drive.
      if (result.fileId) {
        const { refineFileName } = await import("@/lib/assessor/files.server");
        await supabaseAdmin
          .from("uploaded_files")
          .update({ extracted_text: t.text } as never)
          .eq("id", result.fileId);
        await refineFileName(supabaseAdmin, result.fileId, "audio", t.text);
      }
      // Áudio puramente social ("olá", "obrigado", "ok"): não entra no Drive
      // Inteligente de todo, e não gera pergunta nenhuma.
      const { isSocialAudio } = await import("@/lib/assessor/v3/audio-keep");
      const socialAudio = isSocialAudio(t.text);
      if (socialAudio && result.fileId) {
        const { discardAudioFile } = await import("@/lib/assessor/v3/audio-keep.server");
        await discardAudioFile(supabaseAdmin, result.fileId, userId);
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
      // Processador de Áudio Imobiliário: um áudio informal e comprido é
      // separado em factos, seguimentos e notas, com uma só confirmação.
      // Se não houver mais do que um item, segue o caminho normal.
      let outcome: { reply: string } | null = null;
      try {
        const { worthBreakingDown } = await import("@/lib/assessor/v3/audio-breakdown");
        if (worthBreakingDown(t.text)) {
          const { analyseAudioTranscript, proposeAudioBreakdown } =
            await import("@/lib/assessor/v3/audio-breakdown.server");
          const breakdown = await analyseAudioTranscript(t.text);
          if (breakdown) {
            const reply = await proposeAudioBreakdown(
              {
                supabase: supabaseAdmin,
                userId,
                channel: adapter.channel,
                sourceMessageId: persistedUuid,
              } as never,
              t.text,
              breakdown,
              result.fileId ?? null,
            );
            outcome = { reply };
          }
        }
      } catch (err) {
        console.error(
          `[channel-gateway/${adapter.channel}] audio-breakdown:`,
          err instanceof Error ? err.message : err,
        );
      }
      outcome = outcome ?? await processAssessorMessage({
        supabase: supabaseAdmin,
        userId,
        channel: adapter.channel,
        content: t.text,
        receivedAt: inbound.receivedAt,
        sourceMessageId: persistedUuid,
      });

      // Regra generalizada: depois de QUALQUER áudio com conteúdo — mesmo
      // sem registo estruturado criado — pergunta-se uma vez o que fazer ao
      // ficheiro. Se ficou outro assunto por confirmar (ex.: a proposta do
      // áudio), a pergunta sai depois, quando esse assunto fechar.
      if (!socialAudio && result.fileId) {
        const { findActivePendingAction } = await import("@/lib/assessor/memory.server");
        const mainPending = await findActivePendingAction(supabaseAdmin, userId, adapter.channel);
        if (!mainPending) {
          const { askKeepAudio } = await import("@/lib/assessor/v3/audio-keep.server");
          const { appendKeepQuestion } = await import("@/lib/assessor/v3/audio-keep");
          const question = await askKeepAudio(supabaseAdmin, {
            userId,
            channel: adapter.channel,
            fileId: result.fileId,
            transcript: t.text,
            sourceMessageId: persistedUuid,
          });
          if (question) outcome = { reply: appendKeepQuestion(outcome.reply, question) };
        }
      }
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
    let docMeta: Awaited<
      ReturnType<typeof import("@/lib/assessor/files.server").applyDocumentExtraction>
    > = null;
    let visionDone = false;
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
                classification: reading.is_sign
                  ? "prospecao"
                  : reading.is_business_card
                    ? "cartao_visita"
                    : "imagem",
              })
              .eq("id", result.fileId);
            const { refineFileName, applyDocumentExtraction } = await import(
              "@/lib/assessor/files.server"
            );
            await refineFileName(
              supabaseAdmin,
              result.fileId,
              "imagem",
              reading.person_name
                ? `cartão de ${reading.person_name}`
                : (reading.visible_text ?? reading.description),
            );

            // Documento fotografado → mesma extração dos PDFs (datas, NIF,
            // artigo matricial, morada) e nome legível.
            if (reading.is_document) {
              const { data: cur } = await supabaseAdmin
                .from("uploaded_files")
                .select("original_file_name")
                .eq("id", result.fileId)
                .maybeSingle();
              docMeta = await applyDocumentExtraction({
                supabase: supabaseAdmin,
                fileId: result.fileId,
                bytes: dl.bytes,
                mimeType,
                currentName: (cur as any)?.original_file_name ?? null,
              });
            }

            // Filtro de ruído: fotos sem valor (refeição, café, captura de
            // ecrã irrelevante) não ficam no Drive sem o consultor querer —
            // mesma disciplina do áudio: pergunta-se antes de manter.
            if (!reading.has_document_value && !reading.is_sign && !reading.is_business_card && !reading.is_document) {
              await supabaseAdmin
                .from("uploaded_files")
                .update({
                  photo_value: "sem_valor",
                  deleted_at: new Date().toISOString(),
                  processing_status: "deleted",
                } as never)
                .eq("id", result.fileId);
              const kind = reading.photo_kind ? ` (${reading.photo_kind})` : "";
              const question = `Recebi a foto${kind}, mas não me parece ter valor para o teu trabalho — não a guardei no Drive Inteligente. Queres que a guarde na mesma?`;
              const { findActivePendingAction, markPendingActionStatus, createPendingAction } =
                await import("@/lib/assessor/memory.server");
              const prev = await findActivePendingAction(supabaseAdmin, userId, adapter.channel);
              if (prev) await markPendingActionStatus(supabaseAdmin, prev.id, "cancelled");
              await createPendingAction(supabaseAdmin, {
                userId,
                channel: adapter.channel,
                intent: "confirm_keep_photo",
                originalContent: reading.photo_kind ?? "foto sem valor documental",
                payload: { file_id: result.fileId, photo_kind: reading.photo_kind },
                pendingQuestion: question,
                currentQuestion: question,
                sourceMessageId: persistedUuid,
              });
              await deliverReply(adapter, supabaseAdmin, {
                userId,
                externalConversationId: inbound.externalConversationId,
                outcome: { reply: question },
                replyTo: inbound.replyToMessageId ?? null,
              });
              return;
            }

            await supabaseAdmin
              .from("uploaded_files")
              .update({ photo_value: "documental" } as never)
              .eq("id", result.fileId);
          }

          // Cartão de visita → proposta de contacto (com botões), antes de
          // qualquer leitura genérica.
          const { extractBusinessCard, proposeBusinessCardContact } = await import(
            "@/lib/assessor/business-card.server"
          );
          const card = extractBusinessCard(reading);
          if (card) {
            const question = await proposeBusinessCardContact({
              supabase: supabaseAdmin,
              userId,
              channel: adapter.channel,
              card,
              fileId: result.fileId,
              sourceMessageId: persistedUuid,
            });
            await deliverReply(adapter, supabaseAdmin, {
              userId,
              externalConversationId: inbound.externalConversationId,
              outcome: { reply: question },
              replyTo: inbound.replyToMessageId ?? null,
            });
            return;
          }

          // Ligação automática com o que foi lido: a morada/NIF da caderneta
          // servem para encontrar o imóvel certo (antes corria sem OCR).
          const caption = inbound.media?.caption ?? inbound.text ?? null;
          const { docLinkText, documentToEngineText } = await import("@/lib/drive/doc-engine-text");
          let autoReply: string | null = null;
          // Documento de várias páginas: consolidamos a leitura das páginas
          // anteriores para haver uma ligação única ao imóvel.
          let pageInfo: Awaited<
            ReturnType<typeof import("@/lib/drive/doc-pages.server").consolidateDocumentPage>
          > | null = null;
          let effectiveReading = docMeta?.reading ?? null;
          if (result.fileId && docMeta?.reading) {
            const { consolidateDocumentPage } = await import("@/lib/drive/doc-pages.server");
            pageInfo = await consolidateDocumentPage({
              supabase: supabaseAdmin,
              userId,
              fileId: result.fileId,
              reading: {
                ...docMeta.reading,
                visible_text: docMeta.reading.visible_text ?? reading.visible_text ?? null,
              },
            });
            effectiveReading = { ...docMeta.reading, ...pageInfo.merged } as typeof docMeta.reading;
          }

          // Página seguinte de um documento já identificado e ligado: não se
          // volta a perguntar nada, só se confirma que entrou no mesmo sítio.
          if (pageInfo?.joined) {
            const { pageJoinedText } = await import("@/lib/drive/doc-pages");
            const { findActivePendingAction, markPendingActionStatus } =
              await import("@/lib/assessor/memory.server");
            const prevPending = await findActivePendingAction(supabaseAdmin, userId, adapter.channel);
            if (prevPending?.intent === "classify_file") {
              await markPendingActionStatus(supabaseAdmin, prevPending.id, "cancelled");
            }
            await deliverReply(adapter, supabaseAdmin, {
              userId,
              externalConversationId: inbound.externalConversationId,
              outcome: {
                reply: pageJoinedText(
                  pageInfo.pageNumber,
                  effectiveReading?.doc_type ?? null,
                  pageInfo.linkedLabel,
                ),
              },
              replyTo: inbound.replyToMessageId ?? null,
            });
            return;
          }
          if (result.fileId) {
            visionDone = true;
            const extraText =
              docLinkText({
                ...(effectiveReading ?? {}),
                visible_text: effectiveReading?.visible_text ?? reading.visible_text,
              }) ?? null;
            try {
              const { autoLinkAndSuggest } = await import("@/lib/drive/link-suggestions.server");
              const auto = await autoLinkAndSuggest({
                supabase: supabaseAdmin,
                userId,
                channel: adapter.channel,
                fileId: result.fileId,
                fileLabel: "a imagem",
                extraText,
                sourceMessageId: persistedUuid,
              });
              autoReply = auto.reply;
            } catch (err) {
              console.error(
                `[channel-gateway/${adapter.channel}] autoLink:`,
                err instanceof Error ? err.message : err,
              );
            }
          }

          // Documento fotografado: dizemos o que é, em vez de "a que se refere?".
          const docText = effectiveReading
            ? documentToEngineText(effectiveReading, autoReply ? null : caption)
            : null;
          if (docText && autoReply) {
            const { findActivePendingAction, markPendingActionStatus } =
              await import("@/lib/assessor/memory.server");
            const prev = await findActivePendingAction(supabaseAdmin, userId, adapter.channel);
            if (prev?.intent === "classify_file") {
              await markPendingActionStatus(supabaseAdmin, prev.id, "cancelled");
            }
            await deliverReply(adapter, supabaseAdmin, {
              userId,
              externalConversationId: inbound.externalConversationId,
              outcome: { reply: `${docText} ${autoReply}` },
              replyTo: inbound.replyToMessageId ?? null,
            });
            return;
          }
          if (autoReply && !docText) {
            await deliverReply(adapter, supabaseAdmin, {
              userId,
              externalConversationId: inbound.externalConversationId,
              outcome: { reply: autoReply },
              replyTo: inbound.replyToMessageId ?? null,
            });
            return;
          }

          const engineText = readingToEngineText(reading, caption) ?? docText;
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

    // Sem leitura possível: a ligação automática, que tinha ficado adiada,
    // corre agora à mesma para o ficheiro não ficar solto.
    if (!visionDone && result.fileId) {
      try {
        const { autoLinkAndSuggest } = await import("@/lib/drive/link-suggestions.server");
        const auto = await autoLinkAndSuggest({
          supabase: supabaseAdmin,
          userId,
          channel: adapter.channel,
          fileId: result.fileId,
          fileLabel: "a imagem",
          extraText: null,
          sourceMessageId: persistedUuid,
        });
        if (auto.reply) {
          await deliverReply(adapter, supabaseAdmin, {
            userId,
            externalConversationId: inbound.externalConversationId,
            outcome: { reply: auto.reply },
            replyTo: inbound.replyToMessageId ?? null,
          });
          return;
        }
      } catch (err) {
        console.error(
          `[channel-gateway/${adapter.channel}] autoLink fallback:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  await adapter.sendText(inbound.externalConversationId, result.reply);
}

// --- Código promocional em conta já existente -------------------------------
// Só tratamos como código quando o texto tem mesmo cara de código (dígito,
// hífen ou tudo em maiúsculas) — assim "obrigado" nunca vira "código inválido".
function looksLikeCodeShape(text: string): boolean {
  const t = text.trim();
  if (/\s/.test(t) || t.length < 4 || t.length > 40) return false;
  return /\d/.test(t) || /-/.test(t) || t === t.toUpperCase();
}

// Cara inequívoca de código (dígito + hífen ou maiúsculas): aqui vale a pena
// dizer "esse código não existe" em vez de deixar o motor responder.
function looksLikeCodeStrongly(text: string): boolean {
  const t = text.trim();
  return /\d/.test(t) && (/-/.test(t) || t === t.toUpperCase());
}

async function sendPromoReply(
  adapter: ChannelAdapter,
  supabaseAdmin: any,
  inbound: NormalizedInbound,
  userId: string,
  text: string,
  options?: string[],
): Promise<void> {
  const { encodeInteractiveId } = await import("@/lib/assessor/interactive");
  let send: AdapterSendResult | null = null;
  if (options && adapter.sendInteractive) {
    try {
      const r = await adapter.sendInteractive(inbound.externalConversationId, {
        kind: "buttons",
        body: text,
        options: options.map((o) => ({ id: encodeInteractiveId(o.toLowerCase()), label: o })),
      });
      if (r.ok) send = r;
    } catch { /* cai para texto */ }
  }
  if (!send) send = await adapter.sendText(inbound.externalConversationId, text);
  await supabaseAdmin.from("assessor_messages").insert({
    user_id: userId,
    role: "assistant",
    content: text,
    message_type: "promo_redeem",
    channel: adapter.channel,
    status: send.ok ? "sent" : "failed",
    sender_phone: inbound.externalConversationId,
  } as never);
}

async function handlePromoRedeem(
  adapter: ChannelAdapter,
  supabaseAdmin: any,
  inbound: NormalizedInbound,
  userId: string,
  content: string,
): Promise<boolean> {
  return handlePromoRedeemImpl(adapter, supabaseAdmin, inbound, userId, content);
}

/**
 * Escolha de plano no fim do período experimental. Nunca há migração de
 * conta: o que muda são as capacidades, e a escolha só é aplicada no dia 14.
 */
async function handleTrialChoiceAnswer(
  adapter: ChannelAdapter,
  supabaseAdmin: any,
  inbound: NormalizedInbound,
  userId: string,
  content: string,
): Promise<boolean> {
  const text = content.trim();
  if (!text) return false;

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("trial_status, trial_choice, trial_choice_asked_at")
    .eq("id", userId)
    .maybeSingle();
  const p = prof as any;
  if (!p || p.trial_status !== "active" || p.trial_choice || !p.trial_choice_asked_at) return false;

  const { readTrialChoice, setTrialChoice, trialChoiceAck } = await import(
    "@/lib/subscription/trial.server"
  );
  const choice = readTrialChoice(text);
  if (!choice) return false;

  const saved = await setTrialChoice(supabaseAdmin, userId, choice);
  if (!saved.saved) return false;

  await sendPromoReply(adapter, supabaseAdmin, inbound, userId, trialChoiceAck(choice));
  return true;
}

async function handlePromoRedeemImpl(
  adapter: ChannelAdapter,
  supabaseAdmin: any,
  inbound: NormalizedInbound,
  userId: string,
  content: string,
): Promise<boolean> {
  const text = content.trim();
  if (!text) return false;
  const {
    checkPromoForUser, promoConfirmQuestion, stagePromoConfirmation,
    loadPendingPromo, cancelPendingPromo, applyPromoToUser, readConfirmation,
  } = await import("@/lib/admin/promo-existing.server");

  // 1) Já há um código à espera de confirmação?
  const pending = await loadPendingPromo(supabaseAdmin, userId, adapter.channel);
  if (pending) {
    const answer = readConfirmation(text);
    if (answer === "yes") {
      const r = await applyPromoToUser(supabaseAdmin, userId, pending);
      await sendPromoReply(adapter, supabaseAdmin, inbound, userId, r.reply);
      return true;
    }
    if (answer === "no") {
      await cancelPendingPromo(supabaseAdmin, pending.id);
      await sendPromoReply(adapter, supabaseAdmin, inbound, userId, "Sem problema — o código fica por aplicar.");
      return true;
    }
    // Outra coisa qualquer: liberta o pedido e segue para o motor.
    await cancelPendingPromo(supabaseAdmin, pending.id);
    return false;
  }

  // 2) Texto novo com cara de código.
  const { looksLikePromoCode } = await import("@/lib/admin/promo.server");
  if (!looksLikePromoCode(text) || !looksLikeCodeShape(text)) return false;

  const check = await checkPromoForUser(supabaseAdmin, text, userId);
  if (!check.ok) {
    // Palavra solta sem cara de código: deixa o motor responder normalmente.
    if (check.reason === "not_found" && !looksLikeCodeStrongly(text)) return false;
    await sendPromoReply(adapter, supabaseAdmin, inbound, userId, check.reply);
    return true;
  }

  await stagePromoConfirmation(supabaseAdmin, {
    userId, channel: adapter.channel, codeId: check.codeId, code: check.code, tier: check.tier,
  });
  await sendPromoReply(
    adapter, supabaseAdmin, inbound, userId, promoConfirmQuestion(check.tier), ["Sim", "Não"],
  );
  return true;
}
