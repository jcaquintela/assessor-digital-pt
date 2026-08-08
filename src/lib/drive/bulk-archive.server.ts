// Lado com base de dados do arquivo em lote por conversa.
//
// A IA nunca escreve: aqui só há consultas e um update determinístico,
// executado depois de o consultor confirmar a lista que viu.

import { createPendingAction } from "@/lib/assessor/memory.server";
import {
  BULK_ARCHIVE_MAX,
  CONFIRM_BULK_ARCHIVE_INTENT,
  type BulkArchiveRequest,
  type BulkKind,
  buildBulkArchiveQuestion,
  noMatchesReply,
  tooManyReply,
} from "./bulk-archive";

export type BulkCandidate = { id: string; name: string };

function applyKindFilter(query: any, kind: BulkKind) {
  if (kind === "audio") return query.ilike("mime_type", "audio/%");
  if (kind === "image") return query.ilike("mime_type", "image/%");
  if (kind === "document") return query.not("mime_type", "ilike", "audio/%").not("mime_type", "ilike", "image/%");
  return query;
}

/** Ficheiros activos (não arquivados, não na reciclagem) que batem o pedido. */
export async function findBulkCandidates(
  supabase: any,
  userId: string,
  req: BulkArchiveRequest,
): Promise<BulkCandidate[]> {
  let query = supabase
    .from("uploaded_files")
    .select("id, original_file_name, created_at")
    .eq("user_id", userId)
    .is("archived_at", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(BULK_ARCHIVE_MAX + 1);
  query = applyKindFilter(query, req.kind);
  if (req.term) query = query.ilike("original_file_name", `%${req.term}%`);
  const { data } = await query;
  return (Array.isArray(data) ? data : []).map((row: any, i: number) => ({
    id: String(row.id),
    name: String(row.original_file_name ?? "").trim() || `Ficheiro ${i + 1}`,
  }));
}

/**
 * Prepara o lote: devolve a pergunta com a lista à vista, ou a mensagem de
 * "não encontrei"/"são demasiados". Nunca arquiva nada aqui.
 */
export async function proposeBulkArchive(
  supabase: any,
  input: { userId: string; channel: string; req: BulkArchiveRequest; originalContent: string },
): Promise<string> {
  const files = await findBulkCandidates(supabase, input.userId, input.req);
  if (files.length === 0) return noMatchesReply(input.req);
  if (files.length > BULK_ARCHIVE_MAX) return tooManyReply(input.req.kind, files.length);

  const question = buildBulkArchiveQuestion(input.req.kind, files.map((f) => f.name));
  await createPendingAction(supabase, {
    userId: input.userId,
    channel: input.channel,
    intent: CONFIRM_BULK_ARCHIVE_INTENT,
    originalContent: input.originalContent.slice(0, 2000),
    // Guardamos também os nomes: o painel volta a desenhar a lista numerada
    // exactamente como o consultor a viu, sem ter de reler o Drive.
    payload: {
      kind: input.req.kind,
      file_ids: files.map((f) => f.id),
      file_names: files.map((f) => f.name),
    },
    pendingQuestion: question,
    currentQuestion: question,
  });
  return question;
}

/** Arquiva (reversível) os ficheiros confirmados. Devolve quantos arquivou. */
export async function archiveFilesBulk(
  supabase: any,
  userId: string,
  fileIds: string[],
): Promise<number> {
  const ids = fileIds.filter(Boolean);
  if (ids.length === 0) return 0;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("uploaded_files")
    .update({ archived_at: now, processing_status: "archived" } as never)
    .in("id", ids)
    .eq("user_id", userId)
    .is("archived_at", null)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  return ids.length;
}