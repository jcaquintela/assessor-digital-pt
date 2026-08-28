// Router determinístico do motor v3.
//
// Saídas rápidas: casos em que o Afonso responde sem passar pela IA, porque a
// deteção é determinística e a resposta vem directamente dos dados.
//
// REGRA DE OURO: a ORDEM desta lista é comportamento. Cada caso tem
// precedência sobre os seguintes ("o que tenho sobre a Marta" é ficha de
// pessoa, não agenda). Mover um caso muda respostas reais — só com testes.

import type { DomainContext } from "../v2/domain.server";
import { TOOL_REGISTRY } from "../v2/domain.server";
import { logAiTurn } from "./telemetry-repo.server";
import { applySafetyNet } from "./safety-net.server";
import { NATURAL_FALLBACKS } from "../culture/sanitize";
import { formatQueryResults } from "./query-results";
import { detectContactReadQuery, detectReadRequest, READ_FAILED_REPLY } from "./read-intent";
import { resolveEllipticRead } from "./elliptic-read";
import { readLastRead, recordLastRead } from "./last-read.server";
import {
  detectAgendaQuery,
  detectMiscQuery,
  detectDayStateQuery,
  composeDayStateReply,
  formatAgendaReply,
  detectAgendaDateQuery,
  formatAgendaDateReply,
  detectEventNameQuery,
  rankEventsByTitle,
  formatEventFoundReply,
  type AgendaItem,
} from "./deterministic.server";
import {
  detectPersonBriefQuery,
  formatPersonBrief,
  personNotFoundReply,
  ambiguousPersonReply,
} from "./person-brief";
import { buildPersonBrief } from "./person-brief.server";
import { detectWhatsNewQuery, formatWhatsNewReply, noRecentUpdatesReply, NO_UPDATES_REPLY } from "./whats-new";
import { lastProductUpdate, listRecentProductUpdates } from "./whats-new.server";
import { detectEllipticEntity, ellipticConfirmQuestion } from "./elliptic";
import {
  detectFeedbackTarget,
  feedbackConfirmQuestion,
  feedbackClarifyQuestion,
  detectFeedbackAnnouncement,
  feedbackAskBody,
} from "./feedback";

export interface RouterCtx {
  ctx: DomainContext;
  supabase: any;
  userId: string;
  channel: string;
  trimmed: string;
  pending: any | null;
}

export type RouterReply = { reply: string } | null;
export type RouterCase = (rc: RouterCtx) => Promise<RouterReply>;

// (0-) Frase elíptica sem verbo: "[intenção] à [entidade] [nome] [contacto]".
// Quando a pessoa ainda não existe, isto falhava com "não percebi". Agora
// propõe criação assistida — nunca cria sem confirmação.
const ellipticEntityCase: RouterCase = async ({ supabase, userId, channel, trimmed, pending }) => {
  if (pending) return null;
  const elliptic = detectEllipticEntity(trimmed);
  if (!elliptic) return null;
  let alreadyKnown = false;
  try {
    if (elliptic.phone) {
      const { data: byPhone } = await supabase
        .from("people").select("id")
        .eq("user_id", userId).ilike("phone", `%${elliptic.phone.slice(-9)}%`)
        .limit(1).maybeSingle();
      if (byPhone) alreadyKnown = true;
    }
    if (!alreadyKnown) {
      const { data: byName } = await supabase
        .from("people").select("id")
        .eq("user_id", userId).ilike("name", `%${elliptic.name}%`)
        .limit(1).maybeSingle();
      if (byName) alreadyKnown = true;
    }
  } catch { /* em dúvida, segue o caminho normal */ }

  if (alreadyKnown) return null;
  const question = ellipticConfirmQuestion(elliptic);
  const { createPendingAction } = await import("../memory.server");
  await createPendingAction(supabase, {
    userId,
    channel,
    intent: "create_person_elliptic",
    originalContent: trimmed,
    payload: {
      name: elliptic.name,
      phone: elliptic.phone,
      with_follow_up: elliptic.withFollowUp,
      entity_word: elliptic.entityWord,
    },
    pendingQuestion: question,
    currentQuestion: question,
  });
  return { reply: question };
};

// (0) Resumo rápido de pessoa — leitura pura, sem confirmação e sem depender
// do nível de autonomia. Vem antes da agenda porque "o que tenho sobre a
// Marta" partilha o mesmo verbo. "Manda o contacto do Paulo Lopes" é leitura:
// mesma ficha de pessoa.
const personBriefCase: RouterCase = async ({ ctx, supabase, userId, channel, trimmed }) => {
  const briefName = detectPersonBriefQuery(trimmed) ?? detectContactReadQuery(trimmed);
  if (!briefName) return null;
  const t0 = Date.now();
  let reply: string;
  let okBrief = true;
  try {
    const lookup = await buildPersonBrief(ctx, briefName);
    reply =
      lookup.kind === "not_found"
        ? personNotFoundReply(briefName)
        : lookup.kind === "ambiguous"
          ? ambiguousPersonReply(lookup.names)
          : formatPersonBrief(lookup.brief);
  } catch (err) {
    okBrief = false;
    reply = NATURAL_FALLBACKS.aiDown;
    void err;
  }
  await recordLastRead(supabase, {
    userId, channel, tool: "search_people", arguments: { query: briefName },
  });
  await logAiTurn(supabase, {
    userId, channel, intent: "person_brief_fast_path", route: "v3-deterministic",
    latencyMs: Date.now() - t0, success: okBrief, error: okBrief ? null : "person_brief_failed",
    toolName: "person_brief", toolSuccess: okBrief, fallbackUsed: !okBrief,
  });
  return { reply };
};

// (a-0c) "Apaga os áudios todos" → lista os N ficheiros e pede confirmação
// explícita para ARQUIVAR (reversível). Nunca elimina por conversa.
const driveBulkArchiveCase: RouterCase = async ({ supabase, userId, channel, trimmed, pending }) => {
  if (pending) return null;
  const { detectDriveFileRequest } = await import("@/lib/drive/bulk-archive");
  const bulkReq = detectDriveFileRequest(trimmed);
  if (!bulkReq) return null;
  const { proposeBulkArchive } = await import("@/lib/drive/bulk-archive.server");
  const reply = await proposeBulkArchive(supabase, {
    userId,
    channel,
    req: bulkReq,
    mode: bulkReq.mode,
    originalContent: trimmed,
  });
  return { reply };
};

// (a-0) Erro ou sugestão sobre o próprio produto → pede confirmação.
const feedbackTargetCase: RouterCase = async ({ supabase, userId, channel, trimmed, pending }) => {
  const feedbackHit = !pending ? detectFeedbackTarget(trimmed) : null;
  if (!feedbackHit) return null;
  const kind = feedbackHit.kind;
  const { createPendingAction } = await import("../memory.server");
  // Ambíguo (produto vs. proprietário/cliente) → clarifica primeiro.
  if (feedbackHit.target === "ambiguous") {
    const question = feedbackClarifyQuestion(kind);
    await createPendingAction(supabase, {
      userId,
      channel,
      intent: "clarify_feedback_target",
      originalContent: trimmed,
      payload: { kind, original: trimmed },
      pendingQuestion: question,
      currentQuestion: question,
    });
    return { reply: question };
  }
  await createPendingAction(supabase, {
    userId,
    channel,
    intent: "record_product_feedback",
    originalContent: trimmed,
    payload: { kind, original: trimmed },
    pendingQuestion: feedbackConfirmQuestion(kind),
    currentQuestion: feedbackConfirmQuestion(kind),
  });
  return { reply: feedbackConfirmQuestion(kind) };
};

// (a-0b) Abertura de feedback sem corpo ("posso dar uma sugestão?").
// Abre um pending a aguardar o conteúdo em vez de cair em conversa solta.
const feedbackAnnouncementCase: RouterCase = async ({ supabase, userId, channel, trimmed, pending }) => {
  const announceKind = !pending ? detectFeedbackAnnouncement(trimmed) : null;
  if (!announceKind) return null;
  const { createPendingAction } = await import("../memory.server");
  const ask = feedbackAskBody(announceKind);
  await createPendingAction(supabase, {
    userId,
    channel,
    intent: "collecting_feedback",
    originalContent: trimmed,
    payload: { kind: announceKind },
    pendingQuestion: ask,
    currentQuestion: ask,
  });
  return { reply: ask };
};

// (a-1) "O que há de novo?" → novidades reais dos últimos 30 dias.
const whatsNewCase: RouterCase = async ({ ctx, supabase, userId, channel, trimmed }) => {
  if (!detectWhatsNewQuery(trimmed)) return null;
  const t0 = Date.now();
  let reply: string;
  let okNews = true;
  try {
    reply = formatWhatsNewReply(await listRecentProductUpdates(ctx));
    if (reply === NO_UPDATES_REPLY) {
      reply = noRecentUpdatesReply(await lastProductUpdate(ctx));
    }
  } catch {
    okNews = false;
    reply = NATURAL_FALLBACKS.aiDown;
  }
  await logAiTurn(supabase, {
    userId, channel, intent: "whats_new_fast_path", route: "v3-deterministic",
    latencyMs: Date.now() - t0, success: okNews, error: okNews ? null : "product_updates_failed",
    toolName: "product_updates", toolSuccess: okNews, fallbackUsed: !okNews,
  });
  return { reply };
};

// (a0) Consulta explícita a Diversos → nunca é agenda.
const miscQueryCase: RouterCase = async ({ supabase, userId, channel, trimmed }) => {
  if (!detectMiscQuery(trimmed)) return null;
  const t0 = Date.now();
  const { queryMisc } = await import("../engine.server");
  const reply = await queryMisc(supabase, userId, trimmed);
  await logAiTurn(supabase, {
    userId, channel, intent: "misc_query_fast_path", route: "v3-deterministic",
    latencyMs: Date.now() - t0, success: true, error: null,
    toolName: "query_miscellaneous", toolSuccess: true, fallbackUsed: false,
  });
  return { reply };
};

// (a-1) "Quando é a reunião X?" → procura o compromisso pelo nome em vez de
// devolver a agenda de hoje.
const eventNameCase: RouterCase = async ({ ctx, supabase, userId, channel, trimmed, pending }) => {
  const eventSubject = !pending ? detectEventNameQuery(trimmed) : null;
  if (!eventSubject) return null;
  const t0 = Date.now();
  let reply: string;
  let okEv = true;
  try {
    const { listOpenEvents } = await import("../v2/domain.server");
    const rows = await listOpenEvents(ctx);
    reply = formatEventFoundReply(eventSubject, rankEventsByTitle(eventSubject, rows) as AgendaItem[]);
  } catch {
    okEv = false;
    reply = READ_FAILED_REPLY;
  }
  await logAiTurn(supabase, {
    userId, channel, intent: "event_lookup_fast_path", route: "v3-deterministic",
    latencyMs: Date.now() - t0, success: okEv, error: okEv ? null : "event_lookup_failed",
    toolName: "search_agenda", toolSuccess: okEv, fallbackUsed: !okEv,
  });
  return { reply };
};

// (a-2) "Que compromissos tenho na terça-feira?" → dia nomeado.
const agendaDateCase: RouterCase = async ({ ctx, supabase, userId, channel, trimmed }) => {
  const agendaDate = detectAgendaDateQuery(trimmed);
  if (!agendaDate) return null;
  const t0 = Date.now();
  let reply: string;
  let okDay = true;
  try {
    const { searchAgendaOnDate } = await import("../v2/domain.server");
    const rows = await searchAgendaOnDate(ctx, agendaDate.date);
    reply = formatAgendaDateReply(agendaDate.label, rows as AgendaItem[]);
  } catch {
    okDay = false;
    reply = READ_FAILED_REPLY;
  }
  await logAiTurn(supabase, {
    userId, channel, intent: "agenda_date_fast_path", route: "v3-deterministic",
    latencyMs: Date.now() - t0, success: okDay, error: okDay ? null : "agenda_date_failed",
    toolName: "search_agenda", toolSuccess: okDay, fallbackUsed: !okDay,
  });
  return { reply };
};

// (a1) "Como está o meu dia?" / "Como estou hoje?" → estado do dia com dados
// reais (agenda + prioridades), a qualquer hora. Leitura pura: nunca pede
// confirmação nem cai em Diversos.
const dayStateCase: RouterCase = async ({ ctx, supabase, userId, channel, trimmed }) => {
  const agendaPeriod = detectAgendaQuery(trimmed);
  if (agendaPeriod || !detectDayStateQuery(trimmed)) return null;
  const t0 = Date.now();
  const r = await TOOL_REGISTRY.search_agenda(ctx, { period: "today" });
  const items: AgendaItem[] = ((r.data as any)?.items as AgendaItem[]) ?? [];
  let priorities: Array<{ action: string; entity_label: string | null }> = [];
  try {
    const { computePriorities } = await import("../supreme/priorities.server");
    priorities = (await computePriorities(supabase, userId, { limit: 3 })) as never;
  } catch { /* agenda sozinha já responde */ }
  const reply = composeDayStateReply(items, priorities);
  await logAiTurn(supabase, {
    userId, channel, intent: "day_state_fast_path", route: "v3-deterministic",
    latencyMs: Date.now() - t0, success: !!r.ok, error: r.ok ? null : (r.error ?? null),
    toolName: "search_agenda", toolSuccess: !!r.ok, fallbackUsed: false,
  });
  return { reply };
};

// (a) Consulta de agenda → chama search_agenda directamente.
const agendaPeriodCase: RouterCase = async ({ ctx, supabase, userId, channel, trimmed }) => {
  const agendaPeriod = detectAgendaQuery(trimmed);
  if (!agendaPeriod) return null;
  const t0 = Date.now();
  const r = await TOOL_REGISTRY.search_agenda(ctx, { period: agendaPeriod });
  const items: AgendaItem[] = ((r.data as any)?.items as AgendaItem[]) ?? [];
  const reply = formatAgendaReply(agendaPeriod, items);
  await recordLastRead(supabase, {
    userId, channel, tool: "search_agenda", arguments: { period: agendaPeriod },
  });
  await logAiTurn(supabase, {
    userId, channel, intent: "agenda_query_fast_path", route: "v3-deterministic",
    latencyMs: Date.now() - t0, success: !!r.ok, error: r.ok ? null : (r.error ?? null),
    toolName: "search_agenda", toolSuccess: !!r.ok, fallbackUsed: false,
  });
  return { reply };
};

// (a1b) Rascunho de email à espera de autorização. Determinístico: só este
// caminho envia, e só com frase inequívoca. "sim"/"ok" pedem reformulação;
// "envia mas muda X" itera em vez de enviar.
const emailDraftConfirmationCase: RouterCase = async ({ userId, channel, trimmed }) => {
  const { handleDraftConfirmation } = await import("@/lib/email/reply-draft.server");
  const draftTurn = await handleDraftConfirmation({ userId, channel, text: trimmed });
  return draftTurn ? { reply: draftTurn.reply } : null;
};

// (a1c) Faltava o endereço de email de um contacto e ele acabou de o dar.
// Determinístico: grava na ficha e retoma o mesmo email, sem LLM.
const awaitingEmailAddressCase: RouterCase = async ({ userId, channel, trimmed }) => {
  const { handleAwaitingEmailAddress } = await import("@/lib/email/outbound-draft.server");
  const addrTurn = await handleAwaitingEmailAddress({ userId, channel, text: trimmed });
  return addrTurn ? { reply: addrTurn.reply } : null;
};

// (a2) Elipse de leitura ("E documentos?", "E para a próxima semana?").
// Resolve pelo TÓPICO da última leitura guardado na memória de conversa — já
// não depende de casar palavras no texto da resposta anterior.
const ellipticReadCase: RouterCase = async ({ ctx, supabase, userId, channel, trimmed, pending }) => {
  if (pending) return null;
  const lastRead = await readLastRead(supabase, { userId, channel });
  const elliptic = resolveEllipticRead(trimmed, lastRead);
  if (!elliptic) return null;
  const t0 = Date.now();
  const r = await (TOOL_REGISTRY as any)[elliptic.tool](ctx, elliptic.arguments);
  const reply =
    elliptic.tool === "search_agenda" && r.ok
      ? formatAgendaReply(
          (elliptic.arguments as any).period ?? "today",
          (((r.data as any)?.items as AgendaItem[]) ?? []),
        )
      : r.ok
        ? (formatQueryResults([{ name: elliptic.tool, ok: true, data: r.data } as any]) ?? READ_FAILED_REPLY)
        : READ_FAILED_REPLY;
  await recordLastRead(supabase, {
    userId, channel, tool: elliptic.tool, arguments: elliptic.arguments,
  });
  await logAiTurn(supabase, {
    userId, channel, intent: "elliptic_read_fast_path", route: "v3-deterministic",
    latencyMs: Date.now() - t0, success: !!r.ok, error: r.ok ? null : (r.error ?? null),
    toolName: elliptic.tool, toolSuccess: !!r.ok, fallbackUsed: false,
  });
  return { reply };
};

// (a2b) Consulta ao Drive Inteligente ("Lista os documentos da Drive") → lê e
// responde já, sem depender da IA.
const driveReadCase: RouterCase = async ({ ctx, supabase, userId, channel, trimmed, pending }) => {
  const driveRead = detectReadRequest(trimmed);
  if (pending || !driveRead.pure || driveRead.tool !== "search_files") return null;
  const t0 = Date.now();
  const args = driveRead.arguments;
  const r = await TOOL_REGISTRY.search_files(ctx, args);
  const reply = r.ok
    ? (formatQueryResults([{ name: "search_files", ok: true, data: r.data } as any]) ?? READ_FAILED_REPLY)
    : READ_FAILED_REPLY;
  await recordLastRead(supabase, { userId, channel, tool: "search_files", arguments: args });
  await logAiTurn(supabase, {
    userId, channel, intent: "drive_query_fast_path", route: "v3-deterministic",
    latencyMs: Date.now() - t0, success: !!r.ok, error: r.ok ? null : (r.error ?? null),
    toolName: "search_files", toolSuccess: !!r.ok, fallbackUsed: false,
  });
  return { reply };
};

// (a3) Resposta à pergunta em aberto do Afonso ("A que te referes?" → "Casa
// Final B"). Resolvida pelos caminhos de pesquisa que já existem.
const openQuestionCase: RouterCase = async ({ ctx, supabase, userId, channel, trimmed, pending }) => {
  if (pending) return null;
  const { answerOpenQuestion } = await import("./open-question.server");
  const answered = await answerOpenQuestion(supabase, {
    userId, channel, text: trimmed,
    lookup: (tool, toolArgs) => (TOOL_REGISTRY as any)[tool](ctx, toolArgs as any),
  });
  if (!answered) return null;
  await logAiTurn(supabase, {
    userId, channel, intent: "open_question_answer", route: "v3-deterministic",
    latencyMs: 0, success: true, error: null,
    toolName: answered.tool, toolSuccess: true, fallbackUsed: false,
  });
  return { reply: answered.reply };
};

// A ordem é a precedência real do motor. Não reordenar sem testes.
export const DETERMINISTIC_ROUTER: Array<{ name: string; run: RouterCase }> = [
  { name: "elliptic_entity", run: ellipticEntityCase },
  { name: "person_brief", run: personBriefCase },
  { name: "drive_bulk_archive", run: driveBulkArchiveCase },
  { name: "feedback_target", run: feedbackTargetCase },
  { name: "feedback_announcement", run: feedbackAnnouncementCase },
  { name: "whats_new", run: whatsNewCase },
  { name: "misc_query", run: miscQueryCase },
  { name: "event_name", run: eventNameCase },
  { name: "agenda_date", run: agendaDateCase },
  { name: "day_state", run: dayStateCase },
  { name: "agenda_period", run: agendaPeriodCase },
  { name: "email_draft_confirmation", run: emailDraftConfirmationCase },
  { name: "awaiting_email_address", run: awaitingEmailAddressCase },
  { name: "elliptic_read", run: ellipticReadCase },
  { name: "drive_read", run: driveReadCase },
  { name: "open_question", run: openQuestionCase },
];

export async function runDeterministicRouter(rc: RouterCtx): Promise<RouterReply> {
  for (const c of DETERMINISTIC_ROUTER) {
    const out = await c.run(rc);
    if (out) return out;
  }
  return null;
}

// Rede de segurança do caso financeiro fica no motor; exposto aqui só para
// testes caso a caso.
export const ROUTER_CASES = {
  ellipticEntityCase,
  personBriefCase,
  driveBulkArchiveCase,
  feedbackTargetCase,
  feedbackAnnouncementCase,
  whatsNewCase,
  miscQueryCase,
  eventNameCase,
  agendaDateCase,
  dayStateCase,
  agendaPeriodCase,
  emailDraftConfirmationCase,
  awaitingEmailAddressCase,
  ellipticReadCase,
  driveReadCase,
  openQuestionCase,
};

void applySafetyNet;
