// Acções da equipa sobre uma sugestão: marcar lida, repor por ler, arquivar.
// Cada origem tem o seu campo de estado — a UI trata as duas da mesma forma.

export async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("super_admin") && !roles.includes("support_admin")) {
    throw new Error("Forbidden: admin only");
  }
}

export interface SuggestionActionInput {
  id: string;
  source: "feedback" | "diversos";
  action: "read" | "unread" | "archive";
  internalNote?: string | undefined;
}

export async function applySuggestionAction(
  admin: any,
  adminUserId: string,
  input: SuggestionActionInput,
): Promise<{ ok: true }> {
  const now = new Date().toISOString();

  if (input.source === "feedback") {
    const patch: Record<string, unknown> = {
      handled_by: adminUserId,
      handled_at: input.action === "unread" ? null : now,
      status:
        input.action === "archive" ? "arquivado" : input.action === "unread" ? "novo" : "em_analise",
    };
    if (input.internalNote !== undefined) patch['internal_note'] = input.internalNote || null;
    const { error } = await admin.from("product_feedback").update(patch as never).eq("id", input.id);
    if (error) throw new Error(error.message);
  } else {
    const patch: Record<string, unknown> =
      input.action === "archive"
        ? { team_archived_at: now, team_read_at: now }
        : input.action === "unread"
          ? { team_read_at: null, team_archived_at: null }
          : { team_read_at: now };
    const { error } = await admin
      .from("miscellaneous_items")
      .update(patch as never)
      .eq("id", input.id);
    if (error) throw new Error(error.message);
  }

  await admin.from("admin_audit_logs").insert({
    admin_user_id: adminUserId,
    action: `sugestao.${input.action}`,
    resource_type: input.source === "feedback" ? "product_feedback" : "miscellaneous_items",
    resource_id: input.id,
    metadata: { source: "admin:sugestoes" },
  } as never);

  return { ok: true };
}