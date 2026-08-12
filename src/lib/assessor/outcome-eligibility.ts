// Um pedido qualitativo de resultado só faz sentido quando o compromisso está
// explicitamente ligado ao negócio do consultor. Títulos e notas não chegam:
// um evento sincronizado como "Almoço" ou "Reunião interna" não deve provocar
// um "Como correu?" só por já ter terminado.

export interface OutcomeCandidateContext {
  person_id?: string | null;
  related_property_id?: string | null;
  opportunity_id?: string | null;
  related_prospecting_lead_id?: string | null;
}

export function hasCommercialOutcomeContext(item: OutcomeCandidateContext): boolean {
  return Boolean(
    item.person_id ||
    item.related_property_id ||
    item.opportunity_id ||
    item.related_prospecting_lead_id,
  );
}