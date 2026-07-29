import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Tab = "recentes" | "por_tratar" | "imoveis" | "pessoas" | "diversos" | "arquivados";

// Lista principal do Drive. Aplica filtro simples por tab.
export const listDriveFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { tab?: Tab; q?: string }) => data)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const tab = (data.tab ?? "recentes") as Tab;

    let query = supabase
      .from("uploaded_files")
      .select(
        "id, channel, original_file_name, mime_type, size_bytes, processing_status, classification, document_type, ai_summary, classification_confidence, requires_review, archived_at, deleted_at, created_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (tab === "arquivados") {
      query = query.not("archived_at", "is", null).is("deleted_at", null);
    } else {
      query = query.is("archived_at", null).is("deleted_at", null);
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