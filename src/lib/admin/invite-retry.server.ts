// Fila de convites por reenviar.
//
// Um convite pode falhar por motivos temporários — sobretudo o template da
// Meta ainda por aprovar. Em vez de obrigar o admin a lembrar-se, cada falha
// fica em `invite_send_attempts` como "pendente" e pode ser reenviada: à mão
// (botão "Reenviar") ou automaticamente assim que o template ficar aprovado.

import { sendInvite } from "@/lib/admin/invite-send.server";

export const MAX_INVITE_ATTEMPTS = 6;

export type PendingInvite = {
  id: string;
  user_id: string;
  nome: string | null;
  email: string | null;
  canal: "whatsapp" | "telegram";
  status: string;
  reason: string | null;
  destino: string | null;
  attempts: number;
  last_attempt_at: string;
};

export type RetryOutcome = {
  enviado: boolean;
  destino: string | null;
  erro?: string;
  /** Deixou de estar na fila (enviado ou tentativas esgotadas). */
  encerrado: boolean;
};

/** Guarda o resultado de uma tentativa de envio para poder reenviar depois. */
export async function recordInviteAttempt(
  supabaseAdmin: any,
  input: {
    userId: string;
    canal: "whatsapp" | "telegram";
    enviado: boolean;
    destino: string | null;
    erro?: string | null;
    requestedBy?: string | null;
  },
): Promise<void> {
  const { data: aberto } = await supabaseAdmin
    .from("invite_send_attempts")
    .select("id, attempts")
    .eq("user_id", input.userId)
    .eq("canal", input.canal)
    .eq("status", "pendente")
    .maybeSingle();
  const row = aberto as { id: string; attempts: number } | null;
  const agora = new Date().toISOString();

  if (input.enviado) {
    if (row) {
      await supabaseAdmin
        .from("invite_send_attempts")
        .update({ status: "enviado", sent_at: agora, last_attempt_at: agora, destino: input.destino, reason: null })
        .eq("id", row.id);
    }
    return;
  }

  if (row) {
    const attempts = row.attempts + 1;
    await supabaseAdmin
      .from("invite_send_attempts")
      .update({
        attempts,
        last_attempt_at: agora,
        reason: input.erro ?? null,
        destino: input.destino,
        ...(attempts >= MAX_INVITE_ATTEMPTS ? { status: "esgotado" } : {}),
      })
      .eq("id", row.id);
    return;
  }

  await supabaseAdmin.from("invite_send_attempts").insert({
    user_id: input.userId,
    canal: input.canal,
    status: "pendente",
    reason: input.erro ?? null,
    destino: input.destino,
    requested_by: input.requestedBy ?? null,
  });
}

/** Gera um convite novo (o anterior por usar é invalidado) e tenta enviá-lo. */
export async function retryInvite(
  supabaseAdmin: any,
  input: { userId: string; canal: "whatsapp" | "telegram"; requestedBy?: string | null },
): Promise<RetryOutcome> {
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("name, phone")
    .eq("id", input.userId)
    .maybeSingle();
  const nome = (prof as { name?: string | null } | null)?.name ?? null;
  const phoneRaw = (prof as { phone?: string | null } | null)?.phone ?? null;

  const { normalizePhone } = await import("@/lib/whatsapp/phone");
  const { buildInviteMessage } = await import("@/lib/admin/invite-message.server");
  const convite = await buildInviteMessage(supabaseAdmin, {
    userId: input.userId,
    canal: input.canal,
    nome,
    phone: input.canal === "whatsapp" ? normalizePhone(phoneRaw) : null,
    reason: "Reenvio de convite.",
    issuedBy: input.requestedBy ?? null,
  });

  const r = await sendInvite(supabaseAdmin, {
    userId: input.userId,
    canal: input.canal,
    nome,
    texto: convite.texto,
    url: convite.url,
    triggeredBy: input.requestedBy ?? null,
  });

  await recordInviteAttempt(supabaseAdmin, {
    userId: input.userId,
    canal: input.canal,
    enviado: r.enviado,
    destino: r.destino,
    erro: r.erro ?? null,
    requestedBy: input.requestedBy ?? null,
  });

  const { data: depois } = await supabaseAdmin
    .from("invite_send_attempts")
    .select("status")
    .eq("user_id", input.userId)
    .eq("canal", input.canal)
    .eq("status", "pendente")
    .maybeSingle();

  return {
    enviado: r.enviado,
    destino: r.destino,
    ...(r.erro ? { erro: r.erro } : {}),
    encerrado: !depois,
  };
}

/**
 * Reenvia toda a fila pendente. Chamado pela rotina que corre depois da
 * sincronização de templates: quando o `afonso_convite_painel` passa a
 * aprovado, os convites presos saem sozinhos.
 */
export async function retryPendingInvites(
  supabaseAdmin: any,
  opts: { limit?: number } = {},
): Promise<{ tentados: number; enviados: number; falhados: number }> {
  const { data } = await supabaseAdmin
    .from("invite_send_attempts")
    .select("user_id, canal")
    .eq("status", "pendente")
    .order("last_attempt_at", { ascending: true })
    .limit(opts.limit ?? 25);

  const fila = (data ?? []) as Array<{ user_id: string; canal: "whatsapp" | "telegram" }>;
  let enviados = 0;
  for (const item of fila) {
    try {
      const r = await retryInvite(supabaseAdmin, { userId: item.user_id, canal: item.canal });
      if (r.enviado) enviados += 1;
    } catch {
      // Uma falha não pode travar a fila; fica para a próxima passagem.
    }
  }
  return { tentados: fila.length, enviados, falhados: fila.length - enviados };
}
