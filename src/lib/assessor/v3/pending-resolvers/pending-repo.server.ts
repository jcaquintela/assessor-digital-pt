// PendingRepo — único ponto de acesso a `pending_actions` e
// `conversation_states` a partir dos ramos de pendente.
//
// Não decide nada: só lê e escreve. A decisão vive nos resolvers, que assim
// deixam de conhecer nomes de tabelas ou formatos de chave de conflito.

import {
  findActivePendingAction,
  markPendingActionStatus,
} from "../../memory.server";

export interface PendingStatusExtras {
  created_resource_type?: string | null;
  created_resource_id?: string | null;
  error_message?: string | null;
}

export const PendingRepo = {
  /** Rascunho vivo para este consultor/canal (ou null). */
  async findActive(supabase: any, userId: string, channel: string) {
    return findActivePendingAction(supabase, userId, channel);
  },

  /** Fecha o rascunho com um estado final (executed | failed | cancelled | expired). */
  async markStatus(
    supabase: any,
    pendingId: string,
    status: string,
    extras?: PendingStatusExtras,
  ) {
    return markPendingActionStatus(supabase, pendingId, status as never, extras as never);
  },

  /**
   * Reescreve o payload do rascunho (usado para fixar candidatos rejeitados).
   * Falhas aqui nunca podem partir o turno — é memória auxiliar.
   */
  async patchPayload(
    supabase: any,
    args: { pendingId: string; userId: string; payload: Record<string, unknown> },
  ): Promise<void> {
    try {
      await supabase
        .from("pending_actions")
        .update({ structured_payload: args.payload } as never)
        .eq("id", args.pendingId)
        .eq("user_id", args.userId);
    } catch { /* noop */ }
  },

  /** Guarda "de que é que estávamos a falar" para o turno seguinte. */
  async rememberLastEntity(
    supabase: any,
    args: {
      userId: string;
      channel: string;
      entityType: string;
      entityId: string;
      intent: string;
    },
  ): Promise<void> {
    try {
      await supabase.from("conversation_states").upsert(
        {
          user_id: args.userId,
          channel: args.channel,
          external_conversation_id: args.channel,
          last_entity_type: args.entityType,
          last_entity_id: args.entityId,
          last_intent: args.intent,
        } as never,
        { onConflict: "user_id,channel,external_conversation_id" },
      );
    } catch { /* noop */ }
  },
};
