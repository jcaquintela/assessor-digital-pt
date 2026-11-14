// AFONSO 2.0 — quatro gates GO/NO-GO (decisões 9, 12, 50).
// Sequência: G1 testes internos (Júlio) → G2 piloto (Iolanda Ventura, Pedro
// Cunha; 14 dias, checkpoints 1/7/14) → G3 convites → G4 público.
// Nada avança sozinho: GO exige todos os critérios cumpridos, o gate anterior
// em GO e uma autorização expressa do proprietário para esse gate.

export type GateId = "G1_internal" | "G2_pilot" | "G3_invites" | "G4_public";
export type CriterionStatus = "met" | "not_met" | "unverified";

export interface GateCriterion {
  id: string;
  label: string;
  status: CriterionStatus;
  evidence: string;
}

export interface Gate {
  id: GateId;
  title: string;
  previous: GateId | null;
  criteria: GateCriterion[];
}

export interface GateAuthorization {
  gate: GateId;
  by: string;
  at: string;
}

export interface GateDecision {
  gate: GateId;
  decision: "GO" | "NO-GO";
  blocking: string[];
}

export const GATE_ORDER: readonly GateId[] = ["G1_internal", "G2_pilot", "G3_invites", "G4_public"];

/** Avalia um gate. Só "met" conta; "unverified" bloqueia como "not_met". */
export function evaluateGate(
  gate: Gate,
  previousDecision: GateDecision | null,
  authorization: GateAuthorization | null,
): GateDecision {
  const blocking: string[] = gate.criteria.filter((c) => c.status !== "met").map((c) => c.id);
  if (gate.previous && previousDecision?.decision !== "GO") blocking.push(`gate_anterior:${gate.previous}`);
  if (!authorization || authorization.gate !== gate.id || !authorization.by || !authorization.at)
    blocking.push("autorizacao_expressa");
  return { gate: gate.id, decision: blocking.length === 0 ? "GO" : "NO-GO", blocking };
}

/** Avalia os quatro em cadeia. */
export function evaluateAllGates(gates: readonly Gate[], auths: readonly GateAuthorization[]): GateDecision[] {
  const out: GateDecision[] = [];
  let prev: GateDecision | null = null;
  for (const id of GATE_ORDER) {
    const g = gates.find((x) => x.id === id);
    if (!g) throw new Error(`gate em falta: ${id}`);
    prev = evaluateGate(g, prev, auths.find((a) => a.gate === id) ?? null);
    out.push(prev);
  }
  return out;
}

/** Autorizações registadas. Vazio = nenhum gate autorizado. */
export const GATE_AUTHORIZATIONS: readonly GateAuthorization[] = [];

/** Estado conhecido em 14/11/2026 (evidência em docs/v2/afonso-2-0-inventario-e-plano.md). */
export const AFONSO_V2_GATES: readonly Gate[] = [
  {
    id: "G1_internal",
    title: "G1 — Testes internos (Júlio)",
    previous: null,
    criteria: [
      { id: "stripe_test_isolado", label: "Pagamentos de teste nunca dão acesso real", status: "met", evidence: "billing-guard.test.ts, webhook-process.test.ts (unitários)" },
      { id: "webhooks_ordem", label: "Webhooks Stripe fora de ordem não regridem estado", status: "met", evidence: "billing-guard.test.ts (unitários)" },
      { id: "rls_estatico", label: "RLS ligado e sem políticas abertas em todas as tabelas", status: "met", evidence: "auditoria de catálogo 14/11/2026: 105/105 tabelas com RLS" },
      { id: "isolamento_e2e", label: "Isolamento entre contas demonstrado E2E", status: "not_met", evidence: "falta backend de testes independente" },
      { id: "canais_e2e", label: "E2E reais WhatsApp e Telegram", status: "not_met", evidence: "não executado" },
      { id: "ambiente_testes", label: "Ambiente de testes independente", status: "not_met", evidence: "faltam segredos TEST_SUPABASE_*" },
      { id: "teto_1_dia", label: "Máx. 1 intervenção não solicitada/dia", status: "met", evidence: "daily-cap / intervention-gate (unitários, interruptor desligado)" },
      { id: "aprovacao_externa", label: "Nada sai para terceiros sem aprovação", status: "met", evidence: "testes action-first e confirmação de email" },
      { id: "portal_minimo", label: "Portal V2 sem áreas comerciais", status: "met", evidence: "portal-scope.test.ts (interruptor desligado)" },
    ],
  },
  {
    id: "G2_pilot",
    title: "G2 — Piloto Iolanda Ventura e Pedro Cunha (14 dias)",
    previous: "G1_internal",
    criteria: [
      { id: "checkpoints", label: "Checkpoints dias 1, 7 e 14 com critérios escritos", status: "unverified", evidence: "docs/piloto-14-dias.md por rever com as 50 decisões" },
      { id: "rollback_flag", label: "Rollback por interruptor testado", status: "unverified", evidence: "testes de interruptor desligado; sem ensaio real" },
      { id: "suporte_humano", label: "Escalamento para suporte humano definido", status: "not_met", evidence: "contacto de suporte por aprovar" },
      { id: "north_star", label: "Medição de ações comerciais úteis confirmadas", status: "unverified", evidence: "autonomy-metrics.ts (só leitura)" },
    ],
  },
  {
    id: "G3_invites",
    title: "G3 — Convites",
    previous: "G2_pilot",
    criteria: [
      { id: "convites_enforcement", label: "Convites: uso único, 7 dias, quota no servidor", status: "met", evidence: "pilot-access / early-access (unitários + triggers)" },
      { id: "referencias", label: "Crédito de referência com antifraude", status: "unverified", evidence: "referrals.ts (puro, sem tabela)" },
      { id: "plano_29", label: "Plano único 29 €/mês configurado", status: "not_met", evidence: "produto/preço não criados" },
    ],
  },
  {
    id: "G4_public",
    title: "G4 — Público",
    previous: "G3_invites",
    criteria: [
      { id: "independencia", label: "Teste de arranque fora da Lovable", status: "not_met", evidence: "não executado" },
      { id: "rto_rpo", label: "RTO ≤ 4h e RPO ≤ 1h validados com backups independentes", status: "not_met", evidence: "não validado" },
      { id: "exportacao", label: "Exportação self-service validada", status: "unverified", evidence: "v2/export (interruptor desligado)" },
      { id: "juridico", label: "RGPD, IVA/faturação PT e termos revistos", status: "not_met", evidence: "por rever" },
      { id: "v1_eol", label: "Data de fim da V1 fixada e comunicada", status: "not_met", evidence: "data por definir" },
    ],
  },
];
