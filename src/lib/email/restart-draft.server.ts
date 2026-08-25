// Recomeçar um rascunho cancelado (ou descartado): cria um novo rascunho
// pendente com os mesmos destinatários e o texto já preenchido.
// Não reabre o original — o cancelamento continua a ser estado terminal.
import { DRAFT_TTL_MS } from "./reply-draft";

export async function restartDraft(args: {
  userId: string;
  draftId: string;
  subject?: string | null;
  body?: string | null;
}): Promise<{ status: "created" | "not_found" | "not_cancelled"; draftId?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: row, error } = await supabaseAdmin
    .from("email_drafts")
    .select(
      "id,user_id,provider,to_emails,to_name,subject,body,person_id,thread_id,in_reply_to_message_id,channel,status,cancelled_at",
    )
    .eq("id", args.draftId)
    .eq("user_id", args.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return { status: "not_found" };

  const src = row as any;
  const terminal =
    src.status === "cancelled" || Boolean(src.cancelled_at) || src.status === "discarded";
  if (!terminal) return { status: "not_cancelled" };

  const { data: created, error: insErr } = await supabaseAdmin
    .from("email_drafts")
    .insert({
      user_id: args.userId,
      provider: src.provider,
      to_emails: src.to_emails ?? [],
      to_name: src.to_name,
      subject: args.subject ?? src.subject,
      body: args.body ?? src.body,
      person_id: src.person_id,
      thread_id: src.thread_id,
      in_reply_to_message_id: src.in_reply_to_message_id,
      channel: src.channel ?? "dashboard",
      status: "pending",
      revisions: 0,
      expires_at: new Date(Date.now() + DRAFT_TTL_MS).toISOString(),
    } as never)
    .select("id")
    .single();
  if (insErr || !created) throw new Error(insErr?.message ?? "rascunho não criado");

  await supabaseAdmin.from("admin_audit_logs").insert({
    admin_user_id: null,
    action: "email.rascunho_recomecado",
    target_user_id: args.userId,
    resource_type: "email_draft",
    resource_id: String((created as any).id),
    reason: "Novo rascunho criado a partir de um rascunho cancelado.",
    metadata: {
      source: "email/restart-draft:dashboard",
      source_draft_id: args.draftId,
      provider: src.provider,
    },
  } as never);

  return { status: "created", draftId: String((created as any).id) };
}
