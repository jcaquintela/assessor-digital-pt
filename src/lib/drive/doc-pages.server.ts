// Consolidação de documentos de várias páginas (server-only).
// Cada foto chega como ficheiro separado; aqui juntamos as páginas seguidas do
// mesmo documento, somamos as leituras e reaproveitamos a ligação já feita —
// para haver uma ligação única ao imóvel em vez de uma por página.
import {
  DOC_PAGE_WINDOW_MS,
  isSameDocument,
  mergeReadings,
  type PageReading,
} from "./doc-pages";
import { addFileLink } from "./link-suggestions.server";
import type { LinkableType } from "./link-match";

type FileRow = {
  id: string;
  created_at: string;
  doc_group_id: string | null;
  doc_page_number: number | null;
  document_type: string | null;
  doc_artigo_matricial: string | null;
  doc_fracao: string | null;
  doc_morada: string | null;
  doc_nif: string | null;
  doc_issued_on: string | null;
  doc_expires_on: string | null;
  extracted_text: string | null;
  related_resource_type: string | null;
  related_resource_id: string | null;
};

const FILE_COLS =
  "id, created_at, doc_group_id, doc_page_number, document_type, doc_artigo_matricial, doc_fracao, doc_morada, doc_nif, doc_issued_on, doc_expires_on, extracted_text, related_resource_type, related_resource_id";

function rowToReading(row: FileRow): PageReading {
  return {
    doc_type: row.document_type,
    artigo_matricial: row.doc_artigo_matricial,
    fracao: row.doc_fracao,
    morada: row.doc_morada,
    nif: row.doc_nif,
    issued_on: row.doc_issued_on,
    expires_on: row.doc_expires_on,
    visible_text: row.extracted_text,
  };
}

async function labelFor(
  supabase: any,
  userId: string,
  type: string,
  id: string,
): Promise<string | null> {
  try {
    if (type === "person") {
      const { data } = await supabase.from("people").select("name").eq("id", id).eq("user_id", userId).maybeSingle();
      return (data as any)?.name ?? null;
    }
    if (type === "property") {
      const { data } = await supabase
        .from("properties").select("title, address, location").eq("id", id).eq("user_id", userId).maybeSingle();
      return (data as any)?.title || (data as any)?.address || (data as any)?.location || null;
    }
    if (type === "opportunity") {
      const { data } = await supabase.from("opportunities").select("title").eq("id", id).eq("user_id", userId).maybeSingle();
      return (data as any)?.title ?? null;
    }
  } catch {
    /* label é só para a resposta — nunca trava a consolidação */
  }
  return null;
}

export interface DocPageResult {
  /** A página entrou num documento já existente. */
  joined: boolean;
  groupId: string | null;
  pageNumber: number;
  /** Leitura consolidada de todas as páginas do documento. */
  merged: PageReading;
  /** Registo a que o documento já estava ligado (herdado por esta página). */
  linkedLabel: string | null;
}

/**
 * Regista a página no documento certo e devolve a leitura consolidada.
 * Nunca falha o fluxo: em erro devolve a leitura da própria página.
 */
export async function consolidateDocumentPage(args: {
  supabase: any;
  userId: string;
  fileId: string;
  reading: PageReading;
}): Promise<DocPageResult> {
  const { supabase, userId, fileId, reading } = args;
  const fallback: DocPageResult = {
    joined: false,
    groupId: null,
    pageNumber: 1,
    merged: mergeReadings([reading]),
    linkedLabel: null,
  };
  try {
    const since = new Date(Date.now() - DOC_PAGE_WINDOW_MS).toISOString();
    const { data } = await supabase
      .from("uploaded_files")
      .select(FILE_COLS)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .is("archived_at", null)
      .neq("id", fileId)
      .gte("created_at", since)
      .in("classification", ["imagem", "documento_pdf"])
      .order("created_at", { ascending: false })
      .limit(10);
    const recent = ((data ?? []) as FileRow[]).filter(
      (r) => r.document_type || r.doc_artigo_matricial || r.doc_nif || r.doc_morada || r.doc_group_id,
    );
    const prev = recent[0];
    if (!prev || !isSameDocument(rowToReading(prev), reading)) return fallback;

    const groupId: string = prev.doc_group_id ?? crypto.randomUUID();
    if (!prev.doc_group_id) {
      await supabase
        .from("uploaded_files")
        .update({ doc_group_id: groupId, doc_page_number: 1 } as never)
        .eq("id", prev.id)
        .eq("user_id", userId);
    }

    const { data: groupRows } = await supabase
      .from("uploaded_files")
      .select(FILE_COLS)
      .eq("user_id", userId)
      .eq("doc_group_id", groupId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    const pages = ((groupRows ?? []) as FileRow[]).filter((r) => r.id !== fileId);
    const pageNumber = pages.length + 1;

    await supabase
      .from("uploaded_files")
      .update({ doc_group_id: groupId, doc_page_number: pageNumber } as never)
      .eq("id", fileId)
      .eq("user_id", userId);

    const merged = mergeReadings([...pages.map(rowToReading), reading]);

    // Ligação única: esta página herda as ligações já confirmadas do documento.
    let linkedLabel: string | null = null;
    const pageIds = pages.map((p) => p.id);
    if (pageIds.length) {
      const { data: links } = await supabase
        .from("file_links")
        .select("entity_type, entity_id")
        .eq("user_id", userId)
        .in("file_id", pageIds);
      const seen = new Set<string>();
      for (const l of ((links ?? []) as { entity_type: string; entity_id: string }[])) {
        const key = `${l.entity_type}:${l.entity_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        await addFileLink(supabase, userId, fileId, l.entity_type as LinkableType, l.entity_id, "ai");
      }
      const anchor = pages.find((p) => p.related_resource_type && p.related_resource_id);
      if (anchor) {
        await supabase
          .from("uploaded_files")
          .update({
            related_resource_type: anchor.related_resource_type,
            related_resource_id: anchor.related_resource_id,
          } as never)
          .eq("id", fileId)
          .eq("user_id", userId);
        linkedLabel = await labelFor(
          supabase,
          userId,
          anchor.related_resource_type as string,
          anchor.related_resource_id as string,
        );
      }
    }

    return { joined: true, groupId, pageNumber, merged, linkedLabel };
  } catch (err) {
    console.error("[drive] consolidateDocumentPage:", err instanceof Error ? err.message : err);
    return fallback;
  }
}