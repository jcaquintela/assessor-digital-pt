// Eliminação permanente — Fase 1: Seguimentos e Diversos (sem filhos complexos).
//
// Antes de apagar, guardamos em `admin_audit_logs` o retrato completo do
// registo (e dos filhos eliminados) em JSON, com o motivo dado pelo consultor.
// Depois do delete não há outra forma de reconstituir o que existia.

import {
  isArchivedForDelete,
  NOT_ARCHIVED_MESSAGE,
  type PermanentDeleteType,
} from "./permanent-delete";

const TABLE: Record<PermanentDeleteType, string> = {
  follow_up: "follow_ups",
  miscellaneous: "miscellaneous_items",
};

export interface PermanentDeleteInput {
  userId: string;
  type: PermanentDeleteType;
  id: string;
  reason: string;
}

export interface PermanentDeleteDeps {
  /** Cliente usado para o registo de auditoria (em produção, o admin). */
  auditClient?: any;
  /** Cancela o evento no calendário externo e cala os avisos internos. */
  cancelExternal?: (userId: string, followUpId: string) => Promise<void>;
}

export interface PermanentDeleteResult {
  deleted: true;
  type: PermanentDeleteType;
  id: string;
  externalCancelled: boolean;
  children: { reminders: number; calendar_event_links: number };
}

export async function permanentlyDeleteRecord(
  supabase: any,
  input: PermanentDeleteInput,
  deps: PermanentDeleteDeps = {},
): Promise<PermanentDeleteResult> {
  const reason = String(input.reason ?? "").trim();
  if (reason.length < 3) throw new Error("Escreve o motivo da eliminação.");

  const table = TABLE[input.type];
  if (!table) throw new Error("Tipo de registo não suportado.");

  const { data: row } = await supabase
    .from(table)
    .select("*")
    .eq("id", input.id)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (!row) throw new Error("Registo não encontrado.");
  if (!isArchivedForDelete(input.type, row)) throw new Error(NOT_ARCHIVED_MESSAGE);

  // Filhos a eliminar em cascata (só os seguimentos têm).
  let reminders: any[] = [];
  let links: any[] = [];
  if (input.type === "follow_up") {
    const { data: rem } = await supabase
      .from("reminders")
      .select("*")
      .eq("user_id", input.userId)
      .eq("related_resource_type", "follow_up")
      .eq("related_resource_id", input.id);
    reminders = (rem as any[]) ?? [];
    const { data: lnk } = await supabase
      .from("calendar_event_links")
      .select("*")
      .eq("user_id", input.userId)
      .eq("follow_up_id", input.id);
    links = (lnk as any[]) ?? [];
  }

  // 1. Auditoria SEMPRE antes do delete.
  const audit = deps.auditClient ?? supabase;
  await audit.from("admin_audit_logs").insert({
    admin_user_id: input.userId,
    target_user_id: input.userId,
    action: `registo.eliminacao_permanente.${input.type}`,
    resource_type: input.type,
    resource_id: input.id,
    reason,
    metadata: {
      source: "app:permanentlyDeleteRecord",
      snapshot: row,
      children: { reminders, calendar_event_links: links },
    },
  } as never);

  // 2. Calendário externo e avisos internos param antes de o registo sumir.
  let externalCancelled = false;
  if (input.type === "follow_up") {
    try {
      const cancel =
        deps.cancelExternal ??
        (async (userId: string, followUpId: string) => {
          const { stopFollowUpTriggers } = await import("@/lib/calendar/stop-triggers.server");
          await stopFollowUpTriggers(supabase, userId, [followUpId]);
        });
      await cancel(input.userId, input.id);
      externalCancelled = true;
    } catch (e) {
      console.error("[permanent-delete] cancelar no calendário falhou", e);
    }

    await supabase
      .from("reminders")
      .delete()
      .eq("user_id", input.userId)
      .eq("related_resource_type", "follow_up")
      .eq("related_resource_id", input.id);
    await supabase
      .from("calendar_event_links")
      .delete()
      .eq("user_id", input.userId)
      .eq("follow_up_id", input.id);
  }

  // 3. O registo.
  const { error } = await supabase
    .from(table)
    .delete()
    .eq("id", input.id)
    .eq("user_id", input.userId);
  if (error) throw new Error(error.message);

  return {
    deleted: true,
    type: input.type,
    id: input.id,
    externalCancelled,
    children: { reminders: reminders.length, calendar_event_links: links.length },
  };
}
