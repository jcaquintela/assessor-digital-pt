import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Tab = "recentes" | "por_tratar" | "imoveis" | "pessoas" | "diversos" | "arquivados";

// ---- Categorias personalizadas do Drive -------------------------------
// Criadas pelo próprio consultor. A classificação automática (classification /
// document_type) mantém-se sempre como sugestão inicial: a categoria manual é
// um campo separado (custom_category_id) e nunca a substitui na base de dados.

const CATEGORY_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#84cc16", "#22c55e",
  "#14b8a6", "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6",
  "#d946ef", "#f43f5e", "#78716c", "#64748b",
];

function cleanCategoryName(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) throw new Error("O nome da categoria não pode ficar vazio.");
  if (s.length > 40) throw new Error("Nome demasiado longo (máx. 40).");
  return s;
}

function cleanCategoryColor(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) return null;
  return s.toLowerCase();
}

export const listFileCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await (supabase.from("file_categories") as any)
      .select("id, name, color")
      .eq("user_id", userId)
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []) as { id: string; name: string; color: string | null }[];
  });

export const createFileCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { name: string; color?: string | null }) => ({
    name: cleanCategoryName(data?.name),
    color: cleanCategoryColor(data?.color),
  }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const insert: any = { user_id: userId, name: data.name };
    if (data.color) insert.color = data.color;

    // Idempotente: se já existir uma categoria com o mesmo nome, devolve-a.
    const { data: existing } = await (supabase.from("file_categories") as any)
      .select("id, name, color")
      .eq("user_id", userId)
      .ilike("name", data.name)
      .maybeSingle();
    if (existing) return existing as { id: string; name: string; color: string | null };

    const { data: row, error } = await (supabase.from("file_categories") as any)
      .insert(insert)
      .select("id, name, color")
      .single();
    if (error) {
      if (error.code === "23505") {
        const { data: dup } = await (supabase.from("file_categories") as any)
          .select("id, name, color")
          .eq("user_id", userId)
          .ilike("name", data.name)
          .maybeSingle();
        if (dup) return dup as { id: string; name: string; color: string | null };
      }
      throw new Error(error.message);
    }
    return row as { id: string; name: string; color: string | null };
  });

export const renameFileCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; name: string; color?: string | null }) => ({
    id: String(data?.id ?? ""),
    name: cleanCategoryName(data?.name),
    color: cleanCategoryColor(data?.color),
  }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const update: any = { name: data.name };
    if (data.color !== undefined) update.color = data.color;
    const { error } = await (supabase.from("file_categories") as any)
      .update(update)
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) {
      if (error.code === "23505") throw new Error("Já tens uma categoria com esse nome.");
      throw new Error(error.message);
    }
    return { ok: true };
  });

// Apagar a categoria não apaga ficheiros: ficam sem categoria manual e voltam a
// mostrar a classificação automática.
export const deleteFileCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await (supabase.from("file_categories") as any)
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Reclassificação manual de um ficheiro (categoryId=null volta ao automático).
export const setFileCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { fileId: string; categoryId: string | null }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    if (data.categoryId) {
      const { data: cat } = await (supabase.from("file_categories") as any)
        .select("id")
        .eq("id", data.categoryId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!cat) throw new Error("Categoria não encontrada.");
    }
    const { error } = await (supabase.from("uploaded_files") as any)
      .update({ custom_category_id: data.categoryId })
      .eq("id", data.fileId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Lista principal do Drive. Aplica filtro simples por tab.
export const listDriveFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tab?: Tab; q?: string; categoryId?: string | null }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const tab = (data.tab ?? "recentes") as Tab;

    let query = supabase
      .from("uploaded_files")
      .select(
        "id, channel, original_file_name, mime_type, size_bytes, processing_status, classification, document_type, ai_summary, classification_confidence, requires_review, archived_at, deleted_at, created_at, custom_category_id",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (tab === "arquivados") {
      query = query.not("archived_at", "is", null).is("deleted_at", null);
    } else {
      query = query.is("archived_at", null).is("deleted_at", null);
    }

    if (data.categoryId) {
      query = (query as any).eq("custom_category_id", data.categoryId);
    }

    if (tab === "por_tratar") {
      query = query.or(
        "requires_review.eq.true,processing_status.in.(pending_classification,awaiting_confirmation,failed)",
      );
    }

    if (data.q && data.q.trim().length >= 2) {
      const term = `%${data.q.trim().replace(/[%_]/g, "")}%`;
      query = query.or(
        `original_file_name.ilike.${term},ai_summary.ilike.${term},extracted_text.ilike.${term}`,
      );
    }

    const { data: files, error } = await query;
    if (error) throw new Error(error.message);

    // Obter todos os links para os ficheiros retornados numa só query
    const ids = (files ?? []).map((f: any) => f.id);
    let links: any[] = [];
    if (ids.length) {
      const { data: linkRows } = await supabase
        .from("file_links")
        .select("file_id, entity_type, entity_id, relation_type")
        .eq("user_id", userId)
        .in("file_id", ids);
      links = linkRows ?? [];
    }

    // Filtros por tipo de entidade (tab)
    let filtered = files ?? [];
    if (tab === "imoveis") {
      const withProp = new Set(
        links.filter((l) => l.entity_type === "property").map((l) => l.file_id),
      );
      filtered = filtered.filter((f: any) => withProp.has(f.id));
    } else if (tab === "pessoas") {
      const withPerson = new Set(
        links.filter((l) => l.entity_type === "person").map((l) => l.file_id),
      );
      filtered = filtered.filter((f: any) => withPerson.has(f.id));
    } else if (tab === "diversos") {
      const linked = new Set(links.map((l) => l.file_id));
      filtered = filtered.filter((f: any) => !linked.has(f.id));
    }

    return {
      files: filtered,
      linksByFile: links.reduce<Record<string, any[]>>((acc, l) => {
        (acc[l.file_id] ??= []).push(l);
        return acc;
      }, {}),
    };
  });

// Contadores por tab (barra superior)
export const driveCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: files } = await supabase
      .from("uploaded_files")
      .select("id, processing_status, requires_review, archived_at, deleted_at")
      .eq("user_id", userId)
      .is("deleted_at", null);
    const active = (files ?? []).filter((f: any) => !f.archived_at);
    const porTratar = active.filter(
      (f: any) =>
        f.requires_review === true ||
        ["pending_classification", "awaiting_confirmation", "failed"].includes(
          f.processing_status,
        ),
    );
    const arquivados = (files ?? []).filter((f: any) => !!f.archived_at);
    return {
      recentes: active.length,
      por_tratar: porTratar.length,
      arquivados: arquivados.length,
    };
  });

// Detalhe completo de um ficheiro (metadados + links + URL assinada)
export const getDriveFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: file, error } = await supabase
      .from("uploaded_files")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!file) throw new Error("Ficheiro não encontrado.");

    const { data: links } = await supabase
      .from("file_links")
      .select("id, entity_type, entity_id, relation_type, source, confidence, created_at")
      .eq("user_id", userId)
      .eq("file_id", data.id)
      .order("created_at", { ascending: true });

    // Enriquecer com nomes das entidades
    const linksEnriched = await Promise.all(
      (links ?? []).map(async (l: any) => {
        let name: string | null = null;
        const map: Record<string, [string, string]> = {
          person: ["people", "name"],
          property: ["properties", "title"],
          opportunity: ["opportunities", "type"],
          follow_up: ["follow_ups", "title"],
          miscellaneous: ["miscellaneous_items", "title"],
          prospecting_lead: ["prospecting_leads", "title"],
          interaction: ["interactions", "summary"],
        };
        const target = map[l.entity_type];
        if (target) {
          const { data: row } = await (supabase as any)
            .from(target[0])
            .select(target[1])
            .eq("id", l.entity_id)
            .maybeSingle();
          name = row?.[target[1]] ?? null;
        }
        return { ...l, entity_name: name };
      }),
    );

    let signedUrl: string | null = null;
    if ((file as any).storage_path) {
      const { data: signed } = await supabase.storage
        .from("assessor-files")
        .createSignedUrl((file as any).storage_path, 300);
      signedUrl = signed?.signedUrl ?? null;
    }

    return { file, links: linksEnriched, signedUrl };
  });

// Arquivar / desarquivar / eliminar (soft)
export const setDriveFileStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; action: "archive" | "unarchive" | "delete" }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const now = new Date().toISOString();
    const patch =
      data.action === "archive"
        ? { archived_at: now, processing_status: "archived" }
        : data.action === "unarchive"
          ? { archived_at: null, processing_status: "organized" }
          : { deleted_at: now, processing_status: "deleted" };

    const { error } = await (supabase as any)
      .from("uploaded_files")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Upload direto a partir do dashboard (multipart via FormData)
export const uploadDriveFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("FormData obrigatório.");
    const file = data.get("file");
    if (!(file instanceof File)) throw new Error("Ficheiro em falta.");
    return { file, description: (data.get("description") as string | null) ?? null };
  })
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const file = data.file;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { processIncomingFile } = await import("@/lib/assessor/files.server");
    const res = await processIncomingFile({
      supabase,
      userId,
      channel: "dashboard",
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: bytes.byteLength,
      bytes,
    });
    if (!res.ok) throw new Error(res.reply ?? "Não foi possível guardar o ficheiro.");
    if (data.description && res.fileId) {
      await supabase
        .from("uploaded_files")
        .update({ user_description: data.description })
        .eq("id", res.fileId);
    }
    return { ok: true, id: res.fileId };
  });

// Remover uma relação (link) de um ficheiro
export const removeFileLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { linkId: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("file_links")
      .delete()
      .eq("id", data.linkId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Alvos possíveis para "Corrigir ligação" (pessoas, imóveis, oportunidades).
// Só devolve registos do próprio utilizador — RLS aplica-se na mesma.
export const listLinkTargets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [people, props, opps] = await Promise.all([
      supabase.from("people").select("id, name").eq("user_id", userId).order("name").limit(300),
      supabase.from("properties").select("id, title").eq("user_id", userId).order("updated_at", { ascending: false }).limit(300),
      supabase.from("opportunities").select("id, title, deal_kind, type, stage").eq("user_id", userId).order("updated_at", { ascending: false }).limit(300),
    ]);
    return {
      person: ((people.data ?? []) as any[]).map((r) => ({ id: r.id, label: r.name ?? "Sem nome" })),
      property: ((props.data ?? []) as any[]).map((r) => ({ id: r.id, label: r.title ?? "Sem título" })),
      opportunity: ((opps.data ?? []) as any[]).map((r) => ({
        id: r.id,
        label: r.title || [r.deal_kind ?? r.type, r.stage].filter(Boolean).join(" · ") || "Negócio",
      })),
    };
  });

// Corrigir a ligação de um ficheiro existente. Não cria nem apaga ficheiros.
export const setFileLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      fileId: string;
      entityType: "person" | "property" | "opportunity";
      entityId: string;
      replaceLinkId?: string | null;
    }) => data,
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    // O ficheiro tem de ser do próprio utilizador.
    const { data: file, error: fErr } = await supabase
      .from("uploaded_files")
      .select("id")
      .eq("id", data.fileId)
      .eq("user_id", userId)
      .maybeSingle();
    if (fErr) throw new Error(fErr.message);
    if (!file) throw new Error("Ficheiro não encontrado.");

    // A entidade destino também.
    const table =
      data.entityType === "person"
        ? "people"
        : data.entityType === "property"
          ? "properties"
          : "opportunities";
    const { data: target } = await (supabase as any)
      .from(table)
      .select("id")
      .eq("id", data.entityId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!target) throw new Error("Registo não encontrado.");

    if (data.replaceLinkId) {
      await supabase
        .from("file_links")
        .delete()
        .eq("id", data.replaceLinkId)
        .eq("user_id", userId);
    }

    const { error } = await (supabase as any).from("file_links").upsert(
      {
        user_id: userId,
        file_id: data.fileId,
        entity_type: data.entityType,
        entity_id: data.entityId,
        relation_type: "related_to",
        source: "user",
        confirmed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,file_id,entity_type,entity_id,relation_type" },
    );
    if (error) throw new Error(error.message);

    // Manter o atalho legado coerente com a correção feita à mão.
    await (supabase as any)
      .from("uploaded_files")
      .update({ related_resource_type: data.entityType, related_resource_id: data.entityId })
      .eq("id", data.fileId)
      .eq("user_id", userId);

    return { ok: true };
  });