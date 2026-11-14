// Piloto AFONSO 2.0 — partes puras (sem base de dados).
//
// A participação no piloto é um direito próprio, guardado em
// `pilot_participants`. Não depende de beta, plano, papel (RBAC) nem canais,
// e não os altera. Com `pilot.v2_entitlement.v1` desligado nada muda.

export const PILOT_KEY = "afonso_v2";

/** Ligado (globalmente): as funções 2.0 só correm para participantes ativos. */
export const PILOT_ENTITLEMENT_FLAG = "pilot.v2_entitlement.v1";
/** Por conta (emissor): "dá-me um convite" passa a dar convites do piloto. */
export const PILOT_INVITES_FLAG = "pilot.v2_invites.v1";

/**
 * Funções AFONSO 2.0 que exigem participação no piloto quando o interruptor
 * do piloto está ligado. O teto diário de avisos e o acesso antecipado ficam
 * de fora de propósito: são proteções, não funções.
 */
export const PILOT_GATED_FLAGS: ReadonlySet<string> = new Set([
  "assessor.action_first_qualification.v1",
  "assessor.cross_channel.v1",
  "assessor.cross_link.v1",
  "assessor.opportunity_nudges.v1",
  "assessor.base_match_opportunity.v1",
]);

export type PilotInviteOutcome = "issued" | "replayed" | "not_open" | "cap_reached" | "not_issuer" | "no_pilot";

// --- Textos (PT-PT, "tu") ---------------------------------------------------

export function pilotInviteIssuedReply(code: string, remaining: number, ttlDays: number): string {
  const rest = remaining <= 0 ? "Era o último convite do piloto." : `Fica ${remaining} por usar no piloto.`;
  return `Aqui tens um convite para o piloto, válido ${ttlDays} dias e só para uma pessoa:\n\n${code}\n\n` +
    `A pessoa só tem de mo enviar na primeira conversa. ${rest}`;
}
export const PILOT_NOT_OPEN_REPLY = "Os convites do piloto ainda não estão abertos. Aviso-te quando estiverem.";
export const PILOT_CAP_REPLY =
  "Os convites do piloto já estão todos em uso. Se um expirar sem ser usado, ou o anulares, voltas a poder gerar.";
export const PILOT_REPLAYED_REPLY =
  "Esse convite já foi gerado a partir desta mensagem. Se perdeste o código, anula-o e pede outro.";
export const PILOT_ERROR_REPLY = "Não consegui gerar o convite agora. Tenta daqui a pouco.";
