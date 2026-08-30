// Visitas concluídas e o seguimento que falta — módulo puro (sem BD, sem rede).
//
// Uma visita só interessa neste cartão enquanto é recente: passado o prazo,
// deixa de ser "acabou de acontecer" e o assunto vive nos Seguimentos.
// O estado "aberto/fechado" de um seguimento vem sempre da fonte única
// (`src/lib/follow-ups/state.ts`) — nunca se compara estados à mão aqui.

import { isFollowUpOpen } from "@/lib/follow-ups/state";

export interface VisitSourceRow {
  id: string;
  occurred_at: string | null;
  summary: string | null;
  person_id: string | null;
  property_id: string | null;
}

export interface FollowUpSourceRow {
  id: string;
  title?: string | null;
  due_date?: string | null;
  due_time?: string | null;
  person_id?: string | null;
  property_id?: string | null;
  status?: unknown;
  outcome?: unknown;
  archived_at?: unknown;
  type?: unknown;
}

export interface VisitFollowUpCard {
  visitId: string;
  occurredAt: string | null;
  summary: string;
  personId: string | null;
  personName: string | null;
  propertyId: string | null;
  propertyLabel: string | null;
  /** Seguimento aberto encontrado para a mesma pessoa/imóvel, se houver. */
  pending: { id: string; title: string; dueDate: string | null } | null;
}

export interface BuildVisitFollowUpsInput {
  visits: VisitSourceRow[];
  followUps: FollowUpSourceRow[];
  people: Array<{ id: string; name?: string | null }>;
  properties: Array<{ id: string; title?: string | null; address?: string | null }>;
  now?: Date;
  /** Janela de recência em dias. */
  days?: number;
  limit?: number;
}

/** Uma visita liga-se ao seguimento pela pessoa; sem pessoa, pelo imóvel. */
function matches(fu: FollowUpSourceRow, visit: VisitSourceRow): boolean {
  if (visit.person_id && fu.person_id === visit.person_id) return true;
  if (!visit.person_id && visit.property_id && fu.property_id === visit.property_id) return true;
  return false;
}

export function buildVisitFollowUps(input: BuildVisitFollowUpsInput): VisitFollowUpCard[] {
  const now = input.now ?? new Date();
  const days = input.days ?? 14;
  const cutoff = now.getTime() - days * 864e5;

  const nomes = new Map(input.people.map((p) => [p.id, String(p.name ?? "").trim()]));
  const imoveis = new Map(
    input.properties.map((p) => [p.id, String(p.title ?? p.address ?? "").trim()]),
  );

  const abertos = input.followUps.filter((f) => isFollowUpOpen(f));

  const recentes = input.visits.filter((v) => {
    const t = v.occurred_at ? new Date(v.occurred_at).getTime() : NaN;
    return Number.isFinite(t) && t >= cutoff && t <= now.getTime() + 60_000;
  });

  recentes.sort((a, b) =>
    new Date(b.occurred_at ?? 0).getTime() - new Date(a.occurred_at ?? 0).getTime());

  const vistos = new Set<string>();
  const cards: VisitFollowUpCard[] = [];
  for (const v of recentes) {
    // Uma linha por pessoa/imóvel: a visita mais recente manda.
    const chave = `${v.person_id ?? ""}|${v.property_id ?? ""}`;
    if (chave !== "|" && vistos.has(chave)) continue;
    vistos.add(chave);

    const candidatos = abertos
      .filter((f) => matches(f, v))
      .sort((a, b) => String(a.due_date ?? "9999").localeCompare(String(b.due_date ?? "9999")));
    const p = candidatos[0];

    cards.push({
      visitId: v.id,
      occurredAt: v.occurred_at,
      summary: String(v.summary ?? "").trim() || "Visita registada",
      personId: v.person_id,
      personName: (v.person_id ? nomes.get(v.person_id) : null) || null,
      propertyId: v.property_id,
      propertyLabel: (v.property_id ? imoveis.get(v.property_id) : null) || null,
      pending: p
        ? { id: p.id, title: String(p.title ?? "").trim() || "Seguimento", dueDate: p.due_date ?? null }
        : null,
    });
    if (cards.length >= (input.limit ?? 6)) break;
  }
  return cards;
}
