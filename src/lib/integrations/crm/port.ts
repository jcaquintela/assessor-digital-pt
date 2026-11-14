// AFONSO 2.0 — porta para CRM EXTERNOS (decisões 16, 21). O Afonso não é um CRM
// e não constrói um: só se liga, a pedido e com consentimento individual, ao
// CRM que o consultor já usa. Nenhum conector está implementado ainda.

export type CrmScope = "read_contacts" | "read_listings" | "read_deals" | "write_notes" | "write_tasks";

export interface CrmConnector {
  id: string;
  displayName: string;
  scopes: readonly CrmScope[];
}

/** Registo vazio de propósito: cada conector novo exige autorização do proprietário. */
export const CRM_CONNECTORS: readonly CrmConnector[] = [];

export interface CrmConsent {
  userId: string;
  connectorId: string;
  scopes: readonly CrmScope[];
  grantedAt: string;
  revokedAt?: string | null;
}

export interface CrmOperation {
  userId: string;
  connectorId: string;
  scope: CrmScope;
  /** Escrever no CRM externo é ação externa: exige aprovação desta ação concreta. */
  approvedActionId?: string | null;
}

const isWrite = (s: CrmScope) => s.startsWith("write_");

export function checkCrmOperation(
  op: CrmOperation,
  consent: CrmConsent | null,
  connectors: readonly CrmConnector[] = CRM_CONNECTORS,
): { allowed: true } | { allowed: false; reason: string } {
  const c = connectors.find((x) => x.id === op.connectorId);
  if (!c) return { allowed: false, reason: "conector_inexistente" };
  if (!c.scopes.includes(op.scope)) return { allowed: false, reason: "ambito_nao_suportado" };
  if (!consent || consent.userId !== op.userId || consent.connectorId !== op.connectorId)
    return { allowed: false, reason: "sem_consentimento" };
  if (consent.revokedAt) return { allowed: false, reason: "consentimento_revogado" };
  if (!consent.scopes.includes(op.scope)) return { allowed: false, reason: "ambito_nao_consentido" };
  if (isWrite(op.scope) && !op.approvedActionId) return { allowed: false, reason: "escrita_sem_aprovacao" };
  return { allowed: true };
}
