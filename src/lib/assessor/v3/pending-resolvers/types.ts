// Contrato comum dos ramos de pendente extraídos do motor v3.
//
// Cada ramo recebe o mesmo contexto e devolve `{ reply }` quando trata o
// turno, ou `null` quando não é o dono deste pendente — exactamente como o
// código inline fazia (cair para o ramo seguinte).

import type { DomainContext } from "../../v2/domain.server";

export interface PendingCtx {
  ctx: DomainContext;
  supabase: any;
  userId: string;
  channel: string;
  trimmed: string;
  pending: any | null;
}

export type PendingReply = { reply: string } | null;
export type PendingResolver = (pc: PendingCtx) => Promise<PendingReply>;
