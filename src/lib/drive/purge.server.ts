// Reciclagem do Drive: eliminar um ficheiro não o destrói de imediato.
// Fica 24 horas recuperável (deleted_at preenchido), com as ligações intactas.
// Passadas as 24 horas, este purge apaga a sério: ligações, storage e registo.

export const RECOVERY_WINDOW_HOURS = 24;

export function recoveryDeadline(deletedAt: string | Date): Date {
  const d = typeof deletedAt === "string" ? new Date(deletedAt) : deletedAt;
  return new Date(d.getTime() + RECOVERY_WINDOW_HOURS * 3600_000);
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

  const paths = files.map((f) => f.storage_path).filter(Boolean) as string[];
  if (paths.length) {
    const { error } = await supabase.storage.from("assessor-files").remove(paths);
    if (error) console.error("[drive] purge storage:", error.message);
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
