// Reordenar páginas de um documento fotografado por partes.
// Quando as fotos chegam fora de ordem, o consultor arruma as páginas aqui e
// a leitura é consolidada de novo pela ordem certa (a IA nunca decide sozinha).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PAGE_COLS =
  "id, created_at, doc_group_id, doc_page_number, original_file_name, document_type, doc_artigo_matricial, doc_fracao, doc_morada, doc_nif, doc_issued_on, doc_expires_on, extracted_text";

async function groupIdOf(supabase: any, userId: string, fileId: string): Promise<string | null> {
  const { data } = await supabase
    .from("uploaded_files")
    .select("doc_group_id")
    .eq("id", fileId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as any)?.doc_group_id ?? null;
}

export const listDocumentPages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { fileId: string }) => ({ fileId: String(data?.fileId ?? "") }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const groupId = await groupIdOf(supabase, userId, data.fileId);
    if (!groupId) return { groupId: null, pages: [] as any[] };
    const { data: rows, error } = await (supabase as any)
      .from("uploaded_files")
      .select(PAGE_COLS)
      .eq("user_id", userId)
      .eq("doc_group_id", groupId)
      .is("deleted_at", null)
      .order("doc_page_number", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { groupId, pages: (rows ?? []) as any[] };
  });

export const reorderDocumentPages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { fileId: string; orderedIds: string[] }) => ({
    fileId: String(data?.fileId ?? ""),
    orderedIds: (data?.orderedIds ?? []).map((v) => String(v)),
  }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { mergeReadings } = await import("./doc-pages");
    const groupId = await groupIdOf(supabase, userId, data.fileId);
    if (!groupId) throw new Error("Este ficheiro não faz parte de um documento com várias páginas.");

    const { data: rows, error } = await (supabase as any)
      .from("uploaded_files")
      .select(PAGE_COLS)
      .eq("user_id", userId)
      .eq("doc_group_id", groupId)
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    const byId = new Map<string, any>(((rows ?? []) as any[]).map((r) => [r.id, r]));
    const ordered = data.orderedIds.filter((id) => byId.has(id));
    if (ordered.length !== byId.size) throw new Error("A ordem enviada não corresponde às páginas do documento.");

    for (let i = 0; i < ordered.length; i++) {
      await (supabase as any)
        .from("uploaded_files")
        .update({ doc_page_number: i + 1 })
        .eq("id", ordered[i])
        .eq("user_id", userId);
    }

    // Consolidação da leitura pela ordem nova: o primeiro valor conhecido ganha.
    const merged = mergeReadings(
      ordered.map((id) => {
        const r = byId.get(id);
        return {
          doc_type: r.document_type,
          artigo_matricial: r.doc_artigo_matricial,
          fracao: r.doc_fracao,
          morada: r.doc_morada,
          nif: r.doc_nif,
          issued_on: r.doc_issued_on,
          expires_on: r.doc_expires_on,
          visible_text: r.extracted_text,
        };
      }),
    );

    // A página 1 passa a guardar a leitura consolidada do documento inteiro.
    await (supabase as any)
      .from("uploaded_files")
      .update({
        document_type: merged.doc_type ?? null,
        doc_artigo_matricial: merged.artigo_matricial ?? null,
        doc_fracao: merged.fracao ?? null,
        doc_morada: merged.morada ?? null,
        doc_nif: merged.nif ?? null,
        doc_issued_on: merged.issued_on ?? null,
        doc_expires_on: merged.expires_on ?? null,
      })
      .eq("id", ordered[0])
      .eq("user_id", userId);

    return { ok: true, pages: ordered.length, merged };
  });
