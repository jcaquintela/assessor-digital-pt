// Motor central do Assessor — independente do canal.
// Recebe uma mensagem já persistida (role=user) e devolve a resposta
// que o adaptador de canal (WhatsApp, web, Telegram) deve enviar.
//
// Efeitos: pode criar registos (follow_ups) quando o utilizador confirma
// um rascunho pendente. NÃO envia mensagens — apenas devolve texto e,
// opcionalmente, os campos para persistir a resposta do assessor.

import { parse } from "./parser";

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
  "Recebi a tua mensagem. Neste momento consigo registar visitas e reuniões — por exemplo: “Amanhã tenho visita às 15h com a Ana.”";

const RE_CONFIRM = /^\s*(sim|confirma(r|do)?|confirmo|regista(r)?|ok|okay|okey|pode ser|claro|faz isso|isso mesmo|correto|certo)\b/i;
const RE_CANCEL = /^\s*(n[ãa]o|cancela(r)?|esquece|deixa|nada disso|errado)\b/i;

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

  if (!userId) {
    return { reply: REPLY_UNASSOCIATED };
  }

  const trimmed = content.trim();

  // 1) Confirmação / cancelamento de rascunho pendente
  const draft = await findLatestDraft(supabase, userId, channel);

  if (draft && RE_CONFIRM.test(trimmed)) {
    return await confirmDraft(supabase, userId, draft);
  }
  if (draft && RE_CANCEL.test(trimmed)) {
    await supabase
      .from("assessor_messages")
      .update({ status: "cancelled" } as never)
      .eq("id", draft.id);
    return { reply: "Ok, não registei nada." };
  }

  // 2) Nova intenção — por agora, apenas eventos/visitas com data
  const parsed = parse(trimmed);
  const tipoEvento = detectTipoEvento(trimmed);

  if (parsed.intencao === "seguimento" && parsed.data && (tipoEvento || parsed.hora)) {
    return await proposeEvent(supabase, userId, channel, {
      texto: trimmed,
      tipoEvento: tipoEvento || (parsed.hora ? "evento" : "seguimento"),
      data: parsed.data,
      hora: parsed.hora,
      nome: parsed.nome,
    });
  }

  return { reply: REPLY_FALLBACK };
}

async function proposeEvent(
  supabase: any,
  userId: string,
  channel: string,
  ev: { texto: string; tipoEvento: string; data: string; hora?: string; nome?: string },
): Promise<EngineOutcome> {
  let pessoaId: string | null = null;
  let candidates: { id: string; name: string }[] = [];
  let ambiguo = false;
  let inexistente = false;

  if (ev.nome) {
    candidates = await findPeopleByName(supabase, userId, ev.nome);
    if (candidates.length === 1) pessoaId = candidates[0].id;
    else if (candidates.length > 1) ambiguo = true;
    else inexistente = true;
  }

  const tituloBase =
    ev.tipoEvento && ev.tipoEvento !== "evento" && ev.tipoEvento !== "seguimento"
      ? ev.tipoEvento.charAt(0).toUpperCase() + ev.tipoEvento.slice(1)
      : "Evento";
  const titulo = ev.nome ? `${tituloBase} com ${ev.nome}` : tituloBase;

  const payload: Record<string, unknown> = {
    intent: "create_event",
    tipoSeg: "Evento",
    tipoEvento: ev.tipoEvento,
    titulo,
    nomePessoa: ev.nome ?? "",
    pessoaId: pessoaId ?? "",
    candidatosPessoa: candidates,
    pessoaAmbigua: ambiguo,
    pessoaInexistente: inexistente,
    data: ev.data,
    hora: ev.hora ?? "",
    prioridade: "Média",
    textoOriginal: ev.texto,
  };

  let reply: string;
  const quando = formatWhen(ev.data, ev.hora);
  const art = articleFor(ev.tipoEvento);
  if (ambiguo) {
    const nomes = candidates.slice(0, 5).map((c) => c.name).join(", ");
    reply = `Encontrei mais do que uma ${ev.nome}. A qual te referes? (${nomes}) — podes responder com o nome completo.`;
  } else if (inexistente && ev.nome) {
    reply = `Não encontrei ${ev.nome} nos teus contactos. Queres que registe ${art} ${ev.tipoEvento} para ${quando} mesmo assim?`;
  } else if (ev.nome) {
    reply = `Entendi: ${quando} tens ${art} ${ev.tipoEvento} com ${ev.nome}. Queres que registe?`;
  } else {
    reply = `Entendi: ${quando} tens ${art} ${ev.tipoEvento}. Queres que registe?`;
  }

  await supabase.from("assessor_messages").insert({
    user_id: userId,
    role: "assessor",
    content: reply,
    message_type: "seguimento",
    structured_payload: payload as never,
    status: "draft",
    channel,
  } as never);

  // Return outcome flagged as already-persisted so the caller doesn't
  // double-insert. We still return the reply text for the channel adapter.
  return {
    reply,
    // Sentinel: caller checks this to skip its own insert.
    messageType: "__ALREADY_PERSISTED__",
  };
}

async function confirmDraft(
  supabase: any,
  userId: string,
  draft: { id: string; message_type: string | null; structured_payload: any },
): Promise<EngineOutcome> {
  const payload = (draft.structured_payload ?? {}) as Record<string, any>;

  if (draft.message_type === "seguimento" && payload?.intent === "create_event") {
    const tipoDb = payload.tipoSeg === "Evento" ? "event" : "task";
    const { data: fu, error } = await supabase
      .from("follow_ups")
      .insert({
        user_id: userId,
        title: String(payload.titulo || "Evento"),
        type: tipoDb,
        due_date: String(payload.data),
        due_time: (payload.hora as string) || null,
        person_id: (payload.pessoaId as string) || null,
        priority: (payload.prioridade as string) || "Média",
        status: "Pendente",
        notes: null,
      } as never)
      .select("id")
      .single();
    if (error) throw error;
    const merged = { ...payload, __entidadeId: (fu as any).id };
    await supabase
      .from("assessor_messages")
      .update({ status: "confirmed", structured_payload: merged as never } as never)
      .eq("id", draft.id);
    const quando = formatWhen(String(payload.data), (payload.hora as string) || null);
    const tipo = String(payload.tipoEvento || "evento");
    const art = articleFor(tipo);
    return { reply: `Feito. Registei ${art} ${tipo} para ${quando}.` };
  }

  // Unknown draft type — just mark confirmed
  await supabase
    .from("assessor_messages")
    .update({ status: "confirmed" } as never)
    .eq("id", draft.id);
  return { reply: "Feito." };
}