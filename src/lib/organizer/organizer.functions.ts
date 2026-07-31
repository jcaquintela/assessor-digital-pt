import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Etiquetas e grupos são criados pelo próprio consultor no dashboard.
// Servem tanto pessoas como imóveis (entity_type), sempre isolados por user_id.
export type OrganizerEntity = "person" | "property";

function cleanName(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) throw new Error("O nome não pode ficar vazio.");
  if (s.length > 40) throw new Error("Nome demasiado longo (máx. 40).");
  return s;
}

function entity(v: unknown): OrganizerEntity {
  if (v !== "person" && v !== "property") throw new Error("Tipo de registo inválido.");
  return v;
}

export const listOrganizer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { entityType: OrganizerEntity }) => ({ entityType: entity(data?.entityType) }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const [tags, folders, tagLinks, folderLinks] = await Promise.all([
      (supabase.from("tags") as any).select("id, name, color").eq("user_id", userId).order("name"),
      (supabase.from("folders") as any).select("id, name").eq("user_id", userId).order("name"),
      (supabase.from("entity_tags") as any).select("tag_id, entity_id").eq("user_id", userId).eq("entity_type", data.entityType),
      (supabase.from("folder_items") as any).select("folder_id, entity_id").eq("user_id", userId).eq("entity_type", data.entityType),
    ]);
    if (tags.error) throw new Error(tags.error.message);
    if (folders.error) throw new Error(folders.error.message);
    return {
      tags: (tags.data ?? []) as { id: string; name: string; color: string | null }[],
      folders: (folders.data ?? []) as { id: string; name: string }[],
      tagLinks: (tagLinks.data ?? []) as { tag_id: string; entity_id: string }[],
      folderLinks: (folderLinks.data ?? []) as { folder_id: string; entity_id: string }[],
    };
  });

export const createTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { name: string }) => ({ name: cleanName(data?.name) }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await (supabase.from("tags") as any)
      .insert({ user_id: userId, name: data.name })
      .select("id, name, color")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("Já tens uma etiqueta com esse nome.");
      throw new Error(error.message);
    }
    return row as { id: string; name: string; color: string | null };
  });

export const deleteTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await (supabase.from("tags") as any).delete().eq("id", data.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { name: string }) => ({ name: cleanName(data?.name) }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await (supabase.from("folders") as any)
      .insert({ user_id: userId, name: data.name })
      .select("id, name")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("Já tens um grupo com esse nome.");
      throw new Error(error.message);
    }
    return row as { id: string; name: string };
  });

export const deleteFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await (supabase.from("folders") as any).delete().eq("id", data.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleTagOnEntity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tagId: string; entityType: OrganizerEntity; entityId: string; on: boolean }) => ({
    ...data,
    entityType: entity(data?.entityType),
  }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    if (data.on) {
      const { error } = await (supabase.from("entity_tags") as any).insert({
        user_id: userId, tag_id: data.tagId, entity_type: data.entityType, entity_id: data.entityId,
      });
      if (error && error.code !== "23505") throw new Error(error.message);
    } else {
      const { error } = await (supabase.from("entity_tags") as any)
        .delete().eq("user_id", userId).eq("tag_id", data.tagId)
        .eq("entity_type", data.entityType).eq("entity_id", data.entityId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const toggleFolderItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { folderId: string; entityType: OrganizerEntity; entityId: string; on: boolean }) => ({
    ...data,
    entityType: entity(data?.entityType),
  }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    if (data.on) {
      const { error } = await (supabase.from("folder_items") as any).insert({
        user_id: userId, folder_id: data.folderId, entity_type: data.entityType, entity_id: data.entityId,
      });
      if (error && error.code !== "23505") throw new Error(error.message);
    } else {
      const { error } = await (supabase.from("folder_items") as any)
        .delete().eq("user_id", userId).eq("folder_id", data.folderId)
        .eq("entity_type", data.entityType).eq("entity_id", data.entityId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });