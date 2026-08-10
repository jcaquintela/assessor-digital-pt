// Vista agregada de sugestões dos consultores (/admin/sugestoes).
//
// Junta duas origens históricas: product_feedback (kind = suggestion) e as
// notas de Diversos que ficaram marcadas como sugestão. Privacidade: só
// entram itens explicitamente marcados como sugestão — o resto de Diversos
// é privado do consultor.

import { isTeamSuggestion } from "@/lib/suggestions/team-suggestions";

export type SuggestionSource = "feedback" | "diversos";

export interface AdminSuggestion {
  id: string;
  source: SuggestionSource;
  user_id: string;
  consultant_name: string | null;
  consultant_email: string | null;
  consultant_phone: string | null;
  channel: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
  archived: boolean;
  internal_note: string | null;
  attachments: { name: string; mime: string | null; url: string | null }[];
}

async function signAttachments(
  admin: any,
  fileIds: string[],
): Promise<Record<string, { name: string; mime: string | null; url: string | null }>> {
  const out: Record<string, { name: string; mime: string | null; url: string | null }> = {};
  if (!fileIds.length) return out;
  const { data: files } = await admin
    .from("uploaded_files")
    .select("id, original_file_name, internal_file_name, mime_type, storage_path")
    .in("id", fileIds);
  for (const f of (files as any[]) ?? []) {
    let url: string | null = null;
    if (f.storage_path) {
      const { data: signed } = await admin.storage
        .from("assessor-files")
        .createSignedUrl(f.storage_path, 600);
      url = signed?.signedUrl ?? null;
    }
    out[f.id] = {
      name: f.original_file_name ?? f.internal_file_name ?? "ficheiro",
      mime: f.mime_type ?? null,
      url,
    };
  }
  return out;
}

export async function fetchTeamSuggestions(admin: any): Promise<{ items: AdminSuggestion[] }> {
  const [{ data: feedback }, { data: misc }] = await Promise.all([
    admin
      .from("product_feedback")
      .select("id, user_id, body, channel, status, internal_note, created_at, handled_at, attachment_file_id")
      .eq("kind", "suggestion")
      .order("created_at", { ascending: false })
      .limit(300),
    admin
      .from("miscellaneous_items")
      .select(
        "id, user_id, title, original_content, summary, category, tags, source_channel, status, created_at, team_read_at, team_archived_at",
      )
      .neq("status", "deleted")
      .order("created_at", { ascending: false })
      .limit(600),
  ]);

  const miscRows = ((misc as any[]) ?? []).filter((r) => isTeamSuggestion(r));
  const feedbackRows = (feedback as any[]) ?? [];

  // Anexos: do feedback (coluna directa) e das notas (file_links).
  const fileIds = new Set<string>(
    feedbackRows.map((r) => r.attachment_file_id).filter(Boolean) as string[],
  );
  const miscFiles: Record<string, string[]> = {};
  if (miscRows.length) {
    const { data: links } = await admin
      .from("file_links")
      .select("file_id, entity_type, entity_id")
      .eq("entity_type", "miscellaneous")
      .in("entity_id", miscRows.map((r) => r.id));
    for (const l of ((links as any[]) ?? [])) {
      fileIds.add(l.file_id);
      (miscFiles[l.entity_id] ??= []).push(l.file_id);
    }
  }
  const attachments = await signAttachments(admin, Array.from(fileIds));

  const userIds = Array.from(
    new Set([...feedbackRows.map((r) => r.user_id), ...miscRows.map((r) => r.user_id)].filter(Boolean)),
  );
  const profiles: Record<string, { name: string | null; email: string | null; phone: string | null }> = {};
  if (userIds.length) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id, name, email, phone")
      .in("id", userIds);
    for (const p of ((profs as any[]) ?? [])) {
      profiles[p.id] = { name: p.name ?? null, email: p.email ?? null, phone: p.phone ?? null };
    }
  }

  const items: AdminSuggestion[] = [
    ...feedbackRows.map((r): AdminSuggestion => ({
      id: r.id,
      source: "feedback",
      user_id: r.user_id,
      consultant_name: profiles[r.user_id]?.name ?? null,
      consultant_email: profiles[r.user_id]?.email ?? null,
      consultant_phone: profiles[r.user_id]?.phone ?? null,
      channel: r.channel ?? "dashboard",
      title: String(r.body ?? "").split("\n")[0]?.slice(0, 90) || "Sugestão",
      body: r.body ?? "",
      created_at: r.created_at,
      read_at: r.status && r.status !== "novo" ? (r.handled_at ?? r.created_at) : null,
      archived: r.status === "arquivado",
      internal_note: r.internal_note ?? null,
      attachments: r.attachment_file_id && attachments[r.attachment_file_id]
        ? [attachments[r.attachment_file_id]!]
        : [],
    })),
    ...miscRows.map((r): AdminSuggestion => ({
      id: r.id,
      source: "diversos",
      user_id: r.user_id,
      consultant_name: profiles[r.user_id]?.name ?? null,
      consultant_email: profiles[r.user_id]?.email ?? null,
      consultant_phone: profiles[r.user_id]?.phone ?? null,
      channel: r.source_channel ?? "web",
      title: r.title ?? "Sugestão",
      body: r.original_content || r.summary || r.title || "",
      created_at: r.created_at,
      read_at: r.team_read_at ?? null,
      archived: !!r.team_archived_at || r.status === "archived",
      internal_note: null,
      attachments: (miscFiles[r.id] ?? [])
        .map((fid) => attachments[fid])
        .filter(Boolean) as { name: string; mime: string | null; url: string | null }[],
    })),
  ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return { items };
}