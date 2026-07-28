// Motor central do Assessor — independente do canal.
// Usa a OpenAI Responses API para interpretar linguagem natural PT-PT e
// devolve uma resposta que o adaptador de canal (WhatsApp, web, Telegram)
// deve enviar. Regista rascunhos em assessor_messages e só cria entidades
// reais após confirmação explícita do utilizador.

import { callAssessorAi, type AiInterpretation, type AiContextMessage } from "./ai.server";
import {
  interpretAssessorMessage,
  ROUTER_MIN_CONFIDENCE,
  type RouterDecision,
} from "./router.server";
import { sanitizeAssessorName, stripAssessorVocative, ASSESSOR_NAME_DEFAULT } from "./assessor-name";
import { resolveDateTimeFromText, hasExplicitDateTime } from "./date-resolver";
import {
  detectPropertyContext,
  extractPropertyFields,
  buildPropertyTitle,
  findMatchingProperties,
  createPropertyFromFields,
  updatePropertyPatch,
  guessDocumentType,
  NEW_PROPERTY_RE,
  PROPERTY_REFERENT_RE,
  type PropertyFields,
} from "./properties.server";
import {
  findActivePendingAction,
  findLastExecutedAction,
  createPendingAction,
  updatePendingActionPayload,
  markPendingActionStatus,
  upsertConversationState,
  summarizePendingAction,
  type PendingActionRow,
} from "./memory.server";
import { sanitizeReply as sanitizeReplyFromCulture, safeReply, NATURAL_FALLBACKS } from "./culture/sanitize";
import { assessorSourceColumns } from "./follow-ups-source";
import {
  detectAgendaPeriod,
  formatAgendaReply,
  buildDescriptiveTitle,
  type AgendaPeriod,
  type AgendaRow,
} from "./agenda";
import {
  CONFIRM_RE,
  CANCEL_RE,
  GREET_RE,
  THANKS_RE,
  MORE_RE,
  CORRECTION_RE,
  isConfirmation as saIsConfirmation,
  isRejection as saIsRejection,
  isGreeting as saIsGreeting,
  isThanks as saIsThanks,
  detectCorrection as saDetectCorrection,
} from "./culture/short-answers";

export interface EngineInput {
  supabase: any; // service-role client (admin)
  userId: string | null;
  channel: string; // 'whatsapp' | 'web' | 'telegram' | ...
  content: string;
  receivedAt?: Date;
  // ID da mensagem externa que originou este turno (ex.: WhatsApp wamid).
  // Persistido em `follow_ups.source_message_id` para auditoria.
  sourceMessageId?: string | null;
}

export interface EngineOutcome {
  reply: string;
  messageType?: string | null;
  structuredPayload?: Record<string, unknown> | null;
  status?: "draft" | "confirmed" | "cancelled" | null;
}

const REPLY_UNASSOCIATED = NATURAL_FALLBACKS.unassociated;
const REPLY_FALLBACK = NATURAL_FALLBACKS.didNotUnderstand;
const REPLY_AI_DOWN = NATURAL_FALLBACKS.aiDown;
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

// Cultura conversacional — regexes de confirmação/cancelamento/saudação/
// agradecimento/correção/"mais uma" vêm de `culture/short-answers.ts`.
// Mantidos como re-exports para preservar todos os call-sites e testes
// que possam importar estes símbolos.
//
// Perguntas sobre a área Diversos. Só dispara com referência EXPLÍCITA a
// Diversos, notas, ideias ou apontamentos. Nunca dispara apenas por
// "esta semana" / "hoje" — esses são períodos, não módulos.
const QUERY_MISC_RE =
  /\b(diversos|notas?|ideias?|apontamentos?|coisas?\s+que\s+registei|notas?\s+por\s+tratar)\b/i;

// Consulta explícita da agenda. "amanhã" isolado NÃO é uma consulta.
// Cobre "agendamentos/compromissos/agenda/marcado/reuniões/visitas/chamadas"
// e "o que tenho (hoje|amanhã|esta semana|na próxima semana|marcado)".
const QUERY_AGENDA_RE =
  /\b(agenda|agendamentos?|compromissos?|marca(?:d[oa]s?|ç[õoã]es?)|reuni(?:[ãa]o|[õo]es)|visitas?|chamadas?|o\s+que\s+tenho(?:\s+(?:hoje|amanh[ãa]|marcad[oa]|esta\s+semana|na\s+pr[óo]xima\s+semana|para\s+(?:hoje|amanh[ãa]|esta\s+semana|a\s+pr[óo]xima\s+semana)))?|que\s+(?:tenho|compromissos))\b/i;

// Verbos que indicam pedido de acção/lembrete sobre alguém ou algo — não
// devem ser interpretados como enriquecimento do imóvel activo.
const ACTION_VERB_RE =
  /\b(lembra(?:r|-me)?|lembrete|avisa(?:r|-me)?|marca(?:r)?|liga(?:r|-lhe)?|telefona(?:r|-lhe)?|contact(?:a|ar)|envia(?:r)?|escrev(?:e|er)|fala(?:r)?|manda(?:r)?|combinar)\b/i;

// Referência a "dono/proprietário do imóvel" — usar contexto do imóvel activo.
const OWNER_REF_RE = /\b(dono|dona|propriet[áa]ri[oa])\b/i;

function isConfirmText(t: string): boolean {
  return saIsConfirmation(t);
}
function isCancelText(t: string): boolean {
  return saIsRejection(t);
}
function isGreetOnly(t: string): boolean {
  return saIsGreeting(t);
}
function looksLikeCorrection(t: string): boolean {
  return saDetectCorrection(t);
}
function isThanks(t: string): boolean {
  return saIsThanks(t);
}

// Fechos sociais: reconhecidos SEM ação pendente para responder de forma
// natural sem cair no ramo de saudação nem reabrir ações antigas.
const SOCIAL_CLOSER_RE =
  /^\s*(ok(ay|ei)?|est[áa]\s+bem|perfeito|combinad[oa]|fixe|beleza|👍|✅)\s*[.!]?\s*$/i;
function isSocialCloser(t: string): boolean {
  return SOCIAL_CLOSER_RE.test(t);
}
// Devolve a resposta social apropriada, ou `null` se `t` não for um fecho social.
// Puro: nunca inventa saudação, nunca reabre ações antigas.
function pickCloserReply(t: string): string | null {
  if (!isSocialCloser(t)) return null;
  const s = t.toLowerCase();
  if (/combinad/.test(s)) return "Combinado.";
  if (/perfeito/.test(s)) return "Perfeito.";
  if (/est[áa]\s+bem/.test(s)) return "Está bem.";
  return "Perfeito.";
}

// Log estruturado de decisões do motor. Nunca inclui conteúdo do utilizador.
function logBranch(event: string, meta: Record<string, unknown> = {}) {
  try {
    // eslint-disable-next-line no-console
    console.log(`[assessor] ${event}`, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}
function isQueryMisc(t: string): boolean {
  return QUERY_MISC_RE.test(t);
}
function isExplicitAgendaQuery(t: string): boolean {
  return QUERY_AGENDA_RE.test(t);
}

function detectTipoEvento(texto: string): string {
  const t = texto.toLowerCase();
  if (/\bvisita(s)?\b/.test(t)) return "visita";
  if (/\breuni[ãa]o\b/.test(t)) return "reunião";
  if (/\balmo[çc]o\b/.test(t)) return "almoço";
  if (/\bjantar\b/.test(t)) return "jantar";
  if (/\bencontro\b/.test(t)) return "encontro";
  if (/\bcaf[ée]\b/.test(t)) return "café";
  return "";
}

function formatWhen(iso: string, hora?: string | null): string {
  if (!iso) return hora ? `às ${hora}` : "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return hora ? `às ${hora}` : "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dd = new Date(d);
  dd.setHours(0, 0, 0, 0);
  let day: string;
  if (dd.getTime() === today.getTime()) day = "hoje";
  else if (dd.getTime() === tomorrow.getTime()) day = "amanhã";
  else
    day = d.toLocaleDateString("pt-PT", {
      day: "numeric",
      month: "long",
      timeZone: "Europe/Lisbon",
    });
  return hora ? `${day} às ${hora}` : day;
}

function articleFor(tipo: string): string {
  // "a visita", "a reunião", "a tarefa", "a chamada"; "o almoço", "o jantar",
  // "o encontro", "o café", "o compromisso", "o seguimento", "o evento".
  const t = String(tipo || "").toLowerCase();
  if (/^(visita|reuni|tarefa|chamada|nota|ideia|marca[çc][ãa]o)/.test(t)) return "a";
  return "o";
}

// Pending actions moved to public.pending_actions (memory.server.ts).
// findActivePendingAction already filters by TTL and marks expired rows.

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function naturalHour(hhmm: string): string {
  const [h, m] = hhmm.split(":");
  const mm = Number(m || 0);
  return mm ? `${Number(h)}h${String(mm).padStart(2, "0")}` : `${Number(h)}h`;
}

function naturalWhen(date: string, time?: string | null): string {
  if (!date) return time ? `às ${naturalHour(time)}` : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return time ? `às ${naturalHour(time)}` : "";
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return time ? `às ${naturalHour(time)}` : "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dd = new Date(d);
  dd.setHours(0, 0, 0, 0);
  let day: string;
  if (dd.getTime() === today.getTime()) day = "hoje";
  else if (dd.getTime() === tomorrow.getTime()) day = "amanhã";
  else
    day = `dia ${d.toLocaleDateString("pt-PT", {
      day: "numeric",
      month: "long",
    })}`;
  return time ? `${day} às ${naturalHour(time)}` : day;
}

function personWithArticle(name: string): string {
  const first = (name.split(/\s+/)[0] || "").toLowerCase();
  const feminine = /a$/.test(first) && !/(costa|papa|maia|jesus)$/.test(first);
  return `${feminine ? "a" : "o"} ${name}`;
}

// "ligar a" + nome → "ligar ao Paulo" / "ligar à Maria".
// Devolve a preposição + artigo contraído. Se `name` estiver vazio,
// devolve apenas a preposição.
function personObject(prep: "a" | "de" | "com" | "para", name: string): string {
  if (!name) return prep;
  const first = (name.split(/\s+/)[0] || "").toLowerCase();
  const feminine = /a$/.test(first) && !/(costa|papa|maia|jesus)$/.test(first);
  if (prep === "a") return `${feminine ? "à" : "ao"} ${name}`;
  if (prep === "de") return `${feminine ? "da" : "do"} ${name}`;
  // "com" e "para" não contraem com o artigo definido em PT-PT normativo,
  // mas soam mais naturais com artigo: "com o Paulo".
  return `${prep} ${feminine ? "a" : "o"} ${name}`;
}

function personWithTitle(name: string, title?: string | null): string {
  const t = (title || "").trim();
  if (!t) return personWithArticle(name);
  // Trata como pronome (com/o Sr. Paulo).
  const first = (name.split(/\s+/)[0] || "").toLowerCase();
  const feminine = /^(sra|dra|d\.?)/i.test(t) || (/a$/.test(first) && !/(costa|papa|maia|jesus)$/.test(first));
  const artigo = feminine ? "a" : "o";
  const clean = t.replace(/\.?$/, ".");
  return `${artigo} ${clean} ${name}`;
}

function formatEuro(value: number): string {
  try {
    return new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value} €`;
  }
}

function buildProposalReply(
  intent: string,
  ent: Record<string, any>,
  personName: string | null,
): string {
  const hasDate = !!ent.date && /^\d{4}-\d{2}-\d{2}$/.test(String(ent.date));
  // Nunca propomos sem data. Se a data é inválida ou está em falta,
  // pedimos a data em primeiro lugar — o slot-fill vai completar o
  // registo antes da confirmação final.
  if (!hasDate) {
    const alvo = personName
      ? `de ligar ${personObject("a", personName)}`
      : intent === "create_event"
        ? "desse compromisso"
        : (ent.title ? `de "${String(ent.title).trim()}"` : "disso");
    return `Para quando queres que te lembre ${alvo}?`;
  }
  if (intent === "create_event") {
    const evento = (ent.event_type as string) || "compromisso";
    const when = naturalWhen(String(ent.date), (ent.start_time as string) || null);
    const feminine = /^(visita|reuni)/i.test(evento);
    const artigo = feminine ? "uma" : "um";
    const partes: string[] = [];
    partes.push(`${capitalize(when || "em breve")} tens ${artigo} ${evento}`);
    if (ent.location) partes[0] += ` em ${ent.location}`;
    // Imóvel: preferir property_type + value quando existe (T3 de 300.000 €)
    const tipo = ent.property_type || ent.property_reference;
    if (tipo) {
      const val = typeof ent.property_value === "number" ? ent.property_value : null;
      partes[0] += `, a um ${tipo}${val ? ` de ${formatEuro(val)}` : ""}`;
    } else if (typeof ent.property_value === "number") {
      partes[0] += `, no valor de ${formatEuro(ent.property_value)}`;
    }
    if (personName) partes[0] += ` com ${personWithTitle(personName, ent.person_title)}`;
    partes.push("Queres que registe?");
    return partes.join(". ");
  }
  if (intent === "create_follow_up") {
    // Nunca mostrar "essa tarefa". Deriva do que existe.
    let title = String(ent.title || "").trim();
    if (!title) {
      if (personName) title = `ligar ${personObject("a", personName)}`;
      else if (ent.location) title = `tratar de ${ent.location}`;
      else {
        // Sem contexto suficiente — pergunta em vez de propor com placeholder.
        const when = naturalWhen(String(ent.date), (ent.start_time as string) || null);
        return `${capitalize(when)} do que queres que te lembre?`;
      }
    } else {
      // Normaliza "ligar a Paulo" → "ligar ao Paulo" quando aplicável.
      title = title.replace(
        /\bligar\s+a\s+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][\p{L}\-']+)/u,
        (_m, nm: string) => `ligar ${personObject("a", nm)}`,
      );
    }
    const when = naturalWhen(String(ent.date), (ent.start_time as string) || null);
    return `${capitalize(when)} queres que te lembre de ${title}?`;
  }
  if (intent === "record_interaction") {
    if (personName) return `Registo esta conversa com ${personWithArticle(personName)}?`;
    return "Registo esta conversa?";
  }
  return "Queres que registe?";
}

async function findPeopleByName(supabase: any, userId: string, nome: string) {
  const firstName = nome.split(/\s+/)[0];
  const { data } = await supabase
    .from("people")
    .select("id, name")
    .eq("user_id", userId)
    .ilike("name", `${firstName}%`)
    .limit(6);
  return (data as { id: string; name: string }[]) ?? [];
}

export async function processAssessorMessage(input: EngineInput): Promise<EngineOutcome> {
  const { supabase, userId, channel, content } = input;

  if (!userId) return { reply: REPLY_UNASSOCIATED };

  const trimmedRaw = content.trim();
  if (!trimmedRaw) return { reply: REPLY_FALLBACK };

  // v3 gate — Reasoning Engine (OBSERVE→THINK→SEARCH→DECIDE→ACT).
  // Se `assessor.engine.v3` estiver activa para este utilizador, o novo
  // motor orquestra o turno inteiro. Kill switch: apagar linha em
  // `feature_flag_users` (efeito imediato, sem redeploy).
  try {
    const { isEngineV3Enabled } = await import("./v3/feature-flag.server");
    if (await isEngineV3Enabled(supabase, userId)) {
      const { runReasoningEngine } = await import("./v3/reasoning-engine.server");
      return await runReasoningEngine(input);
    }
  } catch (err) {
    logBranch("v3_gate_failed", { error: err instanceof Error ? err.message : String(err) });
  }

  // v2 gate — se v3 estiver desligada, tenta v2 (tool-calling reactivo).
  try {
    const { isEngineV2Enabled } = await import("./v2/feature-flag.server");
    if (await isEngineV2Enabled(supabase, userId)) {
      const { orchestrateAssessorV2 } = await import("./v2/orchestrator.server");
      return await orchestrateAssessorV2(input);
    }
  } catch (err) {
    logBranch("v2_gate_failed", { error: err instanceof Error ? err.message : String(err) });
  }

  // Contexto: perfil, últimas mensagens, ação pendente e estado da conversa.
  const [{ data: prof }, recent, pending, convState] = await Promise.all([
    supabase
      .from("profiles")
      .select("name, assessor_name")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("assessor_messages")
      .select("role, content, created_at")
      .eq("user_id", userId)
      .eq("channel", channel)
      .order("created_at", { ascending: false })
      .limit(6),
    findActivePendingAction(supabase, userId, channel),
    (async () => {
      const { getConversationState } = await import("./memory.server");
      return getConversationState(supabase, userId, channel);
    })(),
  ]);
  void convState; // reservado para futuras heurísticas (last_intent, resumo).

  const assessorNameRaw = (prof as any)?.assessor_name;
  const assessorName = sanitizeAssessorName(assessorNameRaw ?? "") || ASSESSOR_NAME_DEFAULT;
  const userFirstName = String((prof as any)?.name ?? "").split(/\s+/)[0] || "";
  // Remove o nome do Assessor quando usado como vocativo, para não poluir a interpretação.
  const trimmed = stripAssessorVocative(trimmedRaw, assessorName);

  logBranch("turn_received", {
    channel,
    has_pending: !!pending,
    pending_id: pending?.id ?? null,
    pending_status: pending?.status ?? null,
    pending_intent: pending?.intent ?? null,
    len: trimmed.length,
  });

  // 0.confirm) PRIORIDADE ABSOLUTA: se existe uma pending válida e a mensagem
  // é uma confirmação (sim/ok/está bem/…), executa antes de qualquer outro
  // ramo — nunca pode cair em saudação, fecho social ou IA.
  if (pending && isConfirmText(trimmed)) {
    logBranch("confirm_short_answer", { pending_id: pending.id, intent: pending.intent });
    if (pending.intent === "await_property_details") {
      await markPendingActionStatus(supabase, pending.id, "cancelled");
      await upsertConversationState(supabase, {
        userId, channel, pendingActionId: null,
      });
      return { reply: "Diz-me a morada ou o nome do proprietário." };
    }
    return await confirmPendingSafe(supabase, userId, channel, pending);
  }
  if (pending && isCancelText(trimmed)) {
    logBranch("cancel_short_answer", { pending_id: pending.id, intent: pending.intent });
    if (pending.intent === "await_property_details") {
      await markPendingActionStatus(supabase, pending.id, "cancelled");
      await upsertConversationState(supabase, {
        userId, channel, pendingActionId: null,
      });
      return { reply: "Está bem." };
    }
    await markPendingActionStatus(supabase, pending.id, "cancelled");
    await upsertConversationState(supabase, {
      userId, channel, pendingActionId: null, activeTopic: null,
      stateSummary: "utilizador cancelou a última proposta",
    });
    return { reply: "Ok, não registei nada." };
  }

  // 0.a) Saudação isolada — resposta natural sem IA.
  if (isGreetOnly(trimmed)) {
    logBranch("greeting");
    const reply = userFirstName
      ? `Olá, ${userFirstName}. Em que te posso ajudar?`
      : "Olá. Em que te posso ajudar?";
    return { reply };
  }
  if (isThanks(trimmed)) {
    logBranch("thanks");
    return { reply: "De nada." };
  }

  // 0.agenda) Consulta explícita da agenda — PRIORIDADE sobre Diversos e IA.
  //   Reconhece "hoje/amanhã/esta semana/próxima semana/agendamentos/
  //   compromissos/marcado/reuniões/visitas/chamadas".
  //   Nunca reduz "esta semana" a "hoje" e nunca cai em Diversos.
  {
    const agendaMatched = isExplicitAgendaQuery(trimmed);
    if (agendaMatched) {
      const period =
        detectAgendaPeriod(trimmed, input.receivedAt ?? new Date()) ??
        detectAgendaPeriod("hoje", input.receivedAt ?? new Date())!;
      logBranch("agenda_query", {
        detected_route: "agenda",
        matched_pattern: "QUERY_AGENDA_RE",
        agenda_period: period.kind,
        from: period.from,
        to: period.to,
        fallback_used: !detectAgendaPeriod(trimmed, input.receivedAt ?? new Date()),
      });
      const reply = await queryAgenda(supabase, userId, period);
      return { reply };
    }
  }

  // 0.a.bis) Fechos sociais ("ok", "perfeito", "combinado", "está bem").
  //   - Se existe uma proposta pendente, "ok" é confirmação (tratado abaixo).
  //   - Sem proposta pendente, é um fecho de conversa: resposta neutra
  //     e nunca reabrir a última ação. Nunca cai no ramo de saudação.
  if (!pending && isSocialCloser(trimmed)) {
    logBranch("social_closer_no_pending");
    return { reply: pickCloserReply(trimmed) ?? "Perfeito." };
  }

  // 0) Fast-path: respostas curtas de confirmação/cancelamento.
  // Nunca envia "Sim"/"Não" isolados para a IA — interpreta localmente
  // usando a ação pendente.
  // 0.pre) Fluxo progressivo de classificação de ficheiros.
  // Corre ANTES do fast-path genérico porque a resposta do utilizador
  // ("sim", "amanhã às 10h", texto livre) tem de ser interpretada no
  // contexto da pergunta atual (file_description → reminder_confirmation
  // → reminder_datetime), não como intenção nova.
  if (pending && pending.intent === "classify_file") {
    const fileFlow = await handleFileClassificationTurn(
      supabase,
      userId,
      channel,
      pending,
      trimmed,
      trimmedRaw,
      input.receivedAt ?? new Date(),
    );
    if (fileFlow) return fileFlow;
  }

  // 0.slot) Slot-fill determinístico. Se existe pending em
  // `collecting_information` para create_event/create_follow_up, a próxima
  // mensagem preenche APENAS o campo em falta (data/hora) e nunca é
  // enviada à IA — evita que "amanhã" seja interpretado como query_today.
  if (
    pending &&
    pending.status === "collecting_information" &&
    (pending.intent === "create_event" || pending.intent === "create_follow_up")
  ) {
    const slot = await handleSlotFill(
      supabase,
      userId,
      channel,
      pending,
      trimmed,
      input.receivedAt ?? new Date(),
    );
    if (slot) return slot;
  }

  // (Confirmação/cancelamento já foram tratados no topo com prioridade absoluta.)

  // 0.property) Se há um imóvel activo na conversa e a mensagem não é uma
  // nova acção clara, aplica enriquecimento progressivo. Cria pending para
  // alterações sensíveis (preço, morada, proprietário).
  // Não corre quando a mensagem é claramente um pedido de acção (lembrete,
  // chamada, etc.) — nesse caso o fluxo normal cria seguimento/evento.
  if (!pending && !ACTION_VERB_RE.test(trimmed)) {
    const propHandled = await handleActivePropertyEnrichment(
      supabase,
      userId,
      channel,
      convState,
      trimmed,
      trimmedRaw,
    );
    if (propHandled) return propHandled;
  }

  // 0.d) Pergunta sobre Diversos — apenas com referência EXPLÍCITA a
  // "diversos/notas/ideias/apontamentos". Agenda já foi tratada acima.
  if (isQueryMisc(trimmed)) {
    logBranch("misc_query", {
      detected_route: "miscellaneous",
      matched_pattern: "QUERY_MISC_RE",
    });
    const reply = await queryMisc(supabase, userId, trimmed);
    return { reply };
  }

  // 0.b) "Tenho mais uma" / "outra" — inicia nova recolha e cancela o
  // rascunho anterior para não repetir a mesma proposta.
  if (pending && MORE_RE.test(trimmed) && !hasExplicitDateTime(trimmed)) {
    await markPendingActionStatus(supabase, pending.id, "cancelled");
    await upsertConversationState(supabase, {
      userId, channel, pendingActionId: null, activeTopic: null,
    });
    return { reply: "Claro. Diz-me o dia e a hora dessa outra visita." };
  }

  // 0.c) Correção do último evento/proposta pendente ou já criado.
  //   "Mas é amanhã", "é às 11h", "não é na Granja", etc.
  if (looksLikeCorrection(trimmed)) {
    const correction = resolveDateTimeFromText(trimmed, input.receivedAt ?? new Date());
    // 1) Se há um rascunho pendente e a correção traz data/hora nova,
    //    atualizamos o rascunho e voltamos a propor.
    if (pending && (correction.date || correction.time)) {
      const payload = (pending.structured_payload ?? {}) as any;
      const ent = { ...(payload.entities ?? {}) };
      if (correction.date) ent.date = correction.date;
      if (correction.time) ent.start_time = correction.time;
      const newPayload = { ...payload, entities: ent };
      const reply = buildProposalReply(payload.__intent || "create_event", ent, null);
      await updatePendingActionPayload(supabase, pending.id, newPayload, {
        status: "pending_confirmation",
        pending_question: reply,
      });
      return { reply, messageType: "__ALREADY_PERSISTED__" };
    }
    // 2) Se não há rascunho mas há evento confirmado recentemente,
    //    atualiza o registo real (follow_ups).
    if (!pending && (correction.date || correction.time)) {
      const last = await findLastExecutedAction(supabase, userId, channel, ["create_event", "create_follow_up"]);
      const quandoAsk = naturalWhen(
        String(correction.date || (last?.structured_payload as any)?.entities?.date || ""),
        (correction.time as string) || ((last?.structured_payload as any)?.entities?.start_time as string) || null,
      );
      if (last && last.created_resource_id) {
        // Verifica ANTES de qualquer UPDATE que o recurso ainda existe.
        // Sem esta salvaguarda, corríamos o risco de anunciar "Corrigi..."
        // sem que exista um seguimento real na base de dados.
        const { data: exists } = await supabase
          .from("follow_ups")
          .select("id")
          .eq("id", last.created_resource_id)
          .eq("user_id", userId)
          .maybeSingle();
        if (!exists) {
          logBranch("correction_target_missing", { last_id: last.id });
          return {
            reply: `Não encontrei o seguimento que querias corrigir. Queres que o registe para ${quandoAsk}?`,
          };
        }
        const p = last.structured_payload as any;
        const ent = { ...(p.entities ?? {}) };
        if (correction.date) ent.date = correction.date;
        if (correction.time) ent.start_time = correction.time;
        const updateData: any = {};
        if (correction.date) updateData.due_date = correction.date;
        if (correction.time) updateData.due_time = correction.time;
        const { data: updated, error } = await supabase
          .from("follow_ups")
          .update(updateData)
          .eq("id", last.created_resource_id)
          .eq("user_id", userId)
          .select("id");
        if (error || !updated || updated.length === 0) {
          console.error("[assessor] correção falhou:", error?.message || "0 linhas afetadas");
          return {
            reply: `Não encontrei o seguimento que acabámos de criar. Queres que o registe novamente para ${quandoAsk}?`,
          };
        }
        await updatePendingActionPayload(supabase, last.id, { ...p, entities: ent });
        const tipoLabel = (ent.event_type || (last.intent === "create_event" ? "visita" : "tarefa")) as string;
        const quando = naturalWhen(String(ent.date), (ent.start_time as string) || null);
        logBranch("correction_applied", { resource_id: last.created_resource_id });
        return { reply: `Tens razão. Corrigi ${articleFor(tipoLabel)} ${tipoLabel} para ${quando}.` };
      }
      // Sem alvo para corrigir: perguntar antes de criar novo (evita duplicados).
      if (!last || !last.created_resource_id) {
        logBranch("correction_no_target", { has_last: !!last });
        return {
          reply: `Não encontrei o seguimento que querias corrigir. Queres que o registe para ${quandoAsk}?`,
        };
      }
    }
  }

  const recentMsgs: AiContextMessage[] = ((recent?.data ?? []) as any[])
    .reverse()
    .filter((m) => m.role === "user" || m.role === "assessor")
    .map((m) => ({ role: m.role as "user" | "assessor", content: String(m.content ?? "") }));

  const pendingAction = pending
    ? {
        intent: pending.intent,
        entities: ((pending.structured_payload as any)?.entities ?? {}) as Record<string, unknown>,
      }
    : null;

  // ------------------------------------------------------------------
  // Router semântico (IA central). Corre depois das guardas
  // determinísticas (confirmações, saudações, agenda-regex, slot-fill,
  // correcções) e ANTES da extração de entidades. Serve para apanhar
  // consultas naturais que os regexes não cobrem — e.g. "e amanhã?"
  // no seguimento de uma pergunta de agenda, ou "o que sabes do Paulo?".
  // Só encurta o turno quando a intenção é conversacional/pesquisa;
  // acções que criam/alteram dados continuam a passar pelo extrator
  // existente para não perder validações e idempotência.
  // ------------------------------------------------------------------
  const router = await interpretAssessorMessage({
    content: trimmed,
    now: input.receivedAt ?? new Date(),
    timezone: "Europe/Lisbon",
    userName: (prof as any)?.name ?? null,
    assessorName,
    recent: recentMsgs.slice(-6),
    pendingAction: pending
      ? {
          intent: pending.intent,
          entities: ((pending.structured_payload as any)?.entities ?? {}) as Record<string, unknown>,
          current_question: (pending as any).current_question ?? null,
          pending_question: (pending as any).pending_question ?? null,
        }
      : null,
    activeEntity: convState?.active_topic
      ? { type: "property", id: (convState as any).active_property_id ?? null, label: (convState as any).active_topic ?? null }
      : null,
  });

  // Telemetria dedicada do router.
  await supabase
    .from("assessor_ai_logs")
    .insert({
      user_id: userId,
      channel,
      model: router.telemetry.model,
      intent: router.decision?.intent ?? null,
      confidence: router.decision?.confidence ?? null,
      input_tokens: router.telemetry.inputTokens,
      output_tokens: router.telemetry.outputTokens,
      total_tokens: router.telemetry.totalTokens,
      latency_ms: router.telemetry.latencyMs,
      success: router.ok,
      error: router.error ?? null,
      estimated_cost_usd: null,
      domain: router.decision?.destination ?? null,
      route: "router_semantic",
      fallback_used: !router.ok,
    } as never)
    .then(() => undefined, () => undefined);

  if (router.ok && router.decision && router.decision.confidence >= ROUTER_MIN_CONFIDENCE) {
    const d = router.decision;

    // (a) Consulta explícita à agenda — usa hint do router e detectAgendaPeriod
    // para calcular os limites reais em Europe/Lisbon.
    if (d.intent === "query_agenda") {
      const hint =
        d.entities?.period === "tomorrow" ? "amanhã" :
        d.entities?.period === "week" ? "esta semana" :
        d.entities?.period === "next_week" ? "próxima semana" :
        d.entities?.period === "today" ? "hoje" :
        trimmed;
      const period =
        detectAgendaPeriod(hint, input.receivedAt ?? new Date()) ??
        detectAgendaPeriod("hoje", input.receivedAt ?? new Date())!;
      logBranch("router_agenda", { period: period.kind, from: period.from, to: period.to });
      const reply = await queryAgenda(supabase, userId, period);
      return { reply };
    }

    // (b) Consulta a uma pessoa por nome — quando o router extrai person_name.
    if (d.intent === "query_person" && d.entities?.person_name) {
      logBranch("router_person", { name: d.entities.person_name });
      const reply = await queryPerson(supabase, userId, String(d.entities.person_name));
      return { reply };
    }

    // (c) Consulta a Diversos — só quando o router é explícito.
    if (d.intent === "query_misc") {
      logBranch("router_misc");
      const reply = await queryMisc(supabase, userId, trimmed);
      return { reply };
    }

    // (d) Smalltalk / saudação / desabafo — responde curto e não persiste.
    //    Só encurta quando NÃO há pending (para não interromper fluxos).
    if (!pending && (d.intent === "smalltalk" || d.conversation_act === "greeting" || d.conversation_act === "casual") && !d.should_persist) {
      const suggestion = typeof d.reply === "string" ? d.reply.trim() : "";
      const reply = sanitizeReplyFromCulture(suggestion) || (userFirstName ? `Estou aqui, ${userFirstName}.` : "Estou aqui.");
      logBranch("router_smalltalk");
      return { reply };
    }
  }

  const ai = await callAssessorAi({
    content: trimmed,
    now: input.receivedAt ?? new Date(),
    timezone: "Europe/Lisbon",
    locale: "pt-PT",
    userName: (prof as any)?.name ?? null,
    assessorName,
    // Não enviamos histórico para a IA na extração de entidades —
    // evita que o modelo copie pessoa/imóvel/valor de mensagens anteriores.
    recent: [],
    pendingAction,
  });

  // Telemetria (best-effort)
  await supabase
    .from("assessor_ai_logs")
    .insert({
      user_id: userId,
      channel,
      model: ai.telemetry.model,
      intent: ai.interpretation?.intent ?? null,
      confidence: ai.interpretation?.confidence ?? null,
      input_tokens: ai.telemetry.inputTokens,
      output_tokens: ai.telemetry.outputTokens,
      total_tokens: ai.telemetry.totalTokens,
      latency_ms: ai.telemetry.latencyMs,
      success: ai.ok,
      error: ai.error ?? null,
      estimated_cost_usd: ai.telemetry.estimatedCostUsd,
    } as never)
    .then(() => undefined, () => undefined);

  if (!ai.ok || !ai.interpretation) {
    return { reply: REPLY_AI_DOWN };
  }

  const interp = ai.interpretation;

  // Endurecer as entidades: usar SEMPRE o que está na mensagem atual
  // como fonte de verdade para data/hora. A IA pode ter alucinado.
  hardenEntitiesFromMessage(interp, trimmed, input.receivedAt ?? new Date());

  // 0.e) smalltalk — responde e não regista nada.
  if (interp.intent === "smalltalk" || interp.destination === "none" && interp.should_persist === false && !["confirm","cancel","query_today","query_person","query_misc","create_event","create_follow_up","record_interaction","note"].includes(interp.intent)) {
    const reply = sanitizeReply(interp.reply) || (userFirstName ? `Estou aqui, ${userFirstName}.` : "Estou aqui.");
    return { reply };
  }

  // 1) confirm/cancel via IA (fallback para frases menos óbvias)
  if (pending && interp.intent === "confirm") {
    return await confirmPendingSafe(supabase, userId, channel, pending);
  }
  if (pending && interp.intent === "cancel") {
    await markPendingActionStatus(supabase, pending.id, "cancelled");
    return { reply: "Ok, não registei nada." };
  }

  // 2) queries executadas com dados reais
  if (interp.intent === "query_today") {
    // Só executa quando a mensagem é claramente uma consulta.
    // "amanhã" sozinho, ou qualquer resposta curta sem verbo/keyword de
    // agenda, cai no fallback conversacional em vez de consultar a agenda.
    if (isExplicitAgendaQuery(trimmed) || /\?/.test(trimmed)) {
      const period = detectAgendaPeriod(trimmed, input.receivedAt ?? new Date()) ??
        detectAgendaPeriod("hoje", input.receivedAt ?? new Date())!;
      const reply = await queryAgenda(supabase, userId, period);
      return { reply };
    }
    // Sem sinais claros — devolve fallback natural.
    return {
      reply: userFirstName
        ? `Diz-me o que queres, ${userFirstName}.`
        : "Diz-me o que queres.",
    };
  }
  if (interp.intent === "query_person") {
    const reply = await queryPerson(supabase, userId, interp.entities.person_name ?? "");
    return { reply };
  }
  if (interp.intent === "query_misc") {
    const reply = await queryMisc(supabase, userId, trimmed);
    return { reply };
  }

  // 2.b) Notas / observações — guarda sem confirmação em Diversos.
  if (interp.intent === "note" || (interp.destination === "miscellaneous" && interp.should_persist)) {
    return await saveMiscellaneous(supabase, userId, channel, trimmedRaw, interp);
  }

  // 3) propostas com confirmação
  if (interp.intent === "create_event" || interp.intent === "create_follow_up" || interp.intent === "record_interaction") {
    // Uma nova proposta invalida qualquer rascunho anterior — evita
    // repetir dados da proposta antiga.
    if (pending) await markPendingActionStatus(supabase, pending.id, "cancelled");
    return await proposeAction(supabase, userId, channel, trimmed, interp, convState, input.sourceMessageId ?? null);
  }

  // 3.b) Contexto de imóvel na mensagem — propor criação/associação.
  if (detectPropertyContext(trimmed)) {
    const fields = extractPropertyFields(trimmed);
    const propRes = await proposePropertyFromMessage(
      supabase,
      userId,
      channel,
      trimmedRaw,
      fields,
      null,
    );
    if (propRes) return propRes;
  }

  // 4) fallback conversacional — nunca resposta técnica.
  // Se a IA devolveu uma reply natural, usa-a; caso contrário, guarda em Diversos
  // (a mensagem tem texto profissional útil se chegou até aqui).
  const aiReply = sanitizeReply(interp.reply);
  if (aiReply) return { reply: aiReply };
  if (trimmedRaw.length >= 8) {
    return await saveMiscellaneous(supabase, userId, channel, trimmedRaw, interp);
  }
  return { reply: "Estou aqui. Conta-me mais quando quiseres." };
}

async function saveMiscellaneous(
  supabase: any,
  userId: string,
  channel: string,
  originalText: string,
  interp: AiInterpretation,
): Promise<EngineOutcome> {
  const titleRaw = String(interp.entities?.title || interp.entities?.notes || originalText).trim();
  const title = titleRaw.length > 120 ? titleRaw.slice(0, 117) + "..." : titleRaw;
  const summary = String(interp.entities?.notes || "").trim() || null;
  const { error } = await supabase.from("miscellaneous_items").insert({
    user_id: userId,
    title,
    original_content: originalText,
    summary,
    source_channel: channel,
    status: "inbox",
    tags: [],
  } as never);
  if (error) {
    return { reply: "Anotado." };
  }
  const aiReply = sanitizeReply(interp.reply);
  return { reply: aiReply || "Fica registado." };
}

async function queryMisc(supabase: any, userId: string, text: string): Promise<string> {
  const t = text.toLowerCase();
  const now = new Date();
  let sinceIso: string | null = null;
  let label = "";
  if (/\bhoje\b/.test(t)) {
    const d = new Date(now); d.setHours(0, 0, 0, 0);
    sinceIso = d.toISOString();
    label = "hoje";
  } else if (/\bontem\b/.test(t)) {
    const d = new Date(now); d.setDate(d.getDate() - 1); d.setHours(0, 0, 0, 0);
    sinceIso = d.toISOString();
    label = "ontem";
  } else if (/\b(semana|est[ae]s?\s+dias?)\b/.test(t)) {
    const d = new Date(now); d.setDate(d.getDate() - 7);
    sinceIso = d.toISOString();
    label = "esta semana";
  }
  let q = supabase
    .from("miscellaneous_items")
    .select("title, created_at, status")
    .eq("user_id", userId)
    .neq("status", "deleted")
    .neq("status", "archived")
    .order("created_at", { ascending: false })
    .limit(10);
  if (sinceIso) q = q.gte("created_at", sinceIso);
  const { data } = await q;
  const rows = (data as any[]) ?? [];
  if (rows.length === 0) {
    return label
      ? `Não tens notas em Diversos ${label}.`
      : "Não tens notas em Diversos ainda.";
  }
  const linhas = rows.map((r) => `• ${r.title}`);
  const header = label ? `Diversos (${label}):` : "Em Diversos:";
  return `${header}\n${linhas.join("\n")}`;
}

// Substitui entidades sensíveis (data/hora, pessoa) por valores
// derivados apenas da mensagem atual. Se a mensagem não contém
// pessoa/imóvel/valor, esses campos ficam a null — nunca herdados.
function hardenEntitiesFromMessage(interp: AiInterpretation, text: string, now: Date) {
  const resolved = resolveDateTimeFromText(text, now);
  const ent = interp.entities as any;
  // Descarta datas mal formadas (a IA pode devolver "amanhã" em vez de ISO).
  if (ent.date && !/^\d{4}-\d{2}-\d{2}$/.test(String(ent.date))) ent.date = null;
  if (ent.start_time && !/^\d{2}:\d{2}$/.test(String(ent.start_time))) ent.start_time = null;
  // Data / hora: se a mensagem tem expressão explícita, usa-a;
  // caso contrário, se a IA inventou uma data sem base no texto, descarta.
  if (resolved.date) ent.date = resolved.date;
  else if (ent.date && !hasExplicitDateReferenceInText(text)) ent.date = null;
  if (resolved.time) ent.start_time = resolved.time;
  else if (ent.start_time && !/\d\s*(?:h|:)/i.test(text)) ent.start_time = null;

  // Pessoa: aceita apenas se o primeiro nome aparecer literalmente no texto.
  if (ent.person_name) {
    const first = String(ent.person_name).split(/\s+/)[0];
    if (first && !new RegExp(`\\b${escapeRe(first)}\\b`, "i").test(text)) {
      ent.person_name = null;
      ent.person_title = null;
    }
  }
  // Trato / título de pessoa (Sr., Sra., Dr., Dra., D.)
  if (!ent.person_title) {
    const mT = text.match(/\b(Sr\.?|Sra\.?|Dr\.?|Dra\.?|D\.)\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]/);
    if (mT) ent.person_title = mT[1].replace(/\.?$/, ".");
  }
  // Imóvel: só mantém se aparecer no texto (T2/T3/T4/morada/tipologia).
  if (ent.property_reference) {
    const ref = String(ent.property_reference);
    const token = ref.split(/\s+/)[0];
    if (token && !new RegExp(`\\b${escapeRe(token)}\\b`, "i").test(text)) {
      ent.property_reference = null;
    }
  }
  // Tipologia (T0..T6, V3, V4)
  if (!ent.property_type) {
    const mTip = text.match(/\b([TV][0-6](?:\+[0-9])?)\b/i);
    if (mTip) ent.property_type = mTip[1].toUpperCase();
  } else {
    const tt = String(ent.property_type);
    if (!new RegExp(`\\b${escapeRe(tt)}\\b`, "i").test(text)) ent.property_type = null;
  }
  // Valor: 300k€, 300 mil, 300.000 €, 1,2M€
  if (typeof ent.property_value !== "number") {
    const parsed = parseValueFromText(text);
    if (parsed !== null) ent.property_value = parsed;
  }
  // Localidade: heurística simples "em <Local>" quando não existe.
  if (!ent.location) {
    const mLoc = text.match(/\bem\s+([A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÀ-ÿ'’\-]+(?:\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-Za-zÀ-ÿ'’\-]+){0,3})/);
    if (mLoc) ent.location = mLoc[1];
  } else {
    const loc = String(ent.location);
    if (!new RegExp(`\\b${escapeRe(loc.split(/\s+/)[0])}\\b`, "i").test(text)) ent.location = null;
  }
  // Preço/valor em notes/title: se a IA meteu um valor em euros, verifica.
  if (ent.notes && /\d[\d.\s]*\s*(?:€|eur|euros?)/i.test(String(ent.notes)) && !/\d[\d.\s]*\s*(?:€|eur|euros?)/i.test(text)) {
    ent.notes = null;
  }
}

function parseValueFromText(text: string): number | null {
  // 300k€, 300 k, 300 mil, 1,2M€, 1.5M, 300.000 €, 300000 euros
  const t = text.toLowerCase();
  let m = t.match(/(\d+(?:[.,]\d+)?)\s*(k|mil|m|mi|milh(?:ão|oes|ões))\s*(?:€|eur|euros?)?/);
  if (m) {
    const base = parseFloat(m[1].replace(",", "."));
    const unit = m[2];
    if (unit === "k" || unit === "mil") return Math.round(base * 1_000);
    return Math.round(base * 1_000_000);
  }
  m = t.match(/(\d{1,3}(?:[.\s]\d{3})+|\d{4,})\s*(?:€|eur|euros?)/);
  if (m) {
    const num = parseInt(m[1].replace(/[.\s]/g, ""), 10);
    if (!Number.isNaN(num)) return num;
  }
  return null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasExplicitDateReferenceInText(text: string): boolean {
  return /\b(hoje|amanh[ãa]|ontem|depois\s+de\s+amanh[ãa]|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo|(?:dia\s+)?\d{1,2}\s+(?:de\s+)?(?:janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)|\d{1,2}[\/\-.]\d{1,2})/i.test(text);
}

// Delega para a camada de cultura — evita cópias divergentes.
function sanitizeReply(reply?: string | null): string {
  return sanitizeReplyFromCulture(reply);
}

function describeDraftShort(draft: { structured_payload: any } | null): string | null {
  const payload = draft?.structured_payload as any;
  const ent = payload?.entities;
  if (!ent) return null;
  const intent = payload.__intent;
  if (intent === "create_event") {
    const when = ent.date ? naturalWhen(String(ent.date), ent.start_time || null) : null;
    const evento = ent.event_type || "compromisso";
    return when ? `${evento} de ${when}` : evento;
  }
  if (intent === "create_follow_up") return ent.title || null;
  return null;
}

async function proposeAction(
  supabase: any,
  userId: string,
  channel: string,
  originalText: string,
  interp: AiInterpretation,
  convState?: any,
  sourceMessageId?: string | null,
): Promise<EngineOutcome> {
  const ent = interp.entities;

  // Enriquecimento pelo contexto do imóvel activo:
  // "ligar ao dono do imóvel em Canelas" → título e ligação ao imóvel.
  let activeProperty: { id: string; title: string; owner_person_id: string | null } | null = null;
  const propertyId: string | null =
    convState?.last_property_id ||
    (convState?.last_entity_type === "property" ? convState?.last_entity_id : null) ||
    null;
  const mentionsOwner = OWNER_REF_RE.test(originalText);
  const mentionsProperty = /\b(im[óo]vel|apartamento|moradia|casa|angaria[çc][ãa]o)\b/i.test(originalText);
  if (propertyId && (mentionsOwner || mentionsProperty)) {
    const { data: p } = await supabase
      .from("properties")
      .select("id, title, owner_person_id")
      .eq("id", propertyId)
      .eq("user_id", userId)
      .maybeSingle();
    if (p) activeProperty = p as any;
  }
  if (activeProperty && (interp.intent === "create_event" || interp.intent === "create_follow_up")) {
    // Título contextual quando não vem no texto ou vem vazio.
    const currentTitle = String((ent as any).title || "").trim();
    if (!currentTitle) {
      if (mentionsOwner) {
        (ent as any).title = `Ligar ao proprietário do ${activeProperty.title}`;
      } else {
        (ent as any).title = `Sobre ${activeProperty.title}`;
      }
    }
    // Marca a localização como o imóvel activo — evita "em Canelas" ser
    // interpretado como localidade solta.
    if (!(ent as any).property_reference) {
      (ent as any).property_reference = activeProperty.title;
    }
  }

  // Resolução de pessoa (o backend, não a IA)
  let pessoaId: string | null = null;
  let candidates: { id: string; name: string }[] = [];
  let personName: string | null = null;
  if (activeProperty?.owner_person_id && mentionsOwner && !ent.person_name) {
    // Usa o proprietário do imóvel activo, se conhecido.
    pessoaId = activeProperty.owner_person_id;
    const { data: person } = await supabase
      .from("people")
      .select("id, name")
      .eq("id", pessoaId)
      .eq("user_id", userId)
      .maybeSingle();
    if (person) {
      personName = (person as any).name;
      candidates = [{ id: (person as any).id, name: (person as any).name }];
    }
  } else if (ent.person_name) {
    candidates = await findPeopleByName(supabase, userId, ent.person_name);
    if (candidates.length === 1) {
      pessoaId = candidates[0].id;
      personName = candidates[0].name;
    } else if (candidates.length === 0) {
      personName = ent.person_name;
    }
  }

  // Resposta natural gerada pelo backend a partir das entities,
  // ignorando o texto que a IA possa devolver ("Proposta: ...").
  const reply = buildProposalReply(interp.intent, ent as any, personName);

  const payload: Record<string, unknown> = {
    __intent: interp.intent,
    entities: { ...ent },
    pessoaId: pessoaId ?? "",
    candidatosPessoa: candidates,
    textoOriginal: originalText,
    target_property_id: activeProperty?.id ?? null,
  };

  // Mapear para o cartão legado do UI web quando aplicável.
  const cartaoTipo =
    interp.intent === "record_interaction" ? "conversa" : "seguimento";

  const pendingRow = await createPendingAction(supabase, {
    userId,
    channel,
    intent: interp.intent,
    originalContent: originalText,
    payload,
    confidence: interp.confidence ?? null,
    pendingQuestion: reply,
    sourceMessageId: sourceMessageId ?? null,
  });

  await supabase.from("assessor_messages").insert({
    user_id: userId,
    role: "assessor",
    content: reply,
    message_type: cartaoTipo,
    structured_payload: payload as never,
    status: "draft",
    channel,
    related_pending_action_id: pendingRow?.id ?? null,
  } as never);

  await upsertConversationState(supabase, {
    userId,
    channel,
    activeTopic: interp.intent,
    lastIntent: interp.intent,
    pendingActionId: pendingRow?.id ?? null,
    stateSummary: summarizePendingAction(pendingRow),
  });

  return { reply, messageType: "__ALREADY_PERSISTED__" };
}

async function queryToday(supabase: any, userId: string): Promise<string> {
  const now = new Date();
  const period = detectAgendaPeriod("hoje", now)!;
  return queryAgenda(supabase, userId, period);
}

async function queryAgenda(
  supabase: any,
  userId: string,
  period: AgendaPeriod,
): Promise<string> {
  const { data } = await supabase
    .from("follow_ups")
    .select("title, type, due_date, due_time, status")
    .eq("user_id", userId)
    .gte("due_date", period.from)
    .lte("due_date", period.to)
    .neq("status", "Concluído")
    .neq("status", "Cancelado")
    .order("due_date", { ascending: true })
    .order("due_time", { ascending: true, nullsFirst: false });
  const rows = ((data as any[]) ?? []) as AgendaRow[];
  return formatAgendaReply({ period, rows, now: new Date() });
}

async function queryPerson(supabase: any, userId: string, name: string): Promise<string> {
  if (!name) return "Sobre quem queres saber?";
  const candidates = await findPeopleByName(supabase, userId, name);
  if (candidates.length === 0) return `Não encontrei ${name} nos teus contactos.`;
  if (candidates.length > 1) {
    return `Encontrei mais do que uma pessoa: ${candidates.map((c) => c.name).join(", ")}. A qual te referes?`;
  }
  const p = candidates[0];
  const [fu, inter] = await Promise.all([
    supabase.from("follow_ups").select("title, due_date, status").eq("user_id", userId).eq("person_id", p.id).order("due_date", { ascending: false }).limit(3),
    supabase.from("interactions").select("summary, occurred_at").eq("user_id", userId).eq("person_id", p.id).order("occurred_at", { ascending: false }).limit(3),
  ]);
  const parts: string[] = [`${p.name}:`];
  const interRows = (inter?.data as any[]) ?? [];
  if (interRows.length) parts.push(`Últimas interações: ${interRows.map((i) => i.summary || "(sem resumo)").join(" · ")}`);
  const fuRows = (fu?.data as any[]) ?? [];
  if (fuRows.length) parts.push(`Seguimentos: ${fuRows.map((f) => `${f.title} (${f.status})`).join(" · ")}`);
  if (parts.length === 1) parts.push("Sem registos ainda.");
  return parts.join("\n");
}

// Slot-fill determinístico para pending em `collecting_information`.
// Preenche apenas o campo em falta a partir do texto do utilizador; se ficar
// completo, executa imediatamente. Nunca chama a IA nem consulta a agenda.
async function handleSlotFill(
  supabase: any,
  userId: string,
  channel: string,
  pending: PendingActionRow,
  trimmed: string,
  now: Date,
): Promise<EngineOutcome | null> {
  const payload = (pending.structured_payload ?? {}) as Record<string, any>;
  const ent = { ...(payload.entities ?? {}) } as Record<string, any>;
  const asked = pending.current_question || "";

  if (isCancelText(trimmed)) {
    await markPendingActionStatus(supabase, pending.id, "cancelled");
    await upsertConversationState(supabase, {
      userId, channel, pendingActionId: null, activeTopic: null,
      stateSummary: "utilizador cancelou o pedido pendente",
    });
    return { reply: "Ok, não registei nada." };
  }

  const resolved = resolveDateTimeFromText(trimmed, now);
  let filled = false;
  if (asked === "date" || !ent.date) {
    if (resolved.date) { ent.date = resolved.date; filled = true; }
    if (resolved.time) { ent.start_time = resolved.time; filled = true; }
  } else if (asked === "time" || !ent.start_time) {
    if (resolved.time) { ent.start_time = resolved.time; filled = true; }
  }

  if (!filled) {
    // Resposta não interpretável — repete a pergunta sem chamar a IA.
    const q = pending.pending_question || NATURAL_FALLBACKS.askDate;
    return { reply: q };
  }

  const newPayload = { ...payload, entities: ent };
  // Ainda falta data → volta a pedir.
  if (!ent.date) {
    const q = NATURAL_FALLBACKS.askDate;
    await updatePendingActionPayload(supabase, pending.id, newPayload, {
      status: "collecting_information",
      current_question: "date",
      pending_question: q,
    });
    return { reply: q };
  }
  // Data preenchida — passa a pending_confirmation e executa de imediato.
  await updatePendingActionPayload(supabase, pending.id, newPayload, {
    status: "pending_confirmation",
    current_question: null,
  });
  const reloaded = { ...pending, structured_payload: newPayload, status: "pending_confirmation" as any };
  return await confirmPendingSafe(supabase, userId, channel, reloaded as PendingActionRow);
}

async function confirmPendingSafe(
  supabase: any,
  userId: string,
  channel: string,
  pending: PendingActionRow,
): Promise<EngineOutcome> {
  try {
    await markPendingActionStatus(supabase, pending.id, "executing");
    return await executePending(supabase, userId, channel, pending);
  } catch (err) {
    console.error("[assessor] executePending falhou:", err instanceof Error ? err.message : err);
    // Manter a ação disponível para retry — volta a pending_confirmation
    // com o erro técnico guardado. NÃO marcar como executed nem failed
    // terminal, para que "sim" volte a tentar.
    await markPendingActionStatus(supabase, pending.id, "pending_confirmation", {
      error_message: err instanceof Error ? err.message : String(err),
    });
    const payload = (pending.structured_payload ?? {}) as Record<string, any>;
    const intent = pending.intent;
    const tipoLabel =
      intent === "create_event"
        ? (payload.entities?.event_type as string) || "compromisso"
        : intent === "create_follow_up"
          ? "tarefa"
          : "registo";
    return {
      reply: `Não consegui registar ${tipoLabel === "compromisso" ? "o " : "a "}${tipoLabel}. Queres que tente novamente?`,
    };
  }
}

async function executePending(
  supabase: any,
  userId: string,
  channel: string,
  pending: PendingActionRow,
): Promise<EngineOutcome> {
  const payload = (pending.structured_payload ?? {}) as Record<string, any>;
  const intent = pending.intent;
  const ent = (payload.entities ?? {}) as Record<string, any>;
  const pessoaId = (payload.pessoaId as string) || null;

  // Property-related intents
  if (
    intent === "create_property" ||
    intent === "associate_property_to_file" ||
    intent === "update_property" ||
    intent === "set_property_owner"
  ) {
    return await executePendingProperty(supabase, userId, channel, pending);
  }

  if (intent === "create_event" || intent === "create_follow_up") {
    if (!ent.date) {
      const question = "Para quando é?";
      await updatePendingActionPayload(supabase, pending.id, payload, {
        status: "collecting_information",
        current_question: "date",
        pending_question: question,
      });
      return { reply: question, messageType: "__ALREADY_PERSISTED__" };
    }
    // Idempotência: se esta pending já criou o recurso, não voltar a inserir.
    if (pending.created_resource_id) {
      const { data: existing } = await supabase
        .from("follow_ups")
        .select("id, due_date, due_time")
        .eq("id", pending.created_resource_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (existing) {
        await markPendingActionStatus(supabase, pending.id, "executed", {
          created_resource_type: "follow_up",
          created_resource_id: pending.created_resource_id,
        });
        const quando = naturalWhen(String(existing.due_date), (existing.due_time as string) || null);
        return { reply: `Já estava registado para ${quando}.` };
      }
    }
    // Idempotência dura: se o índice único por source_pending_action_id
    // já tem um seguimento para esta pending, adota-o em vez de tentar
    // inserir duplicado.
    {
      const { data: dup } = await supabase
        .from("follow_ups")
        .select("id, due_date, due_time")
        .eq("user_id", userId)
        .eq("source_pending_action_id", pending.id)
        .maybeSingle();
      if (dup) {
        await markPendingActionStatus(supabase, pending.id, "executed", {
          created_resource_type: "follow_up",
          created_resource_id: (dup as any).id as string,
        });
        const quando = naturalWhen(String((dup as any).due_date), ((dup as any).due_time as string) || null);
        return { reply: `Já estava registado para ${quando}.` };
      }
    }
    const tipoDb = intent === "create_event" ? "event" : "task";
    const titulo = buildDescriptiveTitle({
      intent,
      entities: ent as any,
      originalText: pending.original_content,
    });
    const dueDate = String(ent.date);
    const dueTime = (ent.start_time as string) || null;
    const contextoNotas: string[] = [];
    if (ent.location) contextoNotas.push(`Local: ${ent.location}`);
    if (ent.property_type) contextoNotas.push(`Imóvel: ${ent.property_type}`);
    if (typeof ent.property_value === "number") contextoNotas.push(`Valor: ${formatEuro(ent.property_value)}`);
    if (ent.person_title && ent.person_name) contextoNotas.push(`Contacto: ${ent.person_title} ${ent.person_name}`);
    if (ent.notes) contextoNotas.push(String(ent.notes));
    const notasFinais = contextoNotas.length ? contextoNotas.join("\n") : null;
    const { data: fu, error } = await supabase
      .from("follow_ups")
      .insert({
        user_id: userId,
        title: titulo,
        type: tipoDb,
        due_date: dueDate,
        due_time: dueTime,
        person_id: pessoaId,
        priority: "Média",
        status: "Pendente",
        notes: notasFinais,
        related_property_id: (payload.target_property_id as string) || null,
        ...assessorSourceColumns({
          channel,
          sourceMessageId: pending.source_message_id ?? null,
          pendingActionId: pending.id,
        }),
      } as never)
      .select("id")
      .single();
    if (error) throw error;
    const resourceId = (fu as any)?.id as string | undefined;
    if (!resourceId) throw new Error("INSERT em follow_ups não devolveu id");
    // Confirmar que o registo existe antes de responder "Feito".
    const { data: verify, error: verifyErr } = await supabase
      .from("follow_ups")
      .select("id")
      .eq("id", resourceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (verifyErr || !verify) throw new Error("Registo não encontrado após INSERT");
    await markPendingActionStatus(supabase, pending.id, "executed", {
      created_resource_type: "follow_up",
      created_resource_id: resourceId,
    });
    await upsertConversationState(supabase, {
      userId,
      channel,
      pendingActionId: null,
      activeTopic: null,
      lastIntent: intent,
      lastCreatedResourceType: "follow_up",
      lastCreatedResourceId: resourceId,
      stateSummary: `criou ${intent === "create_event" ? "evento" : "tarefa"} para ${naturalWhen(dueDate, dueTime)}`,
    });
    await supabase
      .from("assessor_messages")
      .update({
        status: "confirmed",
        related_resource_type: "follow_up",
        related_resource_id: resourceId,
        structured_payload: { ...payload, __entidadeId: resourceId } as never,
      } as never)
      .eq("related_pending_action_id", pending.id);
    const quando = naturalWhen(dueDate, dueTime);
    const tipoLabel = intent === "create_event" ? (ent.event_type || "evento") : "seguimento";
    return { reply: `Feito. Registei ${articleFor(String(tipoLabel))} ${tipoLabel} para ${quando}.` };
  }

  if (intent === "record_interaction") {
    const { error } = await supabase.from("interactions").insert({
      user_id: userId,
      person_id: pessoaId,
      source_channel: "whatsapp",
      summary: (ent.notes as string) || (ent.title as string) || (payload.textoOriginal as string) || "",
      original_content: (payload.textoOriginal as string) || null,
      occurred_at: new Date().toISOString(),
    } as never);
    if (error) throw error;
    await markPendingActionStatus(supabase, pending.id, "executed", { created_resource_type: "interaction" });
    await upsertConversationState(supabase, {
      userId,
      channel,
      pendingActionId: null,
      activeTopic: null,
      lastIntent: intent,
      stateSummary: "registou conversa",
    });
    await supabase
      .from("assessor_messages")
      .update({ status: "confirmed" } as never)
      .eq("related_pending_action_id", pending.id);
    return { reply: "Feito. Registei a conversa." };
  }

  await markPendingActionStatus(supabase, pending.id, "executed");
  return { reply: "Feito." };
}

// -------- Fluxo progressivo: classificação de ficheiro → lembrete --------

async function handleFileClassificationTurn(
  supabase: any,
  userId: string,
  channel: string,
  pending: PendingActionRow,
  trimmed: string,
  trimmedRaw: string,
  now: Date,
): Promise<EngineOutcome | null> {
  const payload = (pending.structured_payload ?? {}) as Record<string, any>;
  const q = pending.current_question ?? "file_description";
  const fileId: string | null = payload.file_id ?? null;
  const label: string = payload.file_label ?? "ficheiro";
  const article: string = payload.file_article ?? "o";

  // Cancelamento em qualquer altura do fluxo.
  if (isCancelText(trimmed)) {
    await markPendingActionStatus(supabase, pending.id, "cancelled");
    await upsertConversationState(supabase, {
      userId,
      channel,
      pendingActionId: null,
      activeTopic: null,
      stateSummary: "utilizador não quis lembrete sobre o ficheiro",
    });
    return { reply: `Ok, deixo ${article} ${label} em Diversos → Ficheiros sem lembrete.` };
  }

  if (q === "file_description") {
    const description = trimmedRaw.trim();
    if (!description) return { reply: `A que se refere ${article === "a" ? "esta" : "este"} ${label}?` };
    // Guarda a descrição no ficheiro.
    if (fileId) {
      await supabase
        .from("uploaded_files")
        .update({ user_description: description } as never)
        .eq("id", fileId);
    }
    // Se a descrição sugere um imóvel, entra no fluxo de imóvel em vez de lembrete.
    if (detectPropertyContext(description)) {
      const fields = extractPropertyFields(description);
      const docType = guessDocumentType(payload.original_file_name, payload.mime_type || "");
      if (fileId && docType) {
        await supabase
          .from("uploaded_files")
          .update({ document_type: docType } as never)
          .eq("id", fileId);
      }
      const matches = await findMatchingProperties(supabase, userId, fields);
      const proposedTitle = buildPropertyTitle(fields);
      const newPayload = {
        ...payload,
        user_description: description,
        __intent: "create_property",
        property_fields: fields,
        matches,
        document_type: docType,
      } as Record<string, any>;
      let reply: string;
      if (matches.length > 0) {
        const m = matches[0];
        reply = `Já tens ${m.title}${m.asking_price ? ` por ${formatEuro(m.asking_price)}` : ""}. Este documento pertence a esse imóvel?`;
        newPayload.__intent = "associate_property_to_file";
        newPayload.target_property_id = m.id;
      } else {
        reply = `Percebi. Queres que crie o imóvel "${proposedTitle}" e associe este ${label}?`;
      }
      await updatePendingActionPayload(supabase, pending.id, newPayload, {
        status: "pending_confirmation",
        pending_question: reply,
        current_question: "property_confirmation",
      });
      return { reply };
    }
    const newPayload = { ...payload, user_description: description };
    const reply = `Percebi: ${description}. Vou guardar este ${label}. Queres que te lembre de tratar disso?`;
    await updatePendingActionPayload(supabase, pending.id, newPayload, {
      status: "collecting_information",
      pending_question: reply,
      current_question: "reminder_confirmation",
    });
    return { reply };
  }

  if (q === "property_confirmation") {
    if (isConfirmText(trimmed)) {
      // Executa criação/associação imediatamente.
      return await executePendingProperty(supabase, userId, channel, pending);
    }
    // Resposta ambígua — enriquece a ficha pendente. Se o consultor
    // indica um título explícito ("Imóvel 'T2 Oliveira Douro'"), esse
    // valor prevalece sobre o título automático anterior.
    const extra = extractPropertyFields(trimmedRaw);
    const merged: PropertyFields = { ...(payload.property_fields ?? {}), ...extra };
    // extra.title já entra por spread; garantimos que não se perde.
    if (extra.title) merged.title = extra.title;
    if (extra.status) merged.status = extra.status;
    const newTitle = buildPropertyTitle(merged);
    const fileSuffix = payload.file_id ? " e associe o documento" : "";
    const reply = extra.title
      ? `Percebi. Vou criar o imóvel "${newTitle}"${fileSuffix}. Confirmas?`
      : `Queres que crie o imóvel "${newTitle}"${fileSuffix}?`;
    await updatePendingActionPayload(
      supabase,
      pending.id,
      { ...payload, property_fields: merged },
      { status: "pending_confirmation", pending_question: reply, current_question: "property_confirmation" },
    );
    return { reply };
  }

  if (q === "reminder_confirmation") {
    // Se a mensagem já traz data/hora, salta para criação directa.
    const resolved = resolveDateTimeFromText(trimmed, now);
    if (resolved.date || resolved.time) {
      return await createFileReminder(supabase, userId, channel, pending, resolved);
    }
    const wantsReminder =
      isConfirmText(trimmed) || /\b(lembra|lembrar|lembrete|avisa|avisar|recorda)/i.test(trimmed);
    if (wantsReminder) {
      const reply = "Quando queres que te lembre?";
      await updatePendingActionPayload(supabase, pending.id, payload, {
        status: "collecting_information",
        pending_question: reply,
        current_question: "reminder_datetime",
      });
      return { reply };
    }
    // Resposta ambígua — pergunta de forma clara.
    return { reply: `Queres que te lembre de tratar ${article === "a" ? "desta" : "deste"} ${label}? Diz sim ou não.` };
  }

  if (q === "reminder_datetime") {
    const resolved = resolveDateTimeFromText(trimmed, now);
    if (!resolved.date && !resolved.time) {
      return { reply: 'Não percebi a data. Podes indicar por exemplo "amanhã às 10h"?' };
    }
    return await createFileReminder(supabase, userId, channel, pending, resolved);
  }

  return null;
}

async function createFileReminder(
  supabase: any,
  userId: string,
  channel: string,
  pending: PendingActionRow,
  resolved: { date: string | null; time: string | null },
): Promise<EngineOutcome> {
  const payload = (pending.structured_payload ?? {}) as Record<string, any>;
  const fileId: string | null = payload.file_id ?? null;
  const description: string = payload.user_description ?? payload.original_file_name ?? "este ficheiro";
  const label: string = payload.file_label ?? "ficheiro";

  if (!resolved.date) {
    // Só tempo — assume hoje se ainda for futuro; caso contrário amanhã.
    const today = new Date().toISOString().slice(0, 10);
    resolved = { ...resolved, date: today };
  }

  const titulo = `Tratar de ${description}`.slice(0, 200);
  const notas = `Ficheiro: ${payload.original_file_name ?? label}\nDescrição: ${description}`;

  const { data: fu, error } = await supabase
    .from("follow_ups")
    .insert({
      user_id: userId,
      title: titulo,
      type: "task",
      due_date: resolved.date,
      due_time: resolved.time ?? null,
      priority: "Média",
      status: "Pendente",
      notes: notas,
      related_file_id: fileId,
      ...assessorSourceColumns({
        channel,
        sourceMessageId: pending.source_message_id ?? null,
        pendingActionId: pending.id,
      }),
    } as never)
    .select("id")
    .single();
  if (error) {
    await markPendingActionStatus(supabase, pending.id, "failed", { error_message: error.message });
    return { reply: "Não consegui criar o lembrete. Tenta novamente." };
  }
  const resourceId = (fu as any).id as string;

  // Liga o ficheiro ao lembrete criado.
  if (fileId) {
    await supabase
      .from("uploaded_files")
      .update({
        related_resource_type: "follow_up",
        related_resource_id: resourceId,
      } as never)
      .eq("id", fileId);
  }

  await markPendingActionStatus(supabase, pending.id, "executed", {
    created_resource_type: "follow_up",
    created_resource_id: resourceId,
  });
  await upsertConversationState(supabase, {
    userId,
    channel,
    pendingActionId: null,
    activeTopic: null,
    lastIntent: "create_follow_up",
    lastCreatedResourceType: "follow_up",
    lastCreatedResourceId: resourceId,
    stateSummary: `criou lembrete a partir de ficheiro para ${naturalWhen(resolved.date!, resolved.time)}`,
  });

  const quando = naturalWhen(resolved.date!, resolved.time);
  return { reply: `Feito. ${capitalize(quando)} lembro-te de tratar de ${description}.` };
}

// -------- Fluxo de imóveis: enriquecimento, proposta e execução --------

async function handleActivePropertyEnrichment(
  supabase: any,
  userId: string,
  channel: string,
  convState: any,
  trimmed: string,
  trimmedRaw: string,
): Promise<EngineOutcome | null> {
  const propertyId = convState?.last_property_id || (convState?.last_entity_type === "property" ? convState?.last_entity_id : null);
  if (!propertyId) return null;

  // Mudança de imóvel — limpa entidade ativa.
  if (NEW_PROPERTY_RE.test(trimmed)) {
    await upsertConversationState(supabase, {
      userId, channel,
      activeTopic: null,
      lastEntityType: null,
      lastEntityId: null,
      lastPropertyId: null,
      stateSummary: "utilizador vai enviar outro imóvel",
    } as any);
    return { reply: "Claro. Envia-me os dados ou o documento do outro imóvel." };
  }

  // Se a mensagem não tem contexto imobiliário nem referente ("este", "a angariação"),
  // devolve null para o fluxo normal continuar.
  const hasContext = detectPropertyContext(trimmed) || PROPERTY_REFERENT_RE.test(trimmed);
  const fields = extractPropertyFields(trimmedRaw);
  const hasAnyField = Object.values(fields).some((v) => v !== undefined && v !== null && v !== "");
  if (!hasContext && !hasAnyField) return null;

  // Proprietário — precisa de confirmação e resolução de pessoa.
  if (fields.owner_name) {
    const candidates = await findPeopleByName(supabase, userId, fields.owner_name);
    const addressBit = fields.address ? ` e atualizo a morada para "${fields.address}"` : "";
    let reply: string;
    let payload: Record<string, any> = {
      target_property_id: propertyId,
      owner_name: fields.owner_name,
      candidates,
      patch: fields.address ? { address: fields.address } : {},
    };
    if (candidates.length === 1) {
      payload.person_id = candidates[0].id;
      reply = `Encontrei ${candidates[0].name}. Associo como proprietário${addressBit}?`;
    } else if (candidates.length === 0) {
      reply = `Não tenho ${fields.owner_name} nos teus contactos. Queres que crie o contacto e associe como proprietário${addressBit}?`;
      payload.create_person = true;
    } else {
      reply = `Encontrei mais do que um: ${candidates.map((c: any) => c.name).join(", ")}. A qual te referes?`;
      // Sem execução; deixa a IA / próxima mensagem esclarecer.
      return { reply };
    }
    await createPendingAction(supabase, {
      userId, channel,
      intent: "set_property_owner",
      originalContent: trimmedRaw,
      payload,
      pendingQuestion: reply,
      currentQuestion: "owner_confirmation",
    });
    return { reply, messageType: "__ALREADY_PERSISTED__" };
  }

  // Alterações de estado comercial — aplica-se directamente.
  if (fields.status) {
    try {
      await updatePropertyPatch(supabase, userId, propertyId, { status: fields.status });
      const { propertyStatusLabel } = await import("./properties.server");
      return { reply: `Feito. Marquei o imóvel como "${propertyStatusLabel(fields.status)}".` };
    } catch {
      return { reply: "Não consegui atualizar o estado do imóvel." };
    }
  }

  // Título explícito — aplica sem pedir confirmação (é uma correção de nome).
  if (fields.title) {
    try {
      await updatePropertyPatch(supabase, userId, propertyId, { title: fields.title });
      return { reply: `Feito. Renomeei o imóvel para "${fields.title}".` };
    } catch {
      return { reply: "Não consegui atualizar o nome do imóvel." };
    }
  }

  // Alterações sensíveis: preço ou morada — pedir confirmação.
  const sensitive: PropertyFields = {};
  if (fields.asking_price != null) sensitive.asking_price = fields.asking_price;
  if (fields.address) sensitive.address = fields.address;
  if (Object.keys(sensitive).length > 0) {
    const bits: string[] = [];
    if (sensitive.asking_price != null) bits.push(`preço ${formatEuro(sensitive.asking_price)}`);
    if (sensitive.address) bits.push(`morada "${sensitive.address}"`);
    const reply = `Confirmas que atualizo ${bits.join(" e ")} neste imóvel?`;
    await createPendingAction(supabase, {
      userId, channel,
      intent: "update_property",
      originalContent: trimmedRaw,
      payload: { target_property_id: propertyId, patch: sensitive },
      pendingQuestion: reply,
      currentQuestion: "property_update_confirmation",
    });
    return { reply, messageType: "__ALREADY_PERSISTED__" };
  }

  // Campos não-sensíveis — aplica directamente.
  const patch: Record<string, unknown> = {};
  if (fields.typology) patch.typology = fields.typology;
  if (fields.property_type) patch.property_type = fields.property_type;
  if (fields.city) patch.city = fields.city;
  if (fields.location && !fields.city) patch.location = fields.location;
  if (fields.area_useful != null) patch.area_useful = fields.area_useful;
  if (fields.bedrooms != null) patch.bedrooms = fields.bedrooms;
  if (fields.bathrooms != null) patch.bathrooms = fields.bathrooms;
  if (fields.parking != null) patch.parking = fields.parking;
  if (fields.energy_rating) patch.energy_rating = fields.energy_rating;

  if (Object.keys(patch).length === 0) {
    // Contexto imobiliário sem dados novos — guarda em notas.
    const { data: cur } = await supabase.from("properties").select("notes").eq("id", propertyId).maybeSingle();
    const prevNotes = (cur as any)?.notes ?? "";
    const newNotes = prevNotes ? `${prevNotes}\n${trimmedRaw}` : trimmedRaw;
    try {
      await updatePropertyPatch(supabase, userId, propertyId, { notes: newNotes });
      return { reply: "Anotado." };
    } catch {
      return { reply: "Anotado." };
    }
  }
  try {
    const changed = await updatePropertyPatch(supabase, userId, propertyId, patch);
    if (changed.length === 0) return { reply: "Anotado." };
    const parts = changed.map((k) => humanFieldLabel(k)).filter(Boolean);
    return { reply: `Feito. Atualizei ${parts.join(", ")}.` };
  } catch (err) {
    return { reply: "Não consegui atualizar o imóvel. Tenta novamente." };
  }
}

function humanFieldLabel(key: string): string {
  switch (key) {
    case "typology": return "a tipologia";
    case "property_type": return "o tipo";
    case "city": return "a cidade";
    case "location": return "a localização";
    case "area_useful": return "a área útil";
    case "area_gross": return "a área bruta";
    case "bedrooms": return "os quartos";
    case "bathrooms": return "as casas de banho";
    case "parking": return "o estacionamento";
    case "energy_rating": return "o certificado energético";
    case "asking_price": return "o preço";
    case "address": return "a morada";
    case "notes": return "as notas";
    default: return "";
  }
}

async function proposePropertyFromMessage(
  supabase: any,
  userId: string,
  channel: string,
  originalText: string,
  fields: PropertyFields,
  fileId: string | null,
): Promise<EngineOutcome | null> {
  const matches = await findMatchingProperties(supabase, userId, fields);
  const title = buildPropertyTitle(fields);
  let reply: string;
  let payload: Record<string, any> = {
    __intent: "create_property",
    property_fields: fields,
    matches,
    file_id: fileId,
  };
  if (matches.length > 0) {
    const m = matches[0];
    payload.__intent = "associate_property_to_file";
    payload.target_property_id = m.id;
    reply = fileId
      ? `Já tens ${m.title}. Este documento pertence a esse imóvel?`
      : `Já tens ${m.title}. É a este imóvel que te referes?`;
  } else {
    reply = fileId
      ? `Queres que crie o imóvel "${title}" e associe este documento?`
      : `Queres que crie o imóvel "${title}"?`;
  }
  const pendingRow = await createPendingAction(supabase, {
    userId, channel,
    intent: (payload.__intent as string),
    originalContent: originalText,
    payload,
    pendingQuestion: reply,
    currentQuestion: "property_confirmation",
  });
  await upsertConversationState(supabase, {
    userId, channel,
    activeTopic: "property",
    lastIntent: payload.__intent as string,
    pendingActionId: pendingRow?.id ?? null,
  });
  return { reply, messageType: "__ALREADY_PERSISTED__" };
}

async function executePendingProperty(
  supabase: any,
  userId: string,
  channel: string,
  pending: PendingActionRow,
): Promise<EngineOutcome> {
  const payload = (pending.structured_payload ?? {}) as Record<string, any>;
  const intent = (payload.__intent as string) || pending.intent;

  // create_property (+ opcional associação de ficheiro)
  if (intent === "create_property") {
    const fields = (payload.property_fields ?? {}) as PropertyFields;
    const created = await createPropertyFromFields(supabase, userId, fields, {
      channel,
      sourceMessageId: null,
      notes: payload.user_description ?? null,
    });
    if (!created) {
      await markPendingActionStatus(supabase, pending.id, "failed", { error_message: "insert properties failed" });
      return { reply: "Não consegui criar o imóvel. Tenta novamente." };
    }
    const fileId: string | null = payload.file_id ?? null;
    if (fileId) {
      await supabase
        .from("uploaded_files")
        .update({
          related_resource_type: "property",
          related_resource_id: created.id,
          document_type: payload.document_type ?? null,
        } as never)
        .eq("id", fileId);
    }
    await markPendingActionStatus(supabase, pending.id, "executed", {
      created_resource_type: "property",
      created_resource_id: created.id,
    });
    await upsertConversationState(supabase, {
      userId, channel,
      activeTopic: "property",
      lastEntityType: "property",
      lastEntityId: created.id,
      lastPropertyId: created.id,
      lastIntent: "create_property",
      lastCreatedResourceType: "property",
      lastCreatedResourceId: created.id,
      pendingActionId: null,
      stateSummary: `imóvel activo: ${created.title}`,
    } as any);
    const suffix = fileId ? " e associei o documento" : "";
    const { propertyStatusLabel } = await import("./properties.server");
    const statusLabel = propertyStatusLabel(fields.status ?? "em_angariacao").toLowerCase();
    const reply = `Feito. Criei o imóvel "${created.title}", em fase de ${statusLabel}${suffix}. Queres acrescentar a morada ou o proprietário?`;
    // Cria um pending leve para intercetar "sim"/"não" à pergunta acima
    // sem exigir passagem pela IA. "não" responde apenas "Está bem." e
    // não altera o imóvel nem o ficheiro.
    await createPendingAction(supabase, {
      userId, channel,
      intent: "await_property_details",
      originalContent: "",
      payload: { target_property_id: created.id },
      pendingQuestion: reply,
      currentQuestion: "await_property_details",
    });
    return { reply };
  }

  if (intent === "associate_property_to_file") {
    const propertyId = payload.target_property_id as string;
    const fileId: string | null = payload.file_id ?? null;
    if (fileId) {
      await supabase
        .from("uploaded_files")
        .update({
          related_resource_type: "property",
          related_resource_id: propertyId,
          document_type: payload.document_type ?? null,
        } as never)
        .eq("id", fileId);
    }
    await markPendingActionStatus(supabase, pending.id, "executed", {
      created_resource_type: "property",
      created_resource_id: propertyId,
    });
    await upsertConversationState(supabase, {
      userId, channel,
      activeTopic: "property",
      lastEntityType: "property",
      lastEntityId: propertyId,
      lastPropertyId: propertyId,
      pendingActionId: null,
    } as any);
    return { reply: "Feito. Associei o documento ao imóvel." };
  }

  if (intent === "update_property") {
    const propertyId = payload.target_property_id as string;
    const patch = (payload.patch ?? {}) as Record<string, unknown>;
    try {
      const changed = await updatePropertyPatch(supabase, userId, propertyId, patch);
      await markPendingActionStatus(supabase, pending.id, "executed", {
        created_resource_type: "property",
        created_resource_id: propertyId,
      });
      const bits: string[] = [];
      if (patch.address) bits.push(`a morada para "${patch.address}"`);
      if (patch.asking_price != null) bits.push(`o preço para ${formatEuro(Number(patch.asking_price))}`);
      if (patch.status) {
        const { propertyStatusLabel } = await import("./properties.server");
        bits.push(`o estado para "${propertyStatusLabel(String(patch.status))}"`);
      }
      if (bits.length === 0) return { reply: changed.length ? "Feito. Atualizei o imóvel." : "Sem alterações." };
      return { reply: `Feito. Atualizei ${bits.join(" e ")}.` };
    } catch {
      await markPendingActionStatus(supabase, pending.id, "failed");
      return { reply: "Não consegui atualizar o imóvel." };
    }
  }

  if (intent === "set_property_owner") {
    const propertyId = payload.target_property_id as string;
    let personId: string | null = payload.person_id ?? null;
    if (!personId && payload.create_person && payload.owner_name) {
      const { data: p } = await supabase
        .from("people")
        .insert({ user_id: userId, name: payload.owner_name } as never)
        .select("id")
        .single();
      personId = (p as any)?.id ?? null;
    }
    if (!personId) {
      await markPendingActionStatus(supabase, pending.id, "failed");
      return { reply: "Não consegui associar o proprietário." };
    }
    try {
      const patch: Record<string, unknown> = { owner_person_id: personId };
      const extraPatch = (payload.patch ?? {}) as Record<string, unknown>;
      for (const [k, v] of Object.entries(extraPatch)) if (v != null && v !== "") patch[k] = v;
      await updatePropertyPatch(supabase, userId, propertyId, patch);
      await markPendingActionStatus(supabase, pending.id, "executed", {
        created_resource_type: "property",
        created_resource_id: propertyId,
      });
      const ownerName = (payload.owner_name as string) || "o proprietário";
      const addr = (payload.patch?.address as string) || null;
      const bits: string[] = [];
      if (addr) bits.push(`atualizei a morada para "${addr}"`);
      bits.push(`associei ${ownerName} como proprietário`);
      return { reply: `Feito. ${bits.join(" e ")}.` };
    } catch {
      await markPendingActionStatus(supabase, pending.id, "failed");
      return { reply: "Não consegui associar o proprietário." };
    }
  }

  return { reply: "Feito." };
}