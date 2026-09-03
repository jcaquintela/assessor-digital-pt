// Fase 3 — eliminação permanente (e anonimização) de Pessoas, Imóveis e Negócios.
//
// Duas garantias que não se negoceiam:
//   1. Nada é eliminado sem passar pelo diagnóstico de dependências. Se houver
//      dinheiro associado, a operação é recusada aqui no servidor, mesmo que a
//      UI se engane.
//   2. Nada é eliminado (nem anonimizado) sem um retrato completo gravado antes
//      em `admin_audit_logs`. Depois não há como reconstituir.

import {
  anonymizedName,
  contagem,
  ENTITY_LABEL,
  isAnonymizedPerson,
  isDealLost,
  isDealOpen,
  isEntityArchived,
  NOT_ARCHIVED_ENTITY_MESSAGE,
  BLOCKED_MESSAGE_DEAL,
  type CascadeCount,
  type EntityDeleteAssessment,
  type EntityDeleteType,
} from "./entity-delete";

const TABLE: Record<EntityDeleteType, string> = {
  person: "people",
  property: "properties",
  opportunity: "opportunities",
};

type Row = Record<string, any>;

async function rowsOf(
  supabase: any,
  table: string,
  userId: string,
  filters: Array<[string, any]>,
): Promise<Row[]> {
  let q = supabase.from(table).select("*").eq("user_id", userId);
  for (const [col, val] of filters) q = q.eq(col, val);
  const { data } = await q;
  return (data as Row[]) ?? [];
}

async function rowsIn(
  supabase: any,
  table: string,
  userId: string,
  col: string,
  values: string[],
): Promise<Row[]> {
  if (!values.length) return [];
  const { data } = await supabase.from(table).select("*").eq("user_id", userId).in(col, values);
  return (data as Row[]) ?? [];
}

async function loadEntity(
  supabase: any,
  userId: string,
  type: EntityDeleteType,
  id: string,
): Promise<Row> {
  const { data } = await supabase
    .from(TABLE[type])
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Registo não encontrado.");
  return data as Row;
}

/* --------------------------------------------------------------- diagnóstico */

export async function assessEntityDeletion(
  supabase: any,
  input: { userId: string; type: EntityDeleteType; id: string },
): Promise<EntityDeleteAssessment> {
  const { userId, type, id } = input;
  const row = await loadEntity(supabase, userId, type, id);
  const archived = isEntityArchived(type, row);

  const blockReasons: string[] = [];
  const cascade: CascadeCount[] = [];
  let canAnonymize = false;

  if (type === "opportunity") {
    const movimentos = await rowsOf(supabase, "financial_movements", userId, [
      ["opportunity_id", id],
    ]);
    if (movimentos.length) blockReasons.push(BLOCKED_MESSAGE_DEAL);

    const prazos = await rowsOf(supabase, "deal_deadlines", userId, [["opportunity_id", id]]);
    const eventos = await rowsOf(supabase, "opportunity_events", userId, [["opportunity_id", id]]);
    const imoveis = await rowsOf(supabase, "opportunity_properties", userId, [
      ["opportunity_id", id],
    ]);
    if (prazos.length) cascade.push(contagem(prazos.length, "prazo", "prazos"));
    if (eventos.length) cascade.push(contagem(eventos.length, "evento do negócio", "eventos do negócio"));
    if (imoveis.length) cascade.push(contagem(imoveis.length, "imóvel ligado", "imóveis ligados"));
  }

  if (type === "person") {
    const negocios = await rowsOf(supabase, "opportunities", userId, [["person_id", id]]);
    const vivos = negocios.filter((d) => !isDealLost(d));
    if (vivos.length) {
      blockReasons.push(
        `Tem ${vivos.length === 1 ? "1 negócio" : `${vivos.length} negócios`} com histórico. O registo contabilístico tem de ficar.`,
      );
    }
    const imoveis = await rowsOf(supabase, "properties", userId, [["owner_person_id", id]]);
    if (imoveis.length) {
      blockReasons.push(
        `É proprietária de ${imoveis.length === 1 ? "1 imóvel" : `${imoveis.length} imóveis`}.`,
      );
    }
    const movimentos = await rowsIn(
      supabase,
      "financial_movements",
      userId,
      "opportunity_id",
      negocios.map((d) => String(d.id)),
    );
    if (movimentos.length) {
      blockReasons.push("Tem movimentos financeiros associados (retenção legal obrigatória).");
    }
    canAnonymize = blockReasons.length > 0 && !isAnonymizedPerson(row);

    const telefones = await rowsOf(supabase, "person_phones", userId, [["person_id", id]]);
    const interacoes = await rowsOf(supabase, "interactions", userId, [["person_id", id]]);
    const seguimentos = await rowsOf(supabase, "follow_ups", userId, [["person_id", id]]);
    const rascunhos = await rowsOf(supabase, "email_drafts", userId, [["person_id", id]]);
    const interesses = await rowsOf(supabase, "property_interests", userId, [["person_id", id]]);
    const ofertas = await rowsOf(supabase, "property_offers", userId, [["person_id", id]]);
    if (telefones.length) cascade.push(contagem(telefones.length, "contacto", "contactos"));
    if (interacoes.length) cascade.push(contagem(interacoes.length, "interação", "interações"));
    if (seguimentos.length) cascade.push(contagem(seguimentos.length, "seguimento", "seguimentos"));
    if (rascunhos.length) cascade.push(contagem(rascunhos.length, "rascunho de email", "rascunhos de email"));
    if (interesses.length) cascade.push(contagem(interesses.length, "interesse", "interesses"));
    if (ofertas.length) cascade.push(contagem(ofertas.length, "proposta", "propostas"));
  }

  if (type === "property") {
    const diretos = await rowsOf(supabase, "opportunities", userId, [["property_id", id]]);
    const ligacoes = await rowsOf(supabase, "opportunity_properties", userId, [["property_id", id]]);
    const indiretos = await rowsIn(
      supabase,
      "opportunities",
      userId,
      "id",
      ligacoes.map((l) => String(l.opportunity_id)).filter(Boolean),
    );
    const todos = [...diretos, ...indiretos];
    const abertos = todos.filter((d) => isDealOpen(d));
    if (abertos.length) {
      blockReasons.push(
        `Está ligado a ${abertos.length === 1 ? "1 negócio em curso" : `${abertos.length} negócios em curso`}.`,
      );
    }
    const movimentos = await rowsOf(supabase, "financial_movements", userId, [["property_id", id]]);
    if (movimentos.length) {
      blockReasons.push("Tem comissões ou movimentos financeiros associados (retenção legal obrigatória).");
    }

    const interesses = await rowsOf(supabase, "property_interests", userId, [["property_id", id]]);
    const ofertas = await rowsOf(supabase, "property_offers", userId, [["property_id", id]]);
    const marketing = await rowsOf(supabase, "property_marketing_activities", userId, [
      ["property_id", id],
    ]);
    if (interesses.length) cascade.push(contagem(interesses.length, "interesse", "interesses"));
    if (ofertas.length) cascade.push(contagem(ofertas.length, "proposta", "propostas"));
    if (marketing.length) cascade.push(contagem(marketing.length, "ação de promoção", "ações de promoção"));
    if (ligacoes.length) cascade.push(contagem(ligacoes.length, "ligação a negócio", "ligações a negócios"));
  }

  const blocked = blockReasons.length > 0;
  return {
    type,
    id,
    alvo: String(row["name"] ?? row["title"] ?? ENTITY_LABEL[type]),
    archived,
    blocked,
    canDelete: !blocked && archived,
    blockReasons,
    canAnonymize,
    anonymized: type === "person" && isAnonymizedPerson(row),
    cascade,
  };
}

/* ------------------------------------------------------------------ auditoria */

async function audit(
  client: any,
  input: {
    userId: string;
    action: string;
    type: EntityDeleteType;
    id: string;
    reason: string;
    snapshot: Row;
    extra?: Record<string, unknown>;
  },
) {
  await client.from("admin_audit_logs").insert({
    admin_user_id: input.userId,
    target_user_id: input.userId,
    action: input.action,
    resource_type: input.type,
    resource_id: input.id,
    reason: input.reason,
    metadata: {
      source: "app:entity-delete",
      snapshot: JSON.parse(JSON.stringify(input.snapshot ?? null)),
      ...(input.extra ?? {}),
    },
  } as never);
}

function requireReason(reason: string): string {
  const r = String(reason ?? "").trim();
  if (r.length < 3) throw new Error("Escreve o motivo da eliminação.");
  return r;
}

/* ------------------------------------------------------------------ eliminar */

export interface EntityDeleteResult {
  deleted: true;
  type: EntityDeleteType;
  id: string;
  cascade: CascadeCount[];
}

export async function permanentlyDeleteEntity(
  supabase: any,
  input: { userId: string; type: EntityDeleteType; id: string; reason: string },
  deps: { auditClient?: any } = {},
): Promise<EntityDeleteResult> {
  const reason = requireReason(input.reason);
  const { userId, type, id } = input;

  const assessment = await assessEntityDeletion(supabase, { userId, type, id });
  if (!assessment.archived) throw new Error(NOT_ARCHIVED_ENTITY_MESSAGE);
  if (assessment.blocked) throw new Error(assessment.blockReasons.join(" "));

  const snapshot = await loadEntity(supabase, userId, type, id);

  // Retrato antes de tocar em nada.
  await audit(deps.auditClient ?? supabase, {
    userId,
    action: `registo.eliminacao_permanente.${type}`,
    type,
    id,
    reason,
    snapshot,
    extra: { cascade: assessment.cascade },
  });

  const del = async (table: string, col: string) => {
    await supabase.from(table).delete().eq("user_id", userId).eq(col, id);
  };
  const nulo = async (table: string, col: string) => {
    await supabase
      .from(table)
      .update({ [col]: null } as never)
      .eq("user_id", userId)
      .eq(col, id);
  };
  const desligarFicheiros = async (entityType: string) => {
    for (const t of ["file_links", "entity_tags", "folder_items"]) {
      await supabase
        .from(t)
        .delete()
        .eq("user_id", userId)
        .eq("entity_type", entityType)
        .eq("entity_id", id);
    }
  };

  if (type === "opportunity") {
    await del("deal_deadlines", "opportunity_id");
    await del("opportunity_events", "opportunity_id");
    await del("opportunity_properties", "opportunity_id");
    await nulo("follow_ups", "opportunity_id");
    await nulo("interactions", "opportunity_id");
    await nulo("miscellaneous_items", "related_opportunity_id");
    await nulo("property_interests", "opportunity_id");
    await nulo("property_offers", "opportunity_id");
    await nulo("property_marketing_activities", "opportunity_id");
    await nulo("uploaded_files", "opportunity_id");
    await desligarFicheiros("opportunity");
  }

  if (type === "person") {
    await del("person_phones", "person_id");
    await del("interactions", "person_id");
    await del("follow_ups", "person_id");
    await del("email_drafts", "person_id");
    await del("property_interests", "person_id");
    await del("property_offers", "person_id");
    await nulo("email_threads", "person_id");
    await nulo("miscellaneous_items", "related_person_id");
    await nulo("prospecting_leads", "related_person_id");
    await nulo("conversation_states", "active_person_id");
    await nulo("people", "referred_by_person_id");
    await desligarFicheiros("person");
  }

  if (type === "property") {
    await del("property_interests", "property_id");
    await del("property_offers", "property_id");
    await del("property_marketing_activities", "property_id");
    await del("opportunity_properties", "property_id");
    await del("interactions", "property_id");
    await nulo("follow_ups", "related_property_id");
    await nulo("financial_movements", "property_id");
    await nulo("miscellaneous_items", "related_property_id");
    await nulo("opportunities", "property_id");
    await nulo("prospecting_leads", "related_property_id");
    await nulo("conversation_states", "last_property_id");
    await desligarFicheiros("property");
  }

  const { error } = await supabase
    .from(TABLE[type])
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  return { deleted: true, type, id, cascade: assessment.cascade };
}

/* ---------------------------------------------------------------- anonimizar */

export interface AnonymizeResult {
  anonymized: true;
  id: string;
  name: string;
  phonesRemoved: number;
}

/**
 * Anonimização de pessoa com histórico contabilístico. Não é reversível:
 * o RGPD pede a eliminação real dos dados pessoais, só a ligação contabilística
 * (negócios, comissões) é que fica de pé.
 */
export async function anonymizePerson(
  supabase: any,
  input: { userId: string; id: string; reason: string },
  deps: { auditClient?: any } = {},
): Promise<AnonymizeResult> {
  const reason = requireReason(input.reason);
  const { userId, id } = input;

  const snapshot = await loadEntity(supabase, userId, "person", id);
  if (isAnonymizedPerson(snapshot)) throw new Error("Esta pessoa já está anonimizada.");

  const telefones = await rowsOf(supabase, "person_phones", userId, [["person_id", id]]);

  await audit(deps.auditClient ?? supabase, {
    userId,
    action: "registo.anonimizacao.person",
    type: "person",
    id,
    reason,
    snapshot,
    extra: { person_phones: telefones, irreversible: true },
  });

  const name = anonymizedName(id);
  const { error } = await supabase
    .from("people")
    .update({
      name,
      name_norm: name.toLowerCase(),
      phone: null,
      email: null,
      email_normalized: null,
      company: null,
      job_title: null,
      summary: null,
      preferences: null,
      next_action: null,
      next_action_date: null,
      archived_at: snapshot["archived_at"] ?? new Date().toISOString(),
    } as never)
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  await supabase.from("person_phones").delete().eq("user_id", userId).eq("person_id", id);

  return { anonymized: true, id, name, phonesRemoved: telefones.length };
}
