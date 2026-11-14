// Guarda de turno da conversa partilhada (WhatsApp + Telegram, por conta).
//
// Corre só quando o interruptor está ligado para a conta, dentro do lock de
// turno da conta. Três garantias:
//   1. Resposta cega no canal B a uma pergunta só mostrada no canal A →
//      volta a perguntar em B; nada é executado (nunca a ação errada).
//   2. Reserva atómica dos pendentes que a resposta pode resolver: dois
//      turnos (um por canal) nunca confirmam o mesmo pendente ao mesmo
//      tempo, mesmo que o lock falhe (no máximo uma execução).
//   3. No fim do turno, os pendentes criados ou re-perguntados aqui ficam
//      marcados como "mostrados neste canal"; a reserva é libertada e o
//      canal onde o consultor respondeu fica registado.

import {
  ACTIVE_PENDING_STATUSES,
  BUSY_TEXT,
  alreadyResolvedText,
  decideBinding,
  representText,
  type PendingLite,
} from "./binding";
import { MESSAGING_CHANNELS } from "./scope";

const PENDING_COLS =
  "id, channel, intent, status, presented_channels, current_question, pending_question, structured_payload, original_content, created_at, updated_at, resolved_channel, expires_at";
const RESOLVED_WINDOW_MS = 10 * 60_000;

export interface ActiveSnapshot {
  rows: Map<string, string>; // id → assinatura (pergunta + payload)
}

function signature(r: any): string {
  return JSON.stringify([r?.current_question ?? null, r?.pending_question ?? null, r?.structured_payload ?? null]);
}

async function listActive(supabase: any, userId: string): Promise<PendingLite[]> {
  const { data } = await supabase
    .from("pending_actions")
    .select(PENDING_COLS)
    .eq("user_id", userId)
    .in("channel", [...MESSAGING_CHANNELS])
    .in("status", [...ACTIVE_PENDING_STATUSES])
    .order("created_at", { ascending: false })
    .limit(20);
  const now = Date.now();
  return ((data as any[]) ?? []).filter(
    (r) => !r?.expires_at || Date.parse(r.expires_at) > now,
  ) as PendingLite[];
}

async function listRecentlyResolved(supabase: any, userId: string): Promise<PendingLite[]> {
  const since = new Date(Date.now() - RESOLVED_WINDOW_MS).toISOString();
  const { data } = await supabase
    .from("pending_actions")
    .select(PENDING_COLS)
    .eq("user_id", userId)
    .in("channel", [...MESSAGING_CHANNELS])
    .in("status", ["executed", "cancelled", "corrected"])
    .gte("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(5);
  return ((data as any[]) ?? []) as PendingLite[];
}

export async function snapshotActive(supabase: any, userId: string): Promise<ActiveSnapshot> {
  try {
    const rows = await listActive(supabase, userId);
    return { rows: new Map(rows.map((r) => [r.id, signature(r)])) };
  } catch {
    return { rows: new Map() };
  }
}

export type TurnGate =
  | { kind: "proceed"; claimed: boolean }
  | { kind: "reply"; text: string; reason: "represent" | "already_resolved" | "busy" };

export async function beginCrossChannelTurn(
  supabase: any,
  args: { userId: string; channel: string; text: string; token: string },
): Promise<TurnGate> {
  let active: PendingLite[] = [];
  let resolved: PendingLite[] = [];
  try {
    active = await listActive(supabase, args.userId);
  } catch {
    return { kind: "proceed", claimed: false };
  }
  let decision = decideBinding({ text: args.text, channel: args.channel, active });
  if (decision.kind === "proceed" && !active.length) {
    try { resolved = await listRecentlyResolved(supabase, args.userId); } catch { resolved = []; }
    decision = decideBinding({ text: args.text, channel: args.channel, active, recentlyResolved: resolved });
  }

  if (decision.kind === "represent") {
    const { describePendingPt } = await import("../misc-text");
    try {
      await supabase.rpc("mark_pending_presented", {
        _user_id: args.userId, _ids: [decision.pending.id], _channel: args.channel,
      });
    } catch { /* a re-pergunta sai na mesma; só a marca falha */ }
    return {
      kind: "reply",
      reason: "represent",
      text: representText(decision.pending, (p) =>
        describePendingPt(p.intent, p.structured_payload ?? {}, p.original_content ?? null)),
    };
  }
  if (decision.kind === "already_resolved") {
    return { kind: "reply", reason: "already_resolved", text: alreadyResolvedText(decision.resolvedChannel) };
  }
  if (decision.kind === "bind") {
    try {
      const { data, error } = await supabase.rpc("claim_pending_confirmation", {
        _user_id: args.userId, _ids: decision.pendingIds, _token: args.token, _ttl_seconds: 120,
      });
      if (error) return { kind: "reply", reason: "busy", text: BUSY_TEXT };
      const n = Number(data ?? 0);
      if (n < decision.pendingIds.length) {
        // Outro turno já reservou pelo menos um: devolve o que se apanhou.
        try {
          await supabase.rpc("release_pending_confirmation", {
            _user_id: args.userId, _token: args.token, _channel: args.channel,
          });
        } catch { /* TTL liberta */ }
        return { kind: "reply", reason: "busy", text: BUSY_TEXT };
      }
      return { kind: "proceed", claimed: true };
    } catch {
      return { kind: "reply", reason: "busy", text: BUSY_TEXT };
    }
  }
  return { kind: "proceed", claimed: false };
}

export async function endCrossChannelTurn(
  supabase: any,
  args: { userId: string; channel: string; token: string; claimed: boolean; before: ActiveSnapshot },
): Promise<void> {
  if (args.claimed) {
    try {
      await supabase.rpc("release_pending_confirmation", {
        _user_id: args.userId, _token: args.token, _channel: args.channel,
      });
    } catch { /* TTL liberta */ }
  }
  // Pendentes criados ou re-perguntados neste turno: foram mostrados aqui.
  try {
    const after = await listActive(supabase, args.userId);
    const touched = after
      .filter((r) => {
        const prev = args.before.rows.get(r.id);
        if (prev === undefined) return r.channel === args.channel;
        return prev !== signature(r);
      })
      .map((r) => r.id);
    if (touched.length) {
      await supabase.rpc("mark_pending_presented", {
        _user_id: args.userId, _ids: touched, _channel: args.channel,
      });
    }
  } catch { /* marca auxiliar */ }
}
