// Serviço de domínio único para criar um Negócio.
// Usado pelo dashboard (createDeal), pela ficha do imóvel e pelo motor v3
// (ferramenta create_deal). Regra mínima e dedupe vivem aqui — não em cada
// caminho — para que nenhuma via consiga criar um negócio vazio ou repetido.

import { legacyStatusForStage, normalizeStage } from "./stages";
import { validateDealMinimum } from "./rules";

type Row = Record<string, any>;

export interface CreateDealCoreInput {
  title?: string | null;
  kind?: string | null;
  stage?: string | null;
  personId?: string | null;
  propertyId?: string | null;
  value?: number | null;
  notes?: string | null;
  source?: "dashboard" | "assessor" | "imovel";
  /** Contacto de prospeção (placa, referência) que deu origem a este negócio. */
  sourceLeadId?: string | null;
  /** Movimentos financeiros a ligar explicitamente a este negócio. */
  linkMovementIds?: string[] | null;
}

export interface CreateDealCoreResult {
  id: string;
  title: string;
  duplicate: boolean;
  linkedMovements: number;
}

/** Negócio ativo já existente para esta pessoa/imóvel. */
export async function findExistingDeal(
  supabase: any,
  userId: string,
  input: { personId?: string | null; propertyId?: string | null; kind?: string | null },
): Promise<{ id: string; title: string | null } | null> {
  const propertyId = (input.propertyId ?? "") || null;
  const personId = (input.personId ?? "") || null;

  if (propertyId) {
    const { data: links } = await supabase
      .from("opportunity_properties").select("opportunity_id")
      .eq("user_id", userId).eq("property_id", propertyId).limit(20);
    const ids = ((links ?? []) as Row[]).map((l) => l.opportunity_id).filter(Boolean);
    const { data: legacy } = await supabase
      .from("opportunities").select("id, title, archived_at")
      .eq("user_id", userId).eq("property_id", propertyId).is("archived_at", null).limit(5);
    const legacyRow = ((legacy ?? []) as Row[])[0];
    if (legacyRow) return { id: legacyRow.id, title: legacyRow.title ?? null };
    if (ids.length) {
      const { data: rows } = await supabase
        .from("opportunities").select("id, title, archived_at")
        .eq("user_id", userId).in("id", ids).is("archived_at", null).limit(5);
      const row = ((rows ?? []) as Row[])[0];
      if (row) return { id: row.id, title: row.title ?? null };
    }
  }

  if (personId) {
    const { data: rows } = await supabase
      .from("opportunities").select("id, title, deal_kind, type, archived_at, property_id")
      .eq("user_id", userId).eq("person_id", personId).is("archived_at", null).limit(20);
    const { normalizeKind } = await import("./stages");
    const wanted = normalizeKind(input.kind);
    const row = ((rows ?? []) as Row[]).find((r) => {
      if (propertyId && r.property_id && r.property_id !== propertyId) return false;
      return normalizeKind(r.deal_kind ?? r.type) === wanted;
    });
    if (row) return { id: row.id, title: row.title ?? null };
  }

  return null;
}

/** Comissões/despesas soltas (sem negócio) que pertencem a este contexto. */
export async function findOrphanMovementsFor(
  supabase: any,
  userId: string,
  input: { propertyId?: string | null; ids?: string[] | null },
): Promise<Row[]> {
  const out = new Map<string, Row>();
  if (input.ids?.length) {
    const { data } = await supabase
      .from("financial_movements").select("id, type, amount, description, opportunity_id, property_id")
      .eq("user_id", userId).in("id", input.ids).is("opportunity_id", null).limit(50);
    for (const m of ((data ?? []) as Row[])) out.set(m.id, m);
  }
  if (input.propertyId) {
    const { data } = await supabase
      .from("financial_movements").select("id, type, amount, description, opportunity_id, property_id")
      .eq("user_id", userId).eq("property_id", input.propertyId).is("opportunity_id", null).limit(50);
    for (const m of ((data ?? []) as Row[])) out.set(m.id, m);
  }
  return [...out.values()];
}

export async function createDealCore(
  supabase: any,
  userId: string,
  input: CreateDealCoreInput,
): Promise<CreateDealCoreResult> {
  const personId = (input.personId ?? "") || null;
  const propertyId = (input.propertyId ?? "") || null;
  const sourceLeadId = (input.sourceLeadId ?? "") || null;

  // Nomes só para compor o título quando falta — nunca para validar.
  let personName: string | null = null;
  let propertyTitle: string | null = null;
  if (personId) {
    const { data } = await supabase.from("people").select("name").eq("id", personId).eq("user_id", userId).maybeSingle();
    personName = (data as Row | null)?.name ?? null;
  }
  if (propertyId) {
    const { data } = await supabase.from("properties").select("title").eq("id", propertyId).eq("user_id", userId).maybeSingle();
    propertyTitle = (data as Row | null)?.title ?? null;
  }

  const min = validateDealMinimum(
    { title: input.title, kind: input.kind, personId, propertyId },
    { personName, propertyTitle },
  );
  if (!min.ok) throw new Error(min.error);

  const existing = await findExistingDeal(supabase, userId, { personId, propertyId, kind: min.kind });
  if (existing) {
    // Não perder a origem: se o negócio já existia sem lead de origem e agora
    // sabemos qual foi, preenchemos — nunca sobrepomos uma origem já registada.
    if (sourceLeadId) {
      try {
        await supabase
          .from("opportunities")
          .update({ source_lead_id: sourceLeadId } as never)
          .eq("id", existing.id).eq("user_id", userId).is("source_lead_id", null);
      } catch { /* a origem nunca pode fazer falhar a criação */ }
    }
    const linked = await linkMovementsToDeal(supabase, userId, existing.id, {
      propertyId, ids: input.linkMovementIds ?? null,
    });
    return { id: existing.id, title: existing.title ?? min.title, duplicate: true, linkedMovements: linked };
  }

  const stage = normalizeStage(input.stage);
  const { data: created, error } = await supabase.from("opportunities").insert({
    user_id: userId,
    title: min.title,
    deal_kind: min.kind,
    type: min.kind,
    stage,
    status: legacyStatusForStage(stage),
    person_id: personId,
    property_id: propertyId,
    source_lead_id: sourceLeadId,
    // Sem estimativa fica `null` — nunca 0, para não poluir o "€ em jogo".
    value: input.value ?? null,
    notes: input.notes || null,
    stage_changed_at: new Date().toISOString(),
  } as never).select("id").single();
  if (error) throw new Error(error.message);
  const id = (created as Row).id as string;

  if (propertyId) {
    await supabase.from("opportunity_properties").insert({
      user_id: userId, opportunity_id: id, property_id: propertyId, role: "principal",
    } as never);
  }

  const linkedMovements = await linkMovementsToDeal(supabase, userId, id, {
    propertyId, ids: input.linkMovementIds ?? null,
  });

  const origem = input.source === "assessor" ? "pela conversa com o Afonso"
    : input.source === "imovel" ? "a partir da ficha do imóvel" : "no dashboard";
  await supabase.from("opportunity_events").insert({
    user_id: userId, opportunity_id: id, kind: "criado",
    summary: `Negócio criado ${origem}.`,
    payload: { linked_movements: linkedMovements },
    source: input.source === "assessor" ? "assessor" : "dashboard",
  } as never);

  return { id, title: min.title, duplicate: false, linkedMovements };
}

/** Liga comissões/despesas soltas a um negócio. Devolve quantas ligou. */
export async function linkMovementsToDeal(
  supabase: any,
  userId: string,
  dealId: string,
  scope: { propertyId?: string | null; ids?: string[] | null },
): Promise<number> {
  const movements = await findOrphanMovementsFor(supabase, userId, scope);
  if (!movements.length) return 0;
  const ids = movements.map((m) => m.id);
  const { error } = await supabase
    .from("financial_movements")
    .update({ opportunity_id: dealId } as never)
    .in("id", ids).eq("user_id", userId).is("opportunity_id", null);
  if (error) return 0;
  try {
    await supabase.from("opportunity_events").insert({
      user_id: userId, opportunity_id: dealId, kind: "financeiro",
      summary: movements.length === 1
        ? "Uma comissão/despesa solta passou a pertencer a este negócio."
        : `${movements.length} movimentos financeiros passaram a pertencer a este negócio.`,
      payload: { movement_ids: ids }, source: "dashboard",
    } as never);
  } catch { /* o registo do evento nunca pode falhar a ligação */ }
  return ids.length;
}
