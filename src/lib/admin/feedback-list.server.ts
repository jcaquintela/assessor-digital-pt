// Projeção da lista de feedback usada pelo admin (/admin/feedback).
// Isolada da server function para poder ser coberta por testes E2E.

export type AdminFeedbackAttachment = { name: string; mime: string | null; url: string | null };

export async function fetchProductFeedbackList(admin: any) {
  const { data, error } = await admin
    .from("product_feedback")
    .select(
      "id, user_id, kind, body, channel, status, internal_note, created_at, handled_at, attachment_file_id",
    )
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);
  const rows = data ?? [];

  // Anexos (screenshot/ficheiro) enviados junto com o report.
  const fileIds = Array.from(
    new Set(rows.map((r: any) => r.attachment_file_id).filter(Boolean)),
  ) as string[];
  const attachments: Record<string, AdminFeedbackAttachment> = {};
  if (fileIds.length) {
    const { data: files } = await admin
      .from("uploaded_files")
      .select("id, file_name, mime_type, storage_path")
      .in("id", fileIds);
    for (const f of (files as any[]) ?? []) {
      let url: string | null = null;
      if (f.storage_path) {
        const { data: signed } = await admin.storage
          .from("assessor-files")
          .createSignedUrl(f.storage_path, 600);
        url = signed?.signedUrl ?? null;
      }
      attachments[f.id] = { name: f.file_name ?? "ficheiro", mime: f.mime_type ?? null, url };
    }
  }

  const ids = Array.from(new Set(rows.map((r: any) => r.user_id)));
  const names: Record<string, { name: string | null; email: string | null }> = {};
  if (ids.length) {
    const { data: profs } = await admin.from("profiles").select("id, name, email").in("id", ids);
    for (const p of (profs as any[]) ?? []) names[p.id] = { name: p.name, email: p.email };
  }

  return {
    items: rows.map((r: any) => ({
      ...r,
      consultant_name: names[r.user_id]?.name ?? null,
      consultant_email: names[r.user_id]?.email ?? null,
      attachment: r.attachment_file_id ? (attachments[r.attachment_file_id] ?? null) : null,
    })),
  };
}
