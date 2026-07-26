// Motor central do Assessor — independente do canal.
// Usa a OpenAI Responses API para interpretar linguagem natural PT-PT e
// devolve uma resposta que o adaptador de canal (WhatsApp, web, Telegram)
// deve enviar. Regista rascunhos em assessor_messages e só cria entidades
// reais após confirmação explícita do utilizador.

import { callAssessorAi, type AiInterpretation, type AiContextMessage } from "./ai.server";
import { sanitizeAssessorName, stripAssessorVocative, ASSESSOR_NAME_DEFAULT } from "./assessor-name";
import { resolveDateTimeFromText, hasExplicitDateTime } from "./date-resolver";
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

export interface EngineInput {
  supabase: any; // service-role client (admin)
  userId: string | null;
  channel: string; // 'whatsapp' | 'web' | 'telegram' | ...
  content: string;
  receivedAt?: Date;
}

export interface EngineOutcome {
  reply: string;
  messageType?: string | null;
  structuredPayload?: Record<string, unknown> | null;
  status?: "draft" | "confirmed" | "cancelled" | null;
}

const REPLY_UNASSOCIATED =
  "Olá. Este número ainda não está associado a uma conta do Assessor. Entra no dashboard e confirma o teu número de WhatsApp.";
const REPLY_FALLBACK =
  "Não percebi bem. Podes reformular?";
const REPLY_AI_DOWN =
  "Recebi a tua mensagem, mas estou com dificuldade em processá-la agora. Tenta novamente dentro de instantes.";
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

// Palavras/expressões curtas de confirmação e cancelamento.
// Interpretadas localmente sempre que existe um rascunho pendente,
// para não depender da IA em "Sim"/"Não" isolados.
const CONFIRM_RE =
  /^\s*(sim(,?\s*(regista|registar|regista isso|faz isso|por favor))?|regista(r)?|regista isso|confirma(r|do)?|pode ser|est[áa] bem|ok(ay|ei)?|claro|com certeza|faz isso|dale|👍|✅|sim!?)\s*[.!]?\s*$/i;
const CANCEL_RE =
  /^\s*(n[ãa]o|nao|cancela(r)?|esquece|deixa|para|n[ãa]o registes|n[ãa]o registar)\s*[.!]?\s*$/i;

// Saudações — respondemos sem chamar a IA.
const GREET_RE =
  /^\s*(ol[áa]|oi|hey|hi|hello|bom\s*dia|boa\s*tarde|boa\s*noite)\b[\s,.!?]*$/i;

// "tenho mais uma", "outra visita", "mais um" — inicia nova recolha.
const MORE_RE = /\b(mais\s+uma|mais\s+um|outra|outro|tenho\s+outra|tenho\s+mais)\b/i;

// Agradecimentos curtos.
const THANKS_RE = /^\s*(obrigad[oa]|obrigadinho|thanks|thank\s*you|valeu|grato|grata)\b[\s,.!?]*$/i;

// Perguntas sobre a área Diversos.
const QUERY_MISC_RE =
  /(diversos|notas?\s+(?:que|deixei|pendentes?)|ideias?\s+(?:que|pendentes?|deixei)|(?:o\s+que\s+)?(?:registei|guardei|escrevi|apontei|deixei)\b.*\b(?:diversos|nota|notas|semana|hoje|ontem|ideias?))/i;

// Prefixos de correção do último evento/proposta.
const CORRECTION_RE =
  /^\s*(n[ãa]o[,.\s]|nao[,.\s]|mas\b|afinal\b|antes\b|corrige\b|corrigir\b|[ée]\s+(às|as|pelas|amanh|hoje|com|na|no|em)|na\s+verdade\b)/i;

function isConfirmText(t: string): boolean {
  return CONFIRM_RE.test(t);
}
function isCancelText(t: string): boolean {
  return CANCEL_RE.test(t);
}
function isGreetOnly(t: string): boolean {
  return GREET_RE.test(t);
}
function looksLikeCorrection(t: string): boolean {
  return CORRECTION_RE.test(t);
}
function isThanks(t: string): boolean {
  return THANKS_RE.test(t);
}
function isQueryMisc(t: string): boolean {
  return QUERY_MISC_RE.test(t);
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
  const d = new Date(iso);
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
  // "a visita", "a reunião", "o almoço", "o jantar", "o encontro", "o café"
  return /^(visita|reuni)/.test(tipo) ? "a" : "o";
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
  const d = new Date(`${date}T00:00:00`);
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
  if (intent === "create_event") {
    const evento = (ent.event_type as string) || "compromisso";
    const when = ent.date ? naturalWhen(String(ent.date), (ent.start_time as string) || null) : null;
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
    const title = (ent.title as string) || "essa tarefa";
    const when = ent.date ? naturalWhen(String(ent.date), (ent.start_time as string) || null) : null;
    const head = when ? `${capitalize(when)}: ${title}` : title;
    return `${head}. Registo?`;
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

  // 0.a) Saudação isolada — resposta natural sem IA.
  if (isGreetOnly(trimmed)) {
    const reply = userFirstName
      ? `Olá, ${userFirstName}. Em que te posso ajudar?`
      : "Olá. Em que te posso ajudar?";
    return { reply };
  }
  if (isThanks(trimmed)) {
    return { reply: "De nada." };
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

  if (pending && isConfirmText(trimmed)) {
    return await confirmPendingSafe(supabase, userId, channel, pending);
  }
  if (pending && isCancelText(trimmed)) {
    await markPendingActionStatus(supabase, pending.id, "cancelled");
    await upsertConversationState(supabase, {
      userId, channel, pendingActionId: null, activeTopic: null,
      stateSummary: "utilizador cancelou a última proposta",
    });
    return { reply: "Ok, não registei nada." };
  }

  // 0.d) Pergunta sobre Diversos — resposta com dados reais.
  if (isQueryMisc(trimmed)) {
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
      if (last && last.created_resource_id) {
        const p = last.structured_payload as any;
        const ent = { ...(p.entities ?? {}) };
        if (correction.date) ent.date = correction.date;
        if (correction.time) ent.start_time = correction.time;
        const updateData: any = {};
        if (correction.date) updateData.due_date = correction.date;
        if (correction.time) updateData.due_time = correction.time;
        const { error } = await supabase
          .from("follow_ups")
          .update(updateData)
          .eq("id", last.created_resource_id)
          .eq("user_id", userId);
        if (!error) {
          await updatePendingActionPayload(supabase, last.id, { ...p, entities: ent });
          const tipoLabel = (ent.event_type || (last.intent === "create_event" ? "visita" : "tarefa")) as string;
          const quando = naturalWhen(String(ent.date), (ent.start_time as string) || null);
          return { reply: `Tens razão. Corrigi ${articleFor(tipoLabel)} ${tipoLabel} para ${quando}.` };
        }
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
    const reply = await queryToday(supabase, userId);
    return { reply };
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
    return await proposeAction(supabase, userId, channel, trimmed, interp);
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

// Remove prefixos técnicos que o modelo por vezes injeta ("Proposta:", "Intenção:", etc.)
function sanitizeReply(reply?: string | null): string {
  if (!reply) return "";
  return reply
    .replace(/^\s*(proposta|intenç[ãa]o|resumo|registo pendente|payload|a[cç][ãa]o( estruturada)?)\s*[:\-–—]\s*/i, "")
    .trim();
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
): Promise<EngineOutcome> {
  const ent = interp.entities;

  // Resolução de pessoa (o backend, não a IA)
  let pessoaId: string | null = null;
  let candidates: { id: string; name: string }[] = [];
  let personName: string | null = null;
  if (ent.person_name) {
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
  const today = new Date();
  const ymd = today.toISOString().slice(0, 10);
  const { data } = await supabase
    .from("follow_ups")
    .select("title, type, due_time, status")
    .eq("user_id", userId)
    .eq("due_date", ymd)
    .neq("status", "Concluído")
    .order("due_time", { ascending: true, nullsFirst: false });
  const rows = (data as any[]) ?? [];
  if (rows.length === 0) return "Hoje não tens nada agendado.";
  const linhas = rows.slice(0, 8).map((r) => {
    const h = r.due_time ? `${String(r.due_time).slice(0, 5)} — ` : "";
    return `• ${h}${r.title}`;
  });
  return `Hoje tens:\n${linhas.join("\n")}`;
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
    await markPendingActionStatus(supabase, pending.id, "failed", {
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

  if (intent === "create_event" || intent === "create_follow_up") {
    if (!ent.date) {
      await markPendingActionStatus(supabase, pending.id, "collecting_information");
      return { reply: "Falta a data. Para quando é?" };
    }
    const tipoDb = intent === "create_event" ? "event" : "task";
    let titulo = String(ent.title || "").trim();
    if (!titulo) {
      if (intent === "create_event") {
        const evento = capitalize(String(ent.event_type || "Visita"));
        const parts = [evento];
        if (ent.property_type) parts.push(`— ${ent.property_type}`);
        if (ent.location) parts.push(ent.property_type ? String(ent.location) : `— ${ent.location}`);
        titulo = parts.join(" ");
      } else {
        titulo = "Tarefa";
      }
    }
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
      } as never)
      .select("id")
      .single();
    if (error) throw error;
    const resourceId = (fu as any).id as string;
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