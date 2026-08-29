// Reasoning Engine v3 — orquestrador central (OBSERVE → THINK → SEARCH → DECIDE → ACT).

import type { EngineInput, EngineOutcome } from "../engine.server";
import { observe } from "./observe.server";
import { think } from "./think.server";
import { search } from "./search.server";
import { decide } from "./decide.server";
import { executeToolCalls, applyMemoryWrites } from "./act.server";
import { isolateUnrelatedPending, stripInheritedMotive } from "../context-isolation";
import { sanitizeReply, NATURAL_FALLBACKS } from "../culture/sanitize";
import { looksLikeCorrection } from "./corrections.server";
import { sanitizeAssessorName, ASSESSOR_NAME_DEFAULT } from "../assessor-name";
import { blockedChannelReason } from "../channel-guard";
import type { DomainContext } from "../v2/domain.server";
import { findActivePendingAction, createPendingAction } from "../memory.server";
export { personChoiceIsNone } from "./pending-resolvers/agenda-person.server";
import { confirmEventPropertyPending } from "./pending-resolvers/agenda-property.server";

import { isQueryTool } from "./query-results";
import { detectReadRequest, READ_FAILED_REPLY } from "./read-intent";
import type { OnboardingState } from "./onboarding";
import { logSparringSuppression } from "./sparring-audit.server";
import { assertNoSparringLeak } from "./sparring-assert.server";
import { runEngineTail } from "./engine-tail.server";
import { runDeterministicRouter } from "./deterministic-router.server";
import { HISTORY_LIMIT, nowLisbonHuman, nowLisbonYmd, toHistoryPreview } from "./engine-shared";
import { shapeExecutionOutcome, shapeAgendaAsks, shapePersonAsk, shapeToolReplies } from "./post-act-reply.server";
// Blocos extraídos no Lote 8 — o motor apenas os orquestra por ordem.
import { runCompletionPass } from "./completion-pass.server";
import { runTurnOpeners } from "./turn-openers.server";
import { runScriptOfferPending, runRecurrenceAndCancelChoice } from "./pre-pending.server";
import { resolveStalePending } from "./stale-pending.server";
import { resolveBareConfirmation } from "./bare-confirmation.server";


import type { PendingResolver } from "./pending-resolvers/types";
import {
  suggestFileLinkPending,
  keepPhotoPending,
  bulkArchivePending,
} from "./pending-resolvers/drive-files.server";
import {
  collectingFeedbackPending,
  clarifyFeedbackTargetPending,
  recordProductFeedbackPending,
} from "./pending-resolvers/feedback.server";
import { financeCommissionShortcut } from "./pending-resolvers/finance-commission.server";
import {
  confirmEventPersonPending,
  rejectEventPersonPending,
  confirmEventReschedulePending,
} from "./pending-resolvers/agenda-person.server";
import {
  createProspectingLeadPending,
  createPersonEllipticPending,
  createDealPending,
} from "./pending-resolvers/create-entities.server";
import {
  AUDIO_PENDING_RESOLVERS,
  resolveAudioMediaSlot,
} from "./pending-resolvers/audio.server";
import { runSparringGuard } from "./sparring-runner.server";
import { isScheduleClarification, clarificationHoldReply } from "@/lib/agenda/reschedule-intent";

// Tabela de despacho por intent. A ORDEM é comportamento: replica
// exactamente a cascata de `if` que existia no motor.
const INTENT_PENDING_RESOLVERS: PendingResolver[] = [
  confirmEventPersonPending,
  rejectEventPersonPending,
  confirmEventReschedulePending,
  confirmEventPropertyPending,
  createProspectingLeadPending,
  createPersonEllipticPending,
  createDealPending,
];

// Pendentes de baixo acoplamento (Drive, feedback) + atalho de comissão.
// A ORDEM desta lista é comportamento: mantém-se a mesma do código inline.
const LOW_COUPLING_PENDING_RESOLVERS: PendingResolver[] = [
  suggestFileLinkPending,
  keepPhotoPending,
  bulkArchivePending,
  collectingFeedbackPending,
  clarifyFeedbackTargetPending,
  recordProductFeedbackPending,
  financeCommissionShortcut,
];


// Os auxiliares de data/histórico vivem em `engine-shared.ts`.


/**
 * Reformular a MESMA pergunta não pode encurtar a janela de confirmação.
 *
 * Caso real (13/08): às 21:45 o Afonso pergunta se apaga os 9 áudios; às
 * 21:50, depois de "E documentos?", repete a pergunta por outras palavras. O
 * rascunho continuou a guardar o texto antigo, por isso a última pergunta do
 * assessor "não era" a do pendente e a janela caiu dos 24h para 3 minutos —
 * o "Sim" aos 23 minutos apanhou "já caducou".
 *
 * Solução: existe UM único relógio (o rascunho em pending_actions) e ele é
 * re-sincronizado sempre que o Afonso volta a perguntar. A pergunta relevante
 * mais recente passa a ser, de facto, a que conta para as 24h.
 */
async function syncPendingQuestion(
  supabase: any,
  userId: string,
  channel: string,
  reply: string,
): Promise<void> {
  const text = String(reply ?? "").trim();
  if (!text.includes("?")) return;
  const pending = await findActivePendingAction(supabase, userId, channel);
  const { shouldRefreshPendingQuestion } = await import("../pending-answerable");
  if (!shouldRefreshPendingQuestion(pending, text)) return;
  await supabase
    .from("pending_actions")
    .update({ current_question: text.slice(0, 2000), updated_at: new Date().toISOString() } as never)
    .eq("id", pending!.id);
}

// O turno de treino (sparring) vive em `sparring-runner.server.ts`.



export async function runReasoningEngine(
  input: EngineInput,
  opts?: { skipCompletionPass?: boolean },
): Promise<EngineOutcome> {
  const out = await runReasoningEngineInner(input, opts);
  try {
    if (input.userId) {
      await syncPendingQuestion(input.supabase, input.userId, input.channel, out.reply);
    }
  } catch { /* noop */ }
  return out;
}

async function runReasoningEngineInner(
  input: EngineInput,
  opts?: { skipCompletionPass?: boolean },
): Promise<EngineOutcome> {
  const started = Date.now();
  const { supabase, userId, channel, content, sourceMessageId } = input;
  if (!userId) return { reply: NATURAL_FALLBACKS.unassociated };
  // Isolamento de testes — ver `channel-guard.ts`. Repetido aqui porque o
  // motor v3 também é invocado directamente (scripts, testes, fast-paths).
  if (blockedChannelReason(channel)) return { reply: NATURAL_FALLBACKS.didNotUnderstand };
  const trimmed = content.trim();
  if (!trimmed) return { reply: NATURAL_FALLBACKS.didNotUnderstand };

  // Duas datas distintas na MESMA instrução ("dia 13 às 15 e depois tenho dia
  // 7 de setembro às 10") são dois compromissos, não um reagendamento.
  const { allowsSameTurnSiblings } = await import("./multi-date-turn");
  const ctx: DomainContext = {
    supabase, userId, channel,
    sourceMessageId: sourceMessageId ?? null,
    sameTurnSeparateDates: allowsSameTurnSiblings(trimmed),
  };

  // ── Modo treino (sparring) — PRIMEIRO GUARD DO TURNO ──
  //
  // Tem de ser lido antes de qualquer atalho determinístico (conclusões,
  // agenda, Drive) e antes do DECIDE/ACT: foi por os atalhos correrem antes
  // deste ponto que uma pesquisa real de imóveis disparou a partir de fala em
  // personagem. Em treino, o turno inteiro é tratado aqui e nada toca na base
  // de dados.
  {
    const sparred = await runSparringGuard({ supabase, userId, channel, trimmed });
    if (sparred) return sparred;
  }




  // ── Instruções de conclusão ("o estudo de mercado já está tratado") ──
  // Extraído para `completion-pass.server.ts` (Lote 8) — mesma ordem.
  if (!opts?.skipCompletionPass) {
    const completed = await runCompletionPass({
      ctx, supabase, userId, channel, trimmed,
      rerun: (content: string) => runReasoningEngine({ ...input, content }, { skipCompletionPass: true }),
    });
    if (completed) return completed;
  }


  const [{ data: prof }, { data: recentRows }] = await Promise.all([
    supabase.from("profiles").select("name, assessor_name").eq("id", userId).maybeSingle(),
    supabase
      .from("assessor_messages")
      .select("role, content, created_at, id")
      .eq("user_id", userId).eq("channel", channel)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
  ]);
  const assessorName = sanitizeAssessorName((prof as any)?.assessor_name ?? "") || ASSESSOR_NAME_DEFAULT;
  const userFirstName = String((prof as any)?.name ?? "").split(/\s+/)[0] || "";
  const historyPreview = toHistoryPreview((recentRows as any[]) ?? []);

  // Heurística de contexto conversacional aberto: se a última mensagem do
  // Assessor terminou em "?" e foi há menos de 10 minutos, uma resposta
  // curta ("sim", "ok") DEVE ser tratada como continuação da pergunta e
  // NUNCA como confirmação órfã. Sem isto, o Assessor responderia
  // "Claro. A que te referes?" mesmo quando acabou de perguntar algo.
  const lastAssistant0 = ((recentRows as any[]) ?? []).find((r) => r?.role === "assistant");
  const lastAssistantContent0 = String(lastAssistant0?.content ?? "").trim();
  const lastAssistantAt0 = lastAssistant0?.created_at ? new Date(lastAssistant0.created_at) : null;
  const lastAssistantAskedQuestion =
    /\?\s*$/.test(lastAssistantContent0) &&
    !!lastAssistantAt0 &&
    (Date.now() - lastAssistantAt0.getTime()) < 10 * 60_000;

  // ── Aberturas do turno: nudge documental → perfil por gotas → arranque
  // leve. Extraído para `turn-openers.server.ts` (Lote 8) — mesma ordem.
  const openers = await runTurnOpeners({
    supabase, userId, channel, trimmed, assessorName,
    lastAssistantContent0, lastAssistantAskedQuestion,
  });
  if (openers.kind === "reply") return openers.outcome;
  const onboarding: OnboardingState = openers.onboarding;


  // Contexto acumulado para a rede de segurança: guardar só "09:30" perde
  // o pedido real ("bloco de agenda amanhã para chamadas à rede").
  let pendingForArchive: { original_content?: string | null; intent?: string | null } | null = null;

  // Guião de abordagem a uma placa de particular: só responde a uma escolha
  // explícita ("chamada"/"mensagem"), para não roubar o "sim" ao lembrete.
  {
    const scripted = await runScriptOfferPending({ supabase, userId, channel, trimmed });
    if (scripted) return scripted;
  }

  // Recorrência + escolha de qual (ou quais) compromisso desmarcar.
  // Extraído para `pre-pending.server.ts` (Lote 8) — mesma ordem.
  {
    const chosen = await runRecurrenceAndCancelChoice({
      ctx, supabase, userId, channel, trimmed,
      sourceMessageId: sourceMessageId ?? null,
    });
    if (chosen) return chosen;
  }


  // Fast-path prospeção — se existe uma proposta pendente de placa e o
  // consultor confirma/cancela, resolvemos sem passar por THINK/DECIDE.
  // Garante que o "Feito" só sai depois da persistência real.
  try {
    let pending = await findActivePendingAction(supabase, userId, channel);

    // Ranhura "media": a pergunta lateral "guardo o ficheiro ou descarto?".
    // Só é resolvida quando não há outro assunto principal em aberto, para
    // um "não" nunca cair no rascunho errado.
    if (!pending) {
      const media = await resolveAudioMediaSlot({ supabase, userId, channel, trimmed });
      if (media) return media;
    }


    // Higiene do rascunho vivo (pendente caducado → reabertura de
    // confirmação velha → "só registar"). Extraído para
    // `stale-pending.server.ts` (Lote 8) — mesma ordem.
    {
      const stale = await resolveStalePending({
        ctx, supabase, userId, channel, trimmed, pending,
        lastAssistantContent0, lastAssistantAskedQuestion,
        quotedText: input.quotedText ?? null,
      });
      if (stale.kind === "reply") return stale.outcome;
      pending = stale.pending;
    }


    pendingForArchive = pending ?? null;
    // Escolha de contacto: o consultor escolheu (por botão no painel ou por
    // texto no canal). A associação é determinística e é sempre confirmada
    // por palavras — nunca fica implícita.
    // ---------- Tabela de despacho por intent (ordem = precedência) ----------
    // A ordem desta lista replica exactamente a ordem dos `if` que existia
    // aqui: escolha de contacto → rejeição de contacto → duplicado/
    // reagendamento → placa → pessoa elíptica → negócio. Cada entrada devolve
    // `null` quando não trata o turno, tal como o `if` caía para o seguinte.
    {
      const pc = { ctx, supabase, userId, channel, trimmed, pending };
      for (const resolver of INTENT_PENDING_RESOLVERS) {
        const handled = await resolver(pc);
        if (handled) return handled;
      }
    }


    // ---------- Áudio (breakdown + temas) ----------
    // Mesma precedência de sempre: proposta por itens → proposta por temas.
    {
      const pc = { ctx, supabase, userId, channel, trimmed, pending };
      for (const resolver of AUDIO_PENDING_RESOLVERS) {
        const handled = await resolver(pc);
        if (handled) return handled;
      }
    }


    // ---------- Pendentes de baixo acoplamento + atalho de comissão ----------
    // Mesma ordem de sempre: Drive (ligação, foto, lote) → feedback → comissão.
    {
      const pc = { ctx, supabase, userId, channel, trimmed, pending };
      for (const resolver of LOW_COUPLING_PENDING_RESOLVERS) {
        const handled = await resolver(pc);
        if (handled) return handled;
      }
    }


    // ---------- Router determinístico ----------
    // Ordem = precedência. Cada caso vive em deterministic-router.server.ts.
    {
      const routed = await runDeterministicRouter({ ctx, supabase, userId, channel, trimmed, pending });
      if (routed) return routed;
    }

    // (b) Confirmação curta sem contexto pendente → pede referência.
    // Extraído para `bare-confirmation.server.ts` (Lote 8).
    {
      const bare = await resolveBareConfirmation({
        supabase, userId, channel, trimmed, pending,
        lastAssistantContent0, lastAssistantAt0, lastAssistantAskedQuestion,
        sourceMessageId: sourceMessageId ?? null,
      });
      if (bare) return bare;
    }

  } catch { /* noop — cai no fluxo normal */ }

  // Detecção de correção precoce — antes de gastar OBSERVE/THINK/DECIDE.
  const lastAssistantRow = ((recentRows as any[]) ?? []).find((r) => r?.role === "assistant");
  const lastAssistantAt: Date | null = lastAssistantRow?.created_at ? new Date(lastAssistantRow.created_at) : null;
  const lastAssistantReply: string = String(lastAssistantRow?.content ?? "");
  const isCorrection = looksLikeCorrection(trimmed, lastAssistantAt);

  // 1) OBSERVE
  const observations = observe(trimmed);

  // 2) THINK
  const thinkR = await think({ content: trimmed, observations, historyPreview });

  // 3) SEARCH — inclui sempre state + pending_action.
  const recommended = Array.from(new Set([
    ...thinkR.output.recommended_searches,
    "conversation_state" as const,
    "pending_action" as const,
  ]));
  const searchesRaw = await search(ctx, observations, recommended);
  // Contaminação de contexto: um pendente sobre outra entidade não pode
  // sequer chegar ao DECIDE, senão o "porquê" dele escorrega para o registo
  // novo (caso real: "Contacta o Nuno Castilho" a herdar "pedir a caderneta").
  const isolation = isolateUnrelatedPending(searchesRaw as any, trimmed);
  const searches = isolation.searches as typeof searchesRaw;

  // Modo Sparring — assert defensivo, NÃO uma 2ª máquina de estados.
  // A decisão de treino já foi tomada no arranque do turno (readSparringState
  // + resolveSparringTurn), que devolve sem chegar aqui. Se mesmo assim o
  // estado de treino aparecer, é anomalia: regista-se e continua a suprimir.
  const convState = (searches as any).conversation_state ?? null;
  const sparringActive = await assertNoSparringLeak({
    conversationState: convState,
    userId, channel, message: trimmed,
  });


  // 4) DECIDE
  const decideR = await decide({
    content: trimmed,
    observations,
    hypotheses: thinkR.output.hypotheses,
    searches,
    historyPreview,
    assessorName,
    userFirstName,
    nowLisbonYmd: nowLisbonYmd(),
    nowLisbonHuman: nowLisbonHuman(),
    sparring: sparringActive,
    consultantGoals: onboarding.goals,
  });

  if (sparringActive) {
    // Auditoria antes de descartar: fica o que ia correr e a mensagem original.
    await logSparringSuppression({
      userId, channel, message: trimmed,
      toolCalls: decideR.decision.tool_calls,
      memoryWrites: decideR.decision.memory_writes?.length ?? 0,
      action: decideR.decision.action,
      reason: "sparring_leak",
      turns: 0, route: "v3",

    });
    decideR.decision.tool_calls = [];
    decideR.decision.memory_writes = [];
    if (decideR.decision.action === "act" || decideR.decision.action === "search_more") {
      decideR.decision.action = "acknowledge";
    }
  }

  // 5) ACT — só executa se DECIDE disse "act".
  // Pedido de leitura pura ("lista os contactos que tens meus"): nunca pode
  // entrar no caminho de escrita. Descartamos escritas e garantimos a
  // ferramenta de consulta correspondente.
  const readReq = detectReadRequest(trimmed);
  if (readReq.pure && !sparringActive) {
    decideR.decision.memory_writes = [];
    const reads = decideR.decision.tool_calls.filter((t) => isQueryTool(t.name));
    decideR.decision.tool_calls = reads.length
      ? reads
      : readReq.tool
        ? [{ name: readReq.tool, arguments: readReq.arguments }]
        : [];
    if (decideR.decision.tool_calls.length) decideR.decision.action = "act";
    else if (decideR.decision.action === "act") decideR.decision.action = "acknowledge";
  }
  // Esclarecimento de horas não é pedido de remarcação. "Um é às 10 e o outro
  // às 10:45" descreve o que já está marcado — travamos a escrita e devolvemos
  // a decisão ao consultor em vez de mexer na agenda por conta própria.
  let clarificationHold = false;
  if (
    !sparringActive &&
    decideR.decision.tool_calls.some((t) => t.name === "reschedule_reminder") &&
    isScheduleClarification(trimmed)
  ) {
    decideR.decision.tool_calls = decideR.decision.tool_calls.filter(
      (t) => t.name !== "reschedule_reminder",
    );
    clarificationHold = true;
    if (!decideR.decision.tool_calls.length && decideR.decision.action === "act") {
      decideR.decision.action = "acknowledge";
    }
  }
  const shouldAct = decideR.decision.action === "act" && decideR.decision.tool_calls.length > 0;
  // Guarda simétrica à do "executou e mesmo assim perguntou": decidiu agir mas
  // não indicou ferramenta nenhuma. Caso real: "Desmarca tudo." → action=act,
  // tool_calls=[], reply="Feito." e zero escritas na base de dados. Sem
  // ferramenta não houve acção — a resposta não pode afirmar conclusão.
  const actedWithoutTools =
    decideR.decision.action === "act" && decideR.decision.tool_calls.length === 0;
  if (isolation.isolated) {
    for (const tc of decideR.decision.tool_calls) {
      const a = tc.arguments as Record<string, unknown>;
      for (const field of ["title", "notes", "description", "summary", "message_preview"]) {
        if (typeof a?.[field] === "string") {
          a[field] = stripInheritedMotive(a[field] as string, {
            message: trimmed,
            pendingText: isolation.pendingText,
          });
        }
      }
    }
  }
  const toolResults = shouldAct ? await executeToolCalls(ctx, decideR.decision.tool_calls) : [];
  const allOk = toolResults.every((r) => r.ok);

  await applyMemoryWrites(ctx, decideR.decision.memory_writes);

  let reply = sanitizeReply(decideR.decision.natural_reply);
  if (isolation.isolated) {
    reply = stripInheritedMotive(reply, { message: trimmed, pendingText: isolation.pendingText });
  }
  // A IA esteve em baixo (créditos, rate limit, timeout, erro do provedor).
  // Isto NÃO é incompreensão: o consultor tem de perceber a diferença.
  const aiUnavailable = thinkR.unavailable === true || decideR.unavailable === true;

  // Pós-ACT (parte 1): resultado da execução e idempotência.
  const outcome = shapeExecutionOutcome({
    reply,
    toolResults: toolResults as any,
    shouldAct,
    allOk,
    actedWithoutTools,
    pureRead: readReq.pure,
    readFailedReply: READ_FAILED_REPLY,
  });
  reply = outcome.reply;
  let archiveOutcome: "executed_ok" | "tool_failed" | "not_understood" | "service_down" = outcome.archiveOutcome;
  let archiveReason: string | null = outcome.archiveReason;

  // Override natural para prospeção executada dentro do DECIDE (turno único).
  const leadTool = toolResults.find((t) => t.name === "create_prospecting_lead");

  // Pós-ACT (parte 2): perguntas de agenda (reagendamento, calendário).
  const agendaAsks = await shapeAgendaAsks({
    supabase, userId, channel,
    sourceMessageId: sourceMessageId ?? null,
    trimmed,
    reply,
    toolResults: toolResults as any,
  });
  reply = agendaAsks.reply;
  const rescheduleAsk = agendaAsks.rescheduleAsk;


  // Confirmação de contacto: caminho único para compromisso, seguimento e
  // proprietário — primeiro match ganha, nunca duas perguntas no mesmo turno.
  const personAskShape = await shapePersonAsk({
    supabase, userId, channel,
    sourceMessageId: sourceMessageId ?? null,
    trimmed,
    reply,
    toolResults: toolResults as any,
  });
  reply = personAskShape.reply;

  // Imóvel por confirmar: "provável" nunca liga em silêncio. A escrita fica
  // em espera até o consultor dizer qual é o imóvel (ou avançar sem ele).
  const propertyAskTool = toolResults.find(
    (t) => t.ok && (t.data as any)?.needsPropertyConfirmation === true,
  );
  if (propertyAskTool && !personAskShape.asked) {
    const d = propertyAskTool.data as any;
    const question = String(d.question ?? "De que imóvel se trata?");
    try {
      await createPendingAction(supabase, {
        userId, channel,
        intent: "confirm_event_property",
        originalContent: trimmed,
        payload: {
          propertyQuery: d.propertyQuery ?? null,
          mode: d.mode ?? null,
          suggestions: d.suggestions ?? [],
          candidate_ids: d.candidateIds ?? [],
          tool: d.tool ?? propertyAskTool.name,
          incoming: d.incoming,
        },
        currentQuestion: question,
        pendingQuestion: question,
        sourceMessageId: sourceMessageId ?? null,
      });
    } catch { /* noop */ }
    reply = question;
  }

  // Pós-ACT (parte 3): prospeção, desmarcação, conclusão e financeiro.
  const shaped = await shapeToolReplies({
    ctx, supabase, userId, channel, trimmed,
    reply,
    toolResults: toolResults as any,
    leadTool: leadTool as any,
    convState,
    decideR,
  });
  reply = shaped.reply;
  const cancelTool = shaped.cancelTool;

  // Cauda do turno (finalização, rede de segurança, métricas, ofertas):
  // extraída para engine-tail.server.ts sem alteração de ordem nem de lógica.
  return await runEngineTail({
    ctx,
    supabase,
    userId,
    channel,
    sourceMessageId: sourceMessageId ?? null,
    trimmed,
    reply,
    toolResults: toolResults as any,
    cancelTool,
    leadTool: leadTool as any,
    decideR,
    thinkR,
    observations,
    searches,
    historyPreview,
    recentRows: (recentRows as any[]) ?? [],
    lastAssistantReply,
    isCorrection,
    shouldAct,
    allOk,
    rescheduleAsk: !!rescheduleAsk,
    aiUnavailable,
    archiveOutcome,
    archiveReason,
    pendingForArchive: pendingForArchive as any,
    sparringActive,
    started,
    onboarding,
    assessorName,
    userFirstName,
    nowLisbonYmd: nowLisbonYmd(),
    nowLisbonHuman: nowLisbonHuman(),
  });
}
