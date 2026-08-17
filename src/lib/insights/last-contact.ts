// Fonte única da definição de "contacto real" — usada pelo Mentor e pela
// Deteção de Oportunidades. Definição AMPLA (a que já estava validada no Mentor):
//
//   contacto real = linha em `interactions`
//                 + seguimento com `outcome_recorded_at` preenchido
//
// Editar campos, anexar ficheiros, criar fichas ou mover cartões NÃO contam.
// Para um imóvel, conta também o contacto feito através de um negócio ligado
// (tabela `opportunity_properties`).
//
// Parte pura e testável: recebe linhas, devolve mapas de última data.

export interface InteractionRow {
  person_id?: string | null;
  opportunity_id?: string | null;
  property_id?: string | null;
  occurred_at?: string | null;
}

export interface FollowUpOutcomeRow {
  person_id?: string | null;
  opportunity_id?: string | null;
  related_property_id?: string | null;
  outcome_recorded_at?: string | null;
}

export interface OpportunityPropertyRow {
  opportunity_id?: string | null;
  property_id?: string | null;
}

export interface LastContactInput {
  interactions: InteractionRow[];
  followUps: FollowUpOutcomeRow[];
  links: OpportunityPropertyRow[];
}

export interface LastContactMaps {
  /** Último contacto real por pessoa. */
  byPerson: Map<string, string | null>;
  /** Último contacto real por negócio. */
  byDeal: Map<string, string | null>;
  /** Último contacto real por imóvel (direto + via negócio ligado). */
  byProperty: Map<string, string | null>;
}

/** Data mais recente de um conjunto, ou null. */
export function latestIso(...vals: (string | null | undefined)[]): string | null {
  const ts = vals
    .filter(Boolean)
    .map((v) => new Date(v as string).getTime())
    .filter((n) => !Number.isNaN(n));
  return ts.length ? new Date(Math.max(...ts)).toISOString() : null;
}

export function buildLastContactMaps(input: LastContactInput): LastContactMaps {
  const byPerson = new Map<string, string | null>();
  const byDeal = new Map<string, string | null>();
  const byProperty = new Map<string, string | null>();

  for (const r of input.interactions ?? []) {
    if (r.person_id) byPerson.set(r.person_id, latestIso(byPerson.get(r.person_id), r.occurred_at));
    if (r.opportunity_id) byDeal.set(r.opportunity_id, latestIso(byDeal.get(r.opportunity_id), r.occurred_at));
    if (r.property_id) byProperty.set(r.property_id, latestIso(byProperty.get(r.property_id), r.occurred_at));
  }

  for (const r of input.followUps ?? []) {
    if (!r.outcome_recorded_at) continue;
    if (r.person_id) byPerson.set(r.person_id, latestIso(byPerson.get(r.person_id), r.outcome_recorded_at));
    if (r.opportunity_id) byDeal.set(r.opportunity_id, latestIso(byDeal.get(r.opportunity_id), r.outcome_recorded_at));
    if (r.related_property_id) {
      byProperty.set(
        r.related_property_id,
        latestIso(byProperty.get(r.related_property_id), r.outcome_recorded_at),
      );
    }
  }

  // Contacto através de um negócio ligado ao imóvel.
  for (const l of input.links ?? []) {
    if (!l.property_id || !l.opportunity_id) continue;
    byProperty.set(l.property_id, latestIso(byProperty.get(l.property_id), byDeal.get(l.opportunity_id) ?? null));
  }

  return { byPerson, byDeal, byProperty };
}
