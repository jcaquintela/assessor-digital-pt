// Reciclagem do Drive: eliminar um ficheiro não o destrói de imediato.
// Fica 24 horas recuperável (deleted_at preenchido), com as ligações intactas.
// Passadas as 24 horas, este purge apaga a sério: ligações, storage e registo.

export const RECOVERY_WINDOW_HOURS = 24;

export function recoveryDeadline(deletedAt: string | Date): Date {
  const d = typeof deletedAt === "string" ? new Date(deletedAt) : deletedAt;
  return new Date(d.getTime() + RECOVERY_WINDOW_HOURS * 3600_000);
}

/** Só um ficheiro já arquivado ou na reciclagem pode ser eliminado para sempre. */
export function isDriveFileDeletable(row: { archived_at?: unknown; deleted_at?: unknown }): boolean {
  return !!row?.archived_at || !!row?.deleted_at;
}

export const DRIVE_NOT_ARCHIVED_MESSAGE =
  "Só podes eliminar definitivamente um ficheiro já arquivado ou na reciclagem. Arquiva primeiro.";

const BUCKET = "assessor-files";

/**
 * Apaga os objetos no storage. Se o storage falhar, atiramos: o registo na BD
 * NÃO pode desaparecer enquanto o ficheiro pago continuar lá.
 */
async function removeFromStorage(supabase: any, paths: string[]): Promise<void> {
  if (!paths.length) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) throw new Error(`Não consegui apagar o ficheiro do armazenamento: ${error.message}`);
}

export interface DrivePermanentDeleteInput {
  userId: string;
  fileId: string;
  reason: string;
}

export interface DrivePermanentDeleteResult {
  deleted: true;
  id: string;
  links: number;
  storagePaths: string[];
}

/**
 * Eliminação permanente de um ficheiro do Drive.
 * Ordem: auditoria → ligações → storage → registo. Se o storage falhar,
 * o registo fica (e as ligações já removidas podem ser refeitas à mão),
 * nunca ficando um ficheiro pago órfão sem rasto na BD.
 */
export async function permanentlyDeleteDriveFile(
  supabase: any,
  input: DrivePermanentDeleteInput,
  deps: { auditClient?: any } = {},
): Promise<DrivePermanentDeleteResult> {
  const reason = String(input.reason ?? "").trim();
  if (reason.length < 3) throw new Error("Escreve o motivo da eliminação.");

  const { data: file } = await supabase
    .from("uploaded_files")
    .select("*")
    .eq("id", input.fileId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (!file) throw new Error("Ficheiro não encontrado.");
  if (!isDriveFileDeletable(file)) throw new Error(DRIVE_NOT_ARCHIVED_MESSAGE);

  const { data: linkRows } = await supabase
    .from("file_links")
    .select("*")
    .eq("user_id", input.userId)
    .eq("file_id", input.fileId);
  const links = (linkRows as any[]) ?? [];

  // 1. Auditoria SEMPRE antes de mexer.
  const audit = deps.auditClient ?? supabase;
  await audit.from("admin_audit_logs").insert({
    admin_user_id: input.userId,
    target_user_id: input.userId,
    action: "registo.eliminacao_permanente.drive_file",
    resource_type: "drive_file",
    resource_id: input.fileId,
    reason,
    metadata: {
      source: "app:permanentlyDeleteDriveFile",
      snapshot: file,
      children: { file_links: links },
    },
  } as never);

  // 2. Ligações (cascata: nenhuma ficha fica a apontar para um ficheiro inexistente).
  const { error: linkErr } = await supabase
    .from("file_links")
    .delete()
    .eq("user_id", input.userId)
    .eq("file_id", input.fileId);
  if (linkErr) throw new Error(linkErr.message);

  // 3. Storage — se falhar, paramos aqui e a linha da BD mantém-se.
  const paths = [file.storage_path].filter(Boolean) as string[];
  await removeFromStorage(supabase, paths);

  // 4. Registo.
  const { error } = await supabase
    .from("uploaded_files")
    .delete()
    .eq("id", input.fileId)
    .eq("user_id", input.userId);
  if (error) throw new Error(error.message);

  return { deleted: true, id: input.fileId, links: links.length, storagePaths: paths };
}

export async function purgeExpiredDeletedFiles(supabase: any, userId: string): Promise<number> {
  const cutoff = new Date(Date.now() - RECOVERY_WINDOW_HOURS * 3600_000).toISOString();

  const { data: rows } = await supabase
    .from("uploaded_files")
    .select("id, storage_path")
    .eq("user_id", userId)
    .not("deleted_at", "is", null)
    .lt("deleted_at", cutoff)
    .limit(200);

  const files = ((rows ?? []) as any[]).filter((r) => r?.id);
  if (!files.length) return 0;
  const ids = files.map((f) => String(f.id));

  await supabase.from("file_links").delete().eq("user_id", userId).in("file_id", ids);

  // Storage primeiro: com falha aqui não avançamos para o delete da BD,
  // senão ficava um ficheiro pago sem qualquer registo que o encontre.
  const paths = files.map((f) => f.storage_path).filter(Boolean) as string[];
  try {
    await removeFromStorage(supabase, paths);
  } catch (e: any) {
    console.error("[drive] purge storage:", e?.message ?? e);
    return 0;
  }

  const { error: delErr } = await supabase
    .from("uploaded_files")
    .delete()
    .eq("user_id", userId)
    .in("id", ids);
  if (delErr) {
    console.error("[drive] purge registo:", delErr.message);
    return 0;
  }
  return ids.length;
}

