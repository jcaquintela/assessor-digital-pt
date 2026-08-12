// Envio real do convite de acesso pelo Afonso.
//
// Regras:
//  - WhatsApp fora da janela de 24h exige template aprovado (é o caso normal
//    de um convite: quem o recebe nunca falou connosco).
//  - Nunca damos "enviado" sem a Meta aceitar a mensagem (message accepted).
//  - Cada tentativa fica registada em whatsapp_send_logs (destinatário,
//    template, resposta da Meta, timestamp) através de sendWhatsAppPayload.

import {
  TEMPLATE_INVITE,
  TEMPLATE_INVITE_LANG,
  inviteTemplatePayload,
  isSendablePhone,
  maskPhone,
  readableSendError,
  tokenFromUrl,
} from "@/lib/whatsapp/invite-template";

export type InviteSendOutcome = {
  enviado: boolean;
  destino: string | null;
  via: "template" | "texto" | null;
  erro?: string;
};

export interface InviteSendInput {
  userId: string;
  canal: "whatsapp" | "telegram";
  nome: string | null;
  texto: string;
  url: string;
  numeroAfonso: string | null;
  codigo: string | null;
  triggeredBy?: string | null;
}

/** Destino do convite: canal ligado, ou o telefone do perfil no caso do WhatsApp. */
export async function resolveInviteTarget(
  supabaseAdmin: any,
  userId: string,
  canal: "whatsapp" | "telegram",
): Promise<{ externalId: string | null; motivo?: string }> {
  const { data: link } = await supabaseAdmin
    .from("channel_links")
    .select("external_id")
    .eq("user_id", userId)
    .eq("channel", canal)
    .maybeSingle();
  const linked = (link as { external_id?: string } | null)?.external_id ?? null;
  if (linked) {
    if (canal === "whatsapp" && !isSendablePhone(linked)) {
      return { externalId: null, motivo: "O número associado a esta conta não é válido." };
    }
    return { externalId: linked };
  }

  if (canal === "telegram") {
    return { externalId: null, motivo: "Esta conta ainda não tem Telegram ligado — copia a mensagem e envia à mão." };
  }

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("phone")
    .eq("id", userId)
    .maybeSingle();
  const { normalizePhone } = await import("@/lib/whatsapp/phone");
  const phone = normalizePhone((prof as { phone?: string | null } | null)?.phone ?? null);
  if (!phone) {
    return { externalId: null, motivo: "Sem número de telefone — adiciona o número primeiro ou usa Gerar link." };
  }
  if (!isSendablePhone(phone)) {
    return { externalId: null, motivo: "Número inválido — usa o formato internacional (ex.: +351 912 345 678)." };
  }
  return { externalId: phone };
}

export async function sendInvite(
  supabaseAdmin: any,
  input: InviteSendInput,
): Promise<InviteSendOutcome> {
  const alvo = await resolveInviteTarget(supabaseAdmin, input.userId, input.canal);
  if (!alvo.externalId) {
    return { enviado: false, destino: null, via: null, erro: alvo.motivo };
  }

  if (input.canal === "telegram") {
    const { getTelegramProvider } = await import("@/lib/telegram/provider.server");
    const r = await getTelegramProvider().sendText({ chatId: alvo.externalId, text: input.texto });
    return r.ok
      ? { enviado: true, destino: "Telegram", via: "texto" }
      : { enviado: false, destino: "Telegram", via: null, erro: r.error ?? "O Telegram não aceitou a mensagem." };
  }

  const destino = maskPhone(alvo.externalId);
  const { isWithin24hWindow } = await import("@/lib/assessor/proactive/push.server");
  const dentroJanela = await isWithin24hWindow(supabaseAdmin, input.userId, "whatsapp");
  const { sendWhatsAppPayload, sendWhatsAppText } = await import("@/lib/whatsapp/send.server");

  if (dentroJanela) {
    const r = await sendWhatsAppText(alvo.externalId, input.texto, {
      kind: "auto",
      triggeredBy: input.triggeredBy ?? null,
      meta: { purpose: "invite_access", outsideWindow: false },
    });
    return r.ok
      ? { enviado: true, destino, via: "texto" }
      : { enviado: false, destino, via: null, erro: readableSendError((r as any).telemetry) };
  }

  const token = tokenFromUrl(input.url);
  if (!token) {
    return { enviado: false, destino, via: null, erro: "Não foi possível preparar o link para o template." };
  }

  const { isTemplateApproved } = await import("@/lib/whatsapp/template-status.server");
  if (!(await isTemplateApproved(TEMPLATE_INVITE))) {
    return {
      enviado: false,
      destino,
      via: null,
      erro:
        `O template de convite (${TEMPLATE_INVITE}) ainda não está aprovado pela Meta. ` +
        "Enquanto isso, copia a mensagem e envia à mão.",
    };
  }

  const r = await sendWhatsAppPayload(
    alvo.externalId,
    inviteTemplatePayload(input.nome, input.url, input.numeroAfonso, input.codigo),
    {
      kind: "auto",
      triggeredBy: input.triggeredBy ?? null,
      meta: {
        purpose: "invite_access",
        templateName: TEMPLATE_INVITE,
        templateCategory: "utility",
        templateLanguage: TEMPLATE_INVITE_LANG,
        outsideWindow: true,
      },
    },
  );
  return r.ok
    ? { enviado: true, destino, via: "template" }
    : { enviado: false, destino, via: null, erro: readableSendError((r as any).telemetry) };
}
