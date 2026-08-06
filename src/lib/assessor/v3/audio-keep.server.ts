// Lado com base de dados da regra "guardo ou descarto" do áudio.

import { createPendingAction } from "../memory.server";
import {
  CONFIRM_KEEP_AUDIO_INTENT,
  buildAudioKeepQuestion,
  shouldAskKeepAudio,
  summariseAudio,
} from "./audio-keep";

/** Manda o ficheiro para a Reciclagem (24h) — nunca apaga fisicamente aqui. */
export async function discardAudioFile(
  supabase: any,
  fileId: string,
  userId: string,
): Promise<void> {
  await supabase
    .from("uploaded_files")
    .update({ deleted_at: new Date().toISOString(), processing_status: "deleted" } as never)
    .eq("id", fileId)
    .eq("user_id", userId);
}

export async function keepAudioFile(
  supabase: any,
  fileId: string,
  userId: string,
): Promise<void> {
  await supabase
    .from("uploaded_files")
    .update({ deleted_at: null, processing_status: "organized" } as never)
    .eq("id", fileId)
    .eq("user_id", userId);
}

/**
 * Último áudio que o consultor mandou guardar, dentro da janela de desfazer.
 * Devolve o id do ficheiro, ou null quando não há nada recente para desfazer.
 */
export async function findRecentlyKeptAudio(
  supabase: any,
  userId: string,
  channel: string,
  windowMs: number,
): Promise<{ pendingId: string; fileId: string } | null> {
  const since = new Date(Date.now() - windowMs).toISOString();
  const { data } = await supabase
    .from("pending_actions")
    .select("id, created_resource_id, updated_at")
    .eq("user_id", userId)
    .eq("channel", channel)
    .eq("intent", CONFIRM_KEEP_AUDIO_INTENT)
    .eq("status", "executed")
    .gte("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(1);
  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.created_resource_id) return null;
  return { pendingId: String(row.id), fileId: String(row.created_resource_id) };
}

/**
 * Cria o rascunho "confirm_keep_audio" e devolve a pergunta, ou null quando
 * não se aplica (áudio social, sem ficheiro, ou outra pergunta em aberto).
 */
export async function askKeepAudio(
  supabase: any,
  input: {
    userId: string;
    channel: string;
    fileId: string | null;
    transcript: string;
    subject?: string | null;
    sourceMessageId?: string | null;
  },
): Promise<string | null> {
  if (!input.fileId) return null;
  if (!shouldAskKeepAudio(input.transcript)) return null;
  const question = buildAudioKeepQuestion(summariseAudio(input.transcript, input.subject));
  const created = await createPendingAction(supabase, {
    userId: input.userId,
    channel: input.channel,
    intent: CONFIRM_KEEP_AUDIO_INTENT,
    originalContent: input.transcript.slice(0, 2000),
    payload: { file_id: input.fileId },
    pendingQuestion: question,
    currentQuestion: question,
    sourceMessageId: input.sourceMessageId ?? null,
  });
  return created ? question : null;
}
