// Resolução do âmbito da conversa (por canal ou por conta) com I/O.
//
// Fonte principal: o turno em curso. O pipeline de entrada resolve o
// interruptor UMA vez por turno e regista a conta aqui (`enterSharedTurn`);
// todos os ajudantes de memória chamados durante esse turno leem o registo
// sem nova consulta. Fora de um turno (ou em testes com base simulada),
// cai para uma leitura em cache do interruptor; qualquer erro = desligado.

import {
  ACCOUNT_SCOPE,
  CROSS_CHANNEL_FLAG,
  MESSAGING_CHANNELS,
  isMessagingChannel,
  scopeFor,
  stateKeyFor,
  type ConversationScope,
  type StateKey,
} from "./scope";

const activeSharedTurns = new Map<string, number>();
const flagCache = new Map<string, { value: boolean; until: number }>();
const FLAG_CACHE_MS = 30_000;
const testOverrides = new Map<string, boolean>();

/** Só para testes: força o interruptor para uma conta (null limpa). */
export function __setCrossChannelForTests(userId: string, value: boolean | null): void {
  if (value === null) testOverrides.delete(userId);
  else testOverrides.set(userId, value);
  flagCache.delete(userId);
}

export function __resetCrossChannelStateForTests(): void {
  testOverrides.clear();
  flagCache.clear();
  activeSharedTurns.clear();
}

export function enterSharedTurn(userId: string): void {
  activeSharedTurns.set(userId, (activeSharedTurns.get(userId) ?? 0) + 1);
}

export function exitSharedTurn(userId: string): void {
  const n = (activeSharedTurns.get(userId) ?? 0) - 1;
  if (n <= 0) activeSharedTurns.delete(userId);
  else activeSharedTurns.set(userId, n);
}

/**
 * O interruptor está ligado para esta conta? Global OU linha em
 * `feature_flag_users`. Falha fechada: qualquer erro = desligado.
 */
export async function isCrossChannelEnabled(supabase: any, userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  if (testOverrides.has(userId)) return testOverrides.get(userId) === true;
  const cached = flagCache.get(userId);
  if (cached && cached.until > Date.now()) return cached.value;
  let value = false;
  try {
    const { data: flag } = await supabase
      .from("feature_flags")
      .select("enabled_globally")
      .eq("key", CROSS_CHANNEL_FLAG)
      .maybeSingle();
    if (flag?.enabled_globally === true) {
      value = true;
    } else if (flag) {
      const { data: row } = await supabase
        .from("feature_flag_users")
        .select("user_id")
        .eq("flag_key", CROSS_CHANNEL_FLAG)
        .eq("user_id", userId)
        .maybeSingle();
      value = !!row && (row as any).user_id === userId;
    }
  } catch {
    value = false;
  }
  flagCache.set(userId, { value, until: Date.now() + FLAG_CACHE_MS });
  return value;
}

async function isShared(supabase: any, userId: string, channel: string): Promise<boolean> {
  if (!isMessagingChannel(channel)) return false;
  if (activeSharedTurns.has(userId)) return true;
  return isCrossChannelEnabled(supabase, userId);
}

export async function resolveScope(supabase: any, userId: string, channel: string): Promise<ConversationScope> {
  return scopeFor(await isShared(supabase, userId, channel), channel);
}

/** Canais que contam como "esta conversa" para pendentes e histórico. */
export async function scopeChannels(supabase: any, userId: string, channel: string): Promise<string[]> {
  return (await resolveScope(supabase, userId, channel)).channels;
}

export async function stateKey(
  supabase: any,
  userId: string,
  channel: string,
  fallbackExternalId: string = channel,
): Promise<StateKey> {
  return stateKeyFor(await isShared(supabase, userId, channel), channel, fallbackExternalId);
}

/** `.eq("channel", x)` quando há um só canal (idêntico ao antigo), `.in` quando partilhado. */
export function applyChannelScope<Q extends { eq: any; in: any }>(q: Q, channels: string[]): Q {
  return channels.length === 1 ? q.eq("channel", channels[0]) : q.in("channel", channels);
}

const STATE_COPY_FIELDS = [
  "active_topic", "state_summary", "last_intent", "last_entity_type", "last_entity_id",
  "pending_action_id", "last_created_resource_type", "last_created_resource_id",
  "last_property_id", "goal", "factual_summary", "active_person_id", "sparring_turns",
  "last_read_tool", "last_read_args", "last_read_axis", "last_read_at",
] as const;

/**
 * Compatibilidade com conversas existentes: na primeira vez que a conta
 * entra em modo partilhado, a linha da conta nasce como cópia do estado
 * por canal mais recente (WhatsApp ou Telegram). As linhas por canal ficam
 * intactas — desligar o interruptor volta a usá-las.
 */
export async function ensureAccountState(supabase: any, userId: string): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from("conversation_states")
      .select("id")
      .eq("user_id", userId)
      .eq("channel", ACCOUNT_SCOPE)
      .eq("external_conversation_id", ACCOUNT_SCOPE)
      .maybeSingle();
    if ((existing as any)?.id) return;
    const { data: rows } = await supabase
      .from("conversation_states")
      .select("*")
      .eq("user_id", userId)
      .in("channel", [...MESSAGING_CHANNELS])
      .order("updated_at", { ascending: false })
      .limit(1);
    const src = ((rows as any[]) ?? [])[0] ?? null;
    const row: Record<string, unknown> = {
      user_id: userId,
      channel: ACCOUNT_SCOPE,
      external_conversation_id: ACCOUNT_SCOPE,
      last_channel: src?.channel ?? null,
    };
    if (src) for (const f of STATE_COPY_FIELDS) if (src[f] !== undefined) row[f] = src[f];
    await supabase
      .from("conversation_states")
      .upsert(row as never, { onConflict: "user_id,channel,external_conversation_id", ignoreDuplicates: true });
  } catch {
    /* memória auxiliar: nunca parte o turno */
  }
}
