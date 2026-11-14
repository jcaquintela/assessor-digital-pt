// Estado do modo treino — leitura e escrita directas em `conversation_states`.
//
// Existe para o motor poder saber se está em treino ANTES de qualquer atalho
// determinístico correr (agenda, Drive, conclusões), e para a app poder ligar
// o treino explicitamente quando o consultor escolhe "Treino de objeções".
//
// Sem `upsert` de propósito: select → update/insert, para funcionar também com
// o fake de testes.

import { stateKey } from "@/lib/assessor/cross-channel/scope.server";
import { SPARRING_PAUSED_TOPIC, SPARRING_TOPIC } from "./sparring";

type Client = {
  from: (t: string) => any;
};

export interface SparringStateRow {
  active_topic: string | null;
  sparring_turns: number | null;
  updated_at: string | null;
}

export async function readSparringState(
  supabase: Client,
  userId: string,
  channel: string,
): Promise<SparringStateRow | null> {
  const k = await stateKey(supabase, userId, channel);
  let q = supabase
    .from("conversation_states")
    .select("active_topic, sparring_turns, updated_at")
    .eq("user_id", userId)
    .eq("channel", k.channel);
  if (k.shared) q = q.eq("external_conversation_id", k.externalId);
  const { data } = await q.maybeSingle();
  return (data as SparringStateRow) ?? null;
}

export type SparringTopic = typeof SPARRING_TOPIC | typeof SPARRING_PAUSED_TOPIC | null;

export async function setSparringTopic(
  supabase: Client,
  userId: string,
  channel: string,
  topic: SparringTopic,
  turns = 0,
): Promise<void> {
  const patch = {
    active_topic: topic,
    sparring_turns: turns,
    updated_at: new Date().toISOString(),
  };
  const k = await stateKey(supabase, userId, channel);
  let sel = supabase
    .from("conversation_states")
    .select("id")
    .eq("user_id", userId)
    .eq("channel", k.channel);
  if (k.shared) sel = sel.eq("external_conversation_id", k.externalId);
  const { data } = await sel.maybeSingle();
  if ((data as { id?: string } | null)?.id) {
    let up = supabase
      .from("conversation_states")
      .update({ ...patch, ...k.extra } as never)
      .eq("user_id", userId)
      .eq("channel", k.channel);
    if (k.shared) up = up.eq("external_conversation_id", k.externalId);
    await up;
    return;
  }
  await supabase.from("conversation_states").insert({
    user_id: userId,
    channel: k.channel,
    external_conversation_id: k.externalId,
    ...k.extra,
    ...patch,
  } as never);
}

/** Liga o treino (entrada explícita a partir da app). */
export function startSparring(supabase: Client, userId: string, channel: string) {
  return setSparringTopic(supabase, userId, channel, SPARRING_TOPIC, 0);
}

/** Desliga o treino (comando explícito ou inatividade). */
export function stopSparring(supabase: Client, userId: string, channel: string) {
  return setSparringTopic(supabase, userId, channel, null, 0);
}
