// Golden tests — Fase 3: eliminação permanente de Pessoas, Imóveis e Negócios.
// Esta fase mexe em retenção fiscal, por isso cada bloqueio tem teste próprio.
import { describe, it, expect } from "vitest";
import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";
import {
  assessEntityDeletion,
  permanentlyDeleteEntity,
  anonymizePerson,
} from "./entity-delete.server";
import { isAnonymizedPerson } from "./entity-delete";

const USER = "df098797-b532-40bb-a298-003ef99fe81a";
const PESSOA = "aa11bb22-cc33-dd44-ee55-ff6677889900";
const IMOVEL = "bb22cc33-dd44-ee55-ff66-778899001122";
const NEGOCIO = "cc33dd44-ee55-ff66-7788-990011223344";

function db(seed: Record<string, any[]> = {}) {
  return makeFakeSupabase({ admin_audit_logs: [], ...seed });
}

const pessoaBase = {
  id: PESSOA,
  user_id: USER,
  name: "Iolanda Ramos",
  phone: "+351912345678",
  email: "iolanda@exemplo.pt",
  archived_at: "2026-09-01T10:00:00.000Z",
};
const imovelBase = {
  id: IMOVEL,
  user_id: USER,
  title: "T2 na Boavista",
  status: "arquivado",
  archived_at: "2026-09-01T10:00:00.000Z",
};
const negocioBase = {
  id: NEGOCIO,
  user_id: USER,
  title: "Venda T2 Boavista",
  stage: "perdido",
  archived_at: "2026-09-01T10:00:00.000Z",
};

/* 1 */
describe("1. negócio com movimento financeiro", () => {
  it("bloqueia em absoluto e a opção de eliminar não fica disponível", async () => {
    const sb = db({
      opportunities: [negocioBase],
      financial_movements: [
        { id: "mov-1", user_id: USER, opportunity_id: NEGOCIO, type: "commission", amount: 4200 },
      ],
    });
    const a = await assessEntityDeletion(sb as any, { userId: USER, type: "opportunity", id: NEGOCIO });
    expect(a.blocked).toBe(true);
    expect(a.canDelete).toBe(false);
    expect(a.canAnonymize).toBe(false);
    expect(a.blockReasons.join(" ")).toMatch(/movimentos financeiros/i);

    await expect(
      permanentlyDeleteEntity(sb as any, {
        userId: USER, type: "opportunity", id: NEGOCIO, reason: "engano",
      }),
    ).rejects.toThrow(/movimentos financeiros/i);
    expect(sb.state.opportunities).toHaveLength(1);
  });
});

/* 2 */
describe("2. negócio sem movimento financeiro", () => {
  it("elimina em cascata prazos, eventos e imóveis ligados", async () => {
    const sb = db({
      opportunities: [negocioBase],
      financial_movements: [],
      deal_deadlines: [{ id: "pz-1", user_id: USER, opportunity_id: NEGOCIO, label: "CPCV" }],
      opportunity_events: [{ id: "ev-1", user_id: USER, opportunity_id: NEGOCIO, kind: "stage" }],
      opportunity_properties: [{ id: "op-1", user_id: USER, opportunity_id: NEGOCIO, property_id: IMOVEL }],
      follow_ups: [{ id: "fu-1", user_id: USER, opportunity_id: NEGOCIO, title: "Ligar" }],
    });
    const res = await permanentlyDeleteEntity(sb as any, {
      userId: USER, type: "opportunity", id: NEGOCIO, reason: "negócio duplicado",
    });
    expect(res.deleted).toBe(true);
    expect(sb.state.opportunities).toHaveLength(0);
    expect(sb.state.deal_deadlines).toHaveLength(0);
    expect(sb.state.opportunity_events).toHaveLength(0);
    expect(sb.state.opportunity_properties).toHaveLength(0);
    // O seguimento sobrevive, só perde a ligação.
    expect(sb.state.follow_ups).toHaveLength(1);
    expect(sb.state.follow_ups[0].opportunity_id).toBeNull();
  });
});

/* 3 */
describe("3. pessoa com histórico contabilístico", () => {
  it("oferece anonimização e não eliminação", async () => {
    const sb = db({
      people: [pessoaBase],
      opportunities: [{ id: NEGOCIO, user_id: USER, person_id: PESSOA, stage: "concluido" }],
      financial_movements: [
        { id: "mov-1", user_id: USER, opportunity_id: NEGOCIO, type: "commission", amount: 5000 },
      ],
      properties: [{ ...imovelBase, owner_person_id: PESSOA }],
    });
    const a = await assessEntityDeletion(sb as any, { userId: USER, type: "person", id: PESSOA });
    expect(a.blocked).toBe(true);
    expect(a.canDelete).toBe(false);
    expect(a.canAnonymize).toBe(true);

    await expect(
      permanentlyDeleteEntity(sb as any, { userId: USER, type: "person", id: PESSOA, reason: "pedido RGPD" }),
    ).rejects.toThrow();

    const r = await anonymizePerson(sb as any, {
      userId: USER, id: PESSOA, reason: "pedido de apagamento RGPD",
    });
    expect(r.anonymized).toBe(true);
    const p = sb.state.people[0];
    expect(isAnonymizedPerson(p)).toBe(true);
    expect(p.phone).toBeNull();
    expect(p.email).toBeNull();
    // Histórico contabilístico intacto.
    expect(sb.state.opportunities).toHaveLength(1);
    expect(sb.state.financial_movements).toHaveLength(1);
    expect(sb.state.financial_movements[0].amount).toBe(5000);
  });
});

/* 4 */
describe("4. pessoa sem dependências", () => {
  it("mostra a contagem certa e elimina em cascata", async () => {
    const sb = db({
      people: [pessoaBase],
      opportunities: [],
      properties: [],
      financial_movements: [],
      person_phones: [{ id: "tel-1", user_id: USER, person_id: PESSOA, raw: "912345678" }],
      interactions: [
        { id: "int-1", user_id: USER, person_id: PESSOA },
        { id: "int-2", user_id: USER, person_id: PESSOA },
        { id: "int-3", user_id: USER, person_id: PESSOA },
      ],
      follow_ups: [
        { id: "fu-1", user_id: USER, person_id: PESSOA },
        { id: "fu-2", user_id: USER, person_id: PESSOA },
      ],
      email_drafts: [{ id: "ed-1", user_id: USER, person_id: PESSOA }],
    });
    const a = await assessEntityDeletion(sb as any, { userId: USER, type: "person", id: PESSOA });
    expect(a.blocked).toBe(false);
    expect(a.canDelete).toBe(true);
    expect(a.cascade.map((c) => c.label)).toEqual([
      "1 contacto",
      "3 interações",
      "2 seguimentos",
      "1 rascunho de email",
    ]);

    await permanentlyDeleteEntity(sb as any, {
      userId: USER, type: "person", id: PESSOA, reason: "contacto criado por engano",
    });
    expect(sb.state.people).toHaveLength(0);
    expect(sb.state.person_phones).toHaveLength(0);
    expect(sb.state.interactions).toHaveLength(0);
    expect(sb.state.follow_ups).toHaveLength(0);
    expect(sb.state.email_drafts).toHaveLength(0);
  });
});

/* 5 */
describe("5. imóvel ligado a negócio em curso ou a comissões", () => {
  it("bloqueia por negócio em curso", async () => {
    const sb = db({
      properties: [imovelBase],
      opportunities: [{ id: NEGOCIO, user_id: USER, property_id: IMOVEL, stage: "visitas" }],
      financial_movements: [],
    });
    const a = await assessEntityDeletion(sb as any, { userId: USER, type: "property", id: IMOVEL });
    expect(a.blocked).toBe(true);
    expect(a.blockReasons.join(" ")).toMatch(/negócio em curso/i);
  });

  it("bloqueia por comissões", async () => {
    const sb = db({
      properties: [imovelBase],
      opportunities: [{ id: NEGOCIO, user_id: USER, property_id: IMOVEL, stage: "concluido" }],
      financial_movements: [
        { id: "mov-1", user_id: USER, property_id: IMOVEL, type: "commission", amount: 3000 },
      ],
    });
    const a = await assessEntityDeletion(sb as any, { userId: USER, type: "property", id: IMOVEL });
    expect(a.blocked).toBe(true);
    expect(a.blockReasons.join(" ")).toMatch(/comiss/i);
    await expect(
      permanentlyDeleteEntity(sb as any, { userId: USER, type: "property", id: IMOVEL, reason: "limpeza" }),
    ).rejects.toThrow();
    expect(sb.state.properties).toHaveLength(1);
  });
});

/* 6 */
describe("6. imóvel sem ligações", () => {
  it("elimina em cascata e desliga o que fica", async () => {
    const sb = db({
      properties: [imovelBase],
      opportunities: [{ id: NEGOCIO, user_id: USER, property_id: IMOVEL, stage: "perdido" }],
      financial_movements: [],
      property_interests: [{ id: "pi-1", user_id: USER, property_id: IMOVEL }],
      property_offers: [{ id: "po-1", user_id: USER, property_id: IMOVEL }],
      property_marketing_activities: [{ id: "pm-1", user_id: USER, property_id: IMOVEL }],
      follow_ups: [{ id: "fu-1", user_id: USER, related_property_id: IMOVEL }],
    });
    const a = await assessEntityDeletion(sb as any, { userId: USER, type: "property", id: IMOVEL });
    expect(a.blocked).toBe(false);

    await permanentlyDeleteEntity(sb as any, {
      userId: USER, type: "property", id: IMOVEL, reason: "imóvel inserido duas vezes",
    });
    expect(sb.state.properties).toHaveLength(0);
    expect(sb.state.property_interests).toHaveLength(0);
    expect(sb.state.property_offers).toHaveLength(0);
    expect(sb.state.property_marketing_activities).toHaveLength(0);
    expect(sb.state.follow_ups[0].related_property_id).toBeNull();
    expect(sb.state.opportunities[0].property_id).toBeNull();
  });
});

/* 7 */
describe("7. auditoria", () => {
  it("grava retrato completo antes de eliminar", async () => {
    const sb = db({ properties: [imovelBase], opportunities: [], financial_movements: [] });
    await permanentlyDeleteEntity(sb as any, {
      userId: USER, type: "property", id: IMOVEL, reason: "duplicado",
    });
    const log = sb.state.admin_audit_logs[0];
    expect(log.action).toBe("registo.eliminacao_permanente.property");
    expect(log.reason).toBe("duplicado");
    expect(log.metadata.snapshot.title).toBe("T2 na Boavista");
  });

  it("grava retrato completo antes de anonimizar", async () => {
    const sb = db({
      people: [pessoaBase],
      opportunities: [{ id: NEGOCIO, user_id: USER, person_id: PESSOA, stage: "concluido" }],
      financial_movements: [{ id: "m1", user_id: USER, opportunity_id: NEGOCIO, amount: 100 }],
      person_phones: [{ id: "tel-1", user_id: USER, person_id: PESSOA, raw: "912345678" }],
    });
    await anonymizePerson(sb as any, { userId: USER, id: PESSOA, reason: "pedido RGPD" });
    const log = sb.state.admin_audit_logs[0];
    expect(log.action).toBe("registo.anonimizacao.person");
    expect(log.metadata.snapshot.name).toBe("Iolanda Ramos");
    expect(log.metadata.snapshot.phone).toBe("+351912345678");
    expect(log.metadata.person_phones).toHaveLength(1);
    expect(sb.state.person_phones).toHaveLength(0);
  });

  it("exige registo arquivado", async () => {
    const sb = db({
      properties: [{ ...imovelBase, status: "ativo", archived_at: null }],
      opportunities: [], financial_movements: [],
    });
    await expect(
      permanentlyDeleteEntity(sb as any, { userId: USER, type: "property", id: IMOVEL, reason: "engano" }),
    ).rejects.toThrow(/arquivado/i);
  });
});
