import { describe, it, expect } from "vitest";
import { checkCrmOperation, CRM_CONNECTORS, type CrmConnector, type CrmConsent } from "./port";

const hub: CrmConnector = { id: "x", displayName: "CRM X", scopes: ["read_contacts", "write_notes"] };
const consent: CrmConsent = { userId: "u1", connectorId: "x", scopes: ["read_contacts", "write_notes"], grantedAt: "2026-11-14T00:00:00Z" };

describe("CRM externo — só com consentimento individual", () => {
  it("sem conectores implementados, nada passa", () => {
    expect(CRM_CONNECTORS).toHaveLength(0);
    expect(checkCrmOperation({ userId: "u1", connectorId: "x", scope: "read_contacts" }, consent)).toEqual({ allowed: false, reason: "conector_inexistente" });
  });
  it("leitura com consentimento passa", () => {
    expect(checkCrmOperation({ userId: "u1", connectorId: "x", scope: "read_contacts" }, consent, [hub])).toEqual({ allowed: true });
  });
  it("consentimento de outra conta não serve", () => {
    expect(checkCrmOperation({ userId: "u2", connectorId: "x", scope: "read_contacts" }, consent, [hub])).toMatchObject({ allowed: false, reason: "sem_consentimento" });
  });
  it("consentimento revogado bloqueia", () => {
    expect(checkCrmOperation({ userId: "u1", connectorId: "x", scope: "read_contacts" }, { ...consent, revokedAt: "2026-11-15T00:00:00Z" }, [hub])).toMatchObject({ reason: "consentimento_revogado" });
  });
  it("escrita exige aprovação da ação concreta", () => {
    expect(checkCrmOperation({ userId: "u1", connectorId: "x", scope: "write_notes" }, consent, [hub])).toMatchObject({ reason: "escrita_sem_aprovacao" });
    expect(checkCrmOperation({ userId: "u1", connectorId: "x", scope: "write_notes", approvedActionId: "p1" }, consent, [hub])).toEqual({ allowed: true });
  });
  it("âmbito não consentido bloqueia", () => {
    expect(checkCrmOperation({ userId: "u1", connectorId: "x", scope: "write_notes", approvedActionId: "p1" }, { ...consent, scopes: ["read_contacts"] }, [hub])).toMatchObject({ reason: "ambito_nao_consentido" });
  });
});
