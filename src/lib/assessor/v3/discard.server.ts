// Descarte real do último input — lado com base de dados.
//
// Bug de confiança: o consultor mandava descartar um áudio e o Afonso
// respondia "descartei o áudio. O que percebi dele fica guardado." Guardar
// contra instrução explícita nunca é aceitável. Aqui apagamos TUDO o que
// nasceu desse input: ficheiro, transcrição, registos extraídos e o próprio
// rascunho.

export const DISCARD_WINDOW_MS = 6 * 60 * 60 * 1000;

export interface CreatedRecord {
  table: string;
  id: string;
}

// Tabelas que o descarte pode limpar (lista fechada, por segurança).
const DELETABLE = new Set([
  "interactions",
  "follow_ups",
  "miscellaneous_items",
  "people",
  "properties",
  "reminders",
  "product_feedback",
]);

async function deleteById(supabase: any, table: string, id: string, userId: string) {
  if (!DELETABLE.has(table) || !id) return;
  try {
    await supabase.from(table).delete().eq("id", id).eq("user_id", userId);
  } catch { /* noop */ }
}

/** Lê a lista de registos criados que ficou anotada no rascunho. */
export function readCreatedRecords(payload: unknown): CreatedRecord[] {
  const list = (payload as any)?.created_records;
  if (!Array.isArray(list)) return [];
  return list
    .map((r: any) => ({ table: String(r?.table ?? ""), id: String(r?.id ?? "") }))
    .filter((r) => r.table && r.id);
}

/** Anota no rascunho o que foi criado, para um descarte posterior conseguir apagar. */
export async function recordCreatedRecords(
  supabase: any,
  pendingId: string,
  records: CreatedRecord[],
): Promise<void> {
  if (!pendingId || !records.length) return;
  try {
    const { data } = await supabase
      .from("pending_actions")
      .select("structured_payload")
      .eq("id", pendingId)
      .maybeSingle();
    const payload = { ...(((data as any)?.structured_payload ?? {}) as Record<string, unknown>) };
    payload['created_records'] = [...readCreatedRecords(payload), ...records];
    await supabase
      .from("pending_actions")
      .update({ structured_payload: payload } as never)
      .eq("id", pendingId);
  } catch { /* noop */ }
}

function fileIdsFromPayload(payload: any): string[] {
  const ids = [payload?.audio_file_id, payload?.file_id, payload?.attachment_file_id];
  return ids.filter((v: unknown): v is string => typeof v === "string" && v.length > 0);
}

/**
 * Apaga tudo o que nasceu do último input do consultor neste canal.
 * Devolve true quando havia alguma coisa para descartar.
 */
export async function discardLastInput(
  supabase: any,
  userId: string,
  channel: string,
  opts: { windowMs?: number } = {},
): Promise<boolean> {
  const since = new Date(Date.now() - (opts.windowMs ?? DISCARD_WINDOW_MS)).toISOString();
  const { data } = await supabase
    .from("pending_actions")
    .select("id, intent, structured_payload, source_message_id, created_at")
    .eq("user_id", userId)
    .eq("channel", channel)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(10);
  const rows: any[] = Array.isArray(data) ? data : [];
  if (!rows.length) return false;

  // O último input pode ter deixado mais do que um rascunho (proposta do
  // áudio + pergunta do ficheiro). Agrupa-os pela mensagem de origem.
  const head = rows[0];
  const group = rows.filter(
    (r) =>
      r.id === head.id ||
      (head.source_message_id && r.source_message_id === head.source_message_id),
  );

  const fileIds = new Set<string>();
  const messageIds = new Set<string>();

  for (const row of group) {
    const payload = (row.structured_payload ?? {}) as any;
    for (const rec of readCreatedRecords(payload)) {
      await deleteById(supabase, rec.table, rec.id, userId);
    }
    for (const fid of fileIdsFromPayload(payload)) fileIds.add(fid);
    if (row.source_message_id) messageIds.add(String(row.source_message_id));
    try {
      await supabase
        .from("pending_actions")
        .update({ status: "cancelled", error_message: "consultor descartou o input" } as never)
        .eq("id", row.id)
        .eq("user_id", userId);
    } catch { /* noop */ }
  }

  // Ficheiros e transcrições: saem mesmo da base de dados (não é reciclagem —
  // o consultor disse para não guardar nada).
  for (const fileId of fileIds) {
    try {
      await supabase.from("file_links").delete().eq("file_id", fileId).eq("user_id", userId);
    } catch { /* noop */ }
    try {
      await supabase.from("people").delete().eq("source_file_id", fileId).eq("user_id", userId);
    } catch { /* noop */ }
    try {
      await supabase.from("uploaded_files").delete().eq("id", fileId).eq("user_id", userId);
    } catch { /* noop */ }
  }

  // Registos criados directamente a partir da mensagem de origem.
  for (const messageId of messageIds) {
    for (const table of ["people", "properties", "follow_ups", "miscellaneous_items", "uploaded_files"]) {
      try {
        await supabase
          .from(table)
          .delete()
          .eq("source_message_id", messageId)
          .eq("user_id", userId);
      } catch { /* noop */ }
    }
  }

  return true;
}