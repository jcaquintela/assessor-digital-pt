// Canal admin → consultor: envio da pergunta, captura da resposta e leitura
// no painel. Toda a escrita passa por aqui (nunca pelo motor do Afonso).

import {
  ADMIN_MESSAGE_WINDOW_HOURS,
  ADMIN_REPLY_ACK,
  OUT_OF_WINDOW_WARNING,
  type AdminMessageRow,
  effectiveState,
  formatAdminQuestion,
  isSessionOpen,
  pickPendingForConsultant,
  windowExpiryFrom,
} from "./admin-messages";

export type SendQuestionResult =
  | { ok: true; id: string; horasSemContacto: number | null }
  | { ok: false; motivo: "sem_whatsapp" | "fora_de_janela" | "envio_falhou"; aviso: string };

/** Fecha perguntas cuja janela já passou (estado passa a 'expirada'). */
export async function expireStaleAdminMessages(
  supabaseAdmin: any,
  consultorId?: string,
): Promise<void> {
  let q = supabaseAdmin
    .from("admin_messages")
    .update({ estado: "expirada" } as never)
    .eq("estado", "pendente")
    .lte("janela_expira_em", new Date().toISOString());
  if (consultorId) q = q.eq("consultor_id", consultorId);
  await q;
}

/** Estado da janela de sessão WhatsApp deste consultor (para avisar a UI). */
export async function getSessionWindow(
  supabaseAdmin: any,
  consultorId: string,
): Promise<{ horas: number | null; aberta: boolean; telefone: string | null }> {
  const { hoursSinceLastInbound } = await import("@/lib/whatsapp/pricing.server");
  const { resolveInviteTarget } = await import("./invite-send.server");
  const [horas, alvo] = await Promise.all([
    hoursSinceLastInbound(supabaseAdmin, consultorId, "whatsapp"),
    resolveInviteTarget(supabaseAdmin, consultorId, "whatsapp"),
  ]);
  return { horas, aberta: isSessionOpen(horas), telefone: alvo.externalId };
}

export async function sendAdminQuestion(
  supabaseAdmin: any,
  adminId: string,
  input: { consultorId: string; pergunta: string },
): Promise<SendQuestionResult> {
  const janela = await getSessionWindow(supabaseAdmin, input.consultorId);
  if (!janela.telefone) {
    return {
      ok: false,
      motivo: "sem_whatsapp",
      aviso: "Esta conta não tem um número de WhatsApp válido associado.",
    };
  }
  if (!janela.aberta) {
    return { ok: false, motivo: "fora_de_janela", aviso: OUT_OF_WINDOW_WARNING };
  }

  const { sendWhatsAppText } = await import("@/lib/whatsapp/send.server");
  const envio = await sendWhatsAppText(janela.telefone, formatAdminQuestion(input.pergunta), {
    triggeredBy: adminId,
    kind: "auto",
    meta: {
      purpose: "admin_question",
      outsideWindow: false,
      hoursSinceLastInbound: janela.horas,
    },
  });
  if (!envio.ok) {
    return {
      ok: false,
      motivo: "envio_falhou",
      aviso: `A Meta recusou a mensagem: ${envio.error}`,
    };
  }

  const agora = new Date();
  const { data, error } = await supabaseAdmin
    .from("admin_messages")
    .insert({
      consultor_id: input.consultorId,
      admin_id: adminId,
      pergunta: input.pergunta.trim(),
      enviado_em: agora.toISOString(),
      janela_expira_em: windowExpiryFrom(agora, ADMIN_MESSAGE_WINDOW_HOURS),
      estado: "pendente",
    } as never)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);

  await supabaseAdmin.from("admin_audit_logs").insert({
    admin_user_id: adminId,
    action: "mensagem.admin_pergunta",
    target_user_id: input.consultorId,
    resource_type: "admin_messages",
    resource_id: (data as any)?.id ?? null,
    metadata: { source: "admin:consultor:mensagens" },
  } as never);

  return { ok: true, id: (data as any)?.id as string, horasSemContacto: janela.horas };
}

export interface AdminMessageView {
  id: string;
  pergunta: string;
  enviadoEm: string;
  resposta: string | null;
  respondidoEm: string | null;
  estado: "pendente" | "respondida" | "expirada";
  janelaExpiraEm: string;
  porLer: boolean;
}

function toView(r: AdminMessageRow): AdminMessageView {
  const estado = effectiveState(r);
  return {
    id: r.id,
    pergunta: r.pergunta,
    enviadoEm: r.enviado_em,
    resposta: r.resposta,
    respondidoEm: r.respondido_em,
    estado,
    janelaExpiraEm: r.janela_expira_em,
    porLer: estado === "respondida" && !r.resposta_lida_em,
  };
}

export async function listAdminMessages(
  supabaseAdmin: any,
  consultorId: string,
): Promise<AdminMessageView[]> {
  await expireStaleAdminMessages(supabaseAdmin, consultorId);
  const { data } = await supabaseAdmin
    .from("admin_messages")
    .select("*")
    .eq("consultor_id", consultorId)
    .order("enviado_em", { ascending: false })
    .limit(100);
  return (((data as AdminMessageRow[]) ?? [])).map(toView);
}

/** Respostas novas por ler, agrupadas por consultor (badge do painel). */
export async function countUnreadAdminReplies(
  supabaseAdmin: any,
): Promise<{ total: number; porConsultor: Record<string, number> }> {
  await expireStaleAdminMessages(supabaseAdmin);
  const { data } = await supabaseAdmin
    .from("admin_messages")
    .select("consultor_id, estado, resposta_lida_em")
    .eq("estado", "respondida")
    .is("resposta_lida_em", null)
    .limit(500);
  const porConsultor: Record<string, number> = {};
  for (const r of ((data as any[]) ?? [])) {
    porConsultor[r.consultor_id] = (porConsultor[r.consultor_id] ?? 0) + 1;
  }
  const total = Object.values(porConsultor).reduce((a, b) => a + b, 0);
  return { total, porConsultor };
}

export async function markAdminRepliesRead(
  supabaseAdmin: any,
  consultorId: string,
): Promise<void> {
  await supabaseAdmin
    .from("admin_messages")
    .update({ resposta_lida_em: new Date().toISOString() } as never)
    .eq("consultor_id", consultorId)
    .eq("estado", "respondida")
    .is("resposta_lida_em", null);
}

/**
 * Captura da resposta: se houver uma pergunta pendente dentro da janela,
 * a mensagem fica associada a essa pergunta e NÃO passa ao motor do Afonso.
 * Devolve o texto de confirmação a enviar, ou null se não há nada a capturar.
 */
export async function captureAdminReply(
  supabaseAdmin: any,
  consultorId: string,
  texto: string,
): Promise<{ captured: boolean; ack?: string; adminMessageId?: string }> {
  const limpo = String(texto ?? "").trim();
  if (!limpo) return { captured: false };

  const { data } = await supabaseAdmin
    .from("admin_messages")
    .select("*")
    .eq("consultor_id", consultorId)
    .eq("estado", "pendente")
    .order("enviado_em", { ascending: false })
    .limit(20);

  const alvo = pickPendingForConsultant((data as AdminMessageRow[]) ?? [], consultorId);
  if (!alvo) {
    // Nada pendente e válido: fecha o que já expirou e devolve ao motor.
    await expireStaleAdminMessages(supabaseAdmin, consultorId);
    return { captured: false };
  }

  const agora = new Date().toISOString();
  await supabaseAdmin
    .from("admin_messages")
    .update({ resposta: limpo, respondido_em: agora, estado: "respondida" } as never)
    .eq("id", alvo.id);

  return { captured: true, ack: ADMIN_REPLY_ACK, adminMessageId: alvo.id };
}