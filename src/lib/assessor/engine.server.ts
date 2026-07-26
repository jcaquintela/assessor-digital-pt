// Motor central do Assessor — independente do canal.
// Usa a OpenAI Responses API para interpretar linguagem natural PT-PT e
// devolve uma resposta que o adaptador de canal (WhatsApp, web, Telegram)
// deve enviar. Regista rascunhos em assessor_messages e só cria entidades
// reais após confirmação explícita do utilizador.

import { callAssessorAi, type AiInterpretation, type AiContextMessage } from "./ai.server";
import { sanitizeAssessorName, stripAssessorVocative, ASSESSOR_NAME_DEFAULT } from "./assessor-name";

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

async function findLatestDraft(supabase: any, userId: string, channel: string) {
  const { data } = await supabase
    .from("assessor_messages")
    .select("id, message_type, structured_payload, created_at")
    .eq("user_id", userId)
    .eq("channel", channel)
    .eq("role", "assessor")
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as any) ?? null;
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

  // Contexto: perfil, últimas mensagens, rascunho pendente
  const [{ data: prof }, recent, draft] = await Promise.all([
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
    findLatestDraft(supabase, userId, channel),
  ]);

  const assessorNameRaw = (prof as any)?.assessor_name;
  const assessorName = sanitizeAssessorName(assessorNameRaw ?? "") || ASSESSOR_NAME_DEFAULT;
  // Remove o nome do Assessor quando usado como vocativo, para não poluir a interpretação.
  const trimmed = stripAssessorVocative(trimmedRaw, assessorName);

  const recentMsgs: AiContextMessage[] = ((recent?.data ?? []) as any[])
    .reverse()
    .filter((m) => m.role === "user" || m.role === "assessor")
    .map((m) => ({ role: m.role as "user" | "assessor", content: String(m.content ?? "") }));

  const pendingAction = draft
    ? {
        intent: (draft.structured_payload as any)?.__intent ?? "unknown",
        entities: ((draft.structured_payload as any)?.entities ?? {}) as Record<string, unknown>,
      }
    : null;

  const ai = await callAssessorAi({
    content: trimmed,
    now: input.receivedAt ?? new Date(),
    timezone: "Europe/Lisbon",
    locale: "pt-PT",
    userName: (prof as any)?.name ?? null,
    assessorName,
    recent: recentMsgs,
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

  // 1) confirm / cancel de rascunho pendente
  if (draft && interp.intent === "confirm") {
    return await confirmDraft(supabase, userId, draft);
  }
  if (draft && interp.intent === "cancel") {
    await supabase.from("assessor_messages").update({ status: "cancelled" } as never).eq("id", draft.id);
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

  // 3) propostas com confirmação
  if (interp.intent === "create_event" || interp.intent === "create_follow_up" || interp.intent === "record_interaction") {
    return await proposeAction(supabase, userId, channel, trimmed, interp);
  }

  // 4) fallback
  return { reply: interp.reply?.trim() || REPLY_FALLBACK };
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
  if (ent.person_name) {
    candidates = await findPeopleByName(supabase, userId, ent.person_name);
    if (candidates.length === 1) pessoaId = candidates[0].id;
  }

  const reply = interp.reply?.trim() || "Queres que registe?";

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

  await supabase.from("assessor_messages").insert({
    user_id: userId,
    role: "assessor",
    content: reply,
    message_type: cartaoTipo,
    structured_payload: payload as never,
    status: "draft",
    channel,
  } as never);

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

async function confirmDraft(
  supabase: any,
  userId: string,
  draft: { id: string; message_type: string | null; structured_payload: any },
): Promise<EngineOutcome> {
  const payload = (draft.structured_payload ?? {}) as Record<string, any>;
  const intent = payload.__intent as string | undefined;
  const ent = (payload.entities ?? {}) as Record<string, any>;
  const pessoaId = (payload.pessoaId as string) || null;

  if (intent === "create_event" || intent === "create_follow_up") {
    const tipoDb = intent === "create_event" ? "event" : "task";
    const titulo = String(ent.title || (intent === "create_event" ? "Evento" : "Tarefa"));
    const dueDate = String(ent.date || new Date().toISOString().slice(0, 10));
    const dueTime = (ent.start_time as string) || null;
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
        notes: (ent.notes as string) || null,
      } as never)
      .select("id")
      .single();
    if (error) throw error;
    await supabase
      .from("assessor_messages")
      .update({ status: "confirmed", structured_payload: { ...payload, __entidadeId: (fu as any).id } as never } as never)
      .eq("id", draft.id);
    const quando = formatWhen(dueDate, dueTime);
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
    await supabase.from("assessor_messages").update({ status: "confirmed" } as never).eq("id", draft.id);
    return { reply: "Feito. Registei a conversa." };
  }

  await supabase.from("assessor_messages").update({ status: "confirmed" } as never).eq("id", draft.id);
  return { reply: "Feito." };
}