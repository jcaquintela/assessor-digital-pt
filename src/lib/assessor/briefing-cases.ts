// Casos golden do briefing: cenários declarativos que descrevem, em linguagem
// de negócio, o que deve entrar/sair do briefing e o que gera check-in.
//
// Fonte única partilhada por:
//  - `briefing-cases.test.ts` (verificação automática: `bun run test:briefing`)
//  - `/admin/simulador-briefing` (lista visível com resultado ao vivo)
//
// Para cobrir uma regra nova: acrescenta um caso aqui. Não é preciso mais nada.

import { simulateBriefing, type SimulatedItem, type SimulationResult } from "./briefing-simulator";

export interface BriefingCase {
  /** Nome curto e legível, em PT-PT. */
  name: string;
  /** Regra de produto que este caso protege. */
  rule: string;
  item: SimulatedItem;
  /** Momento da simulação (ISO). Omisso = 2026-08-10T09:00:00Z. */
  now?: string;
  expect: {
    inAgenda: boolean;
    generatesCheckIn?: boolean;
  };
}

export const DEFAULT_NOW = "2026-08-10T09:00:00Z";

const ctx = { person_id: null, related_property_id: null, opportunity_id: null };

export const BRIEFING_CASES: readonly BriefingCase[] = [
  {
    name: "Aniversário importado do calendário",
    rule: "Deny-list de lazer: datas pessoais nunca entram no briefing.",
    item: { ...ctx, title: "Aniversário de Maria", due_date: "2026-08-10", from_calendar: true },
    expect: { inAgenda: false, generatesCheckIn: false },
  },
  {
    name: "Almoço sem ligações",
    rule: "Lazer sem contexto comercial fica fora e nunca gera check-in.",
    item: { ...ctx, title: "Almoço", due_date: "2026-08-10", due_time: "13:00", from_calendar: true },
    expect: { inAgenda: false, generatesCheckIn: false },
  },
  {
    name: "Almoço com o Sr. Coelho (ligado a Pessoa)",
    rule: "Lazer com ligação comercial conta como trabalho.",
    item: {
      ...ctx,
      title: "Almoço com o Sr. Coelho",
      due_date: "2026-08-10",
      due_time: "13:00",
      person_id: "p1",
      from_calendar: true,
    },
    expect: { inAgenda: true, generatesCheckIn: true },
  },
  {
    name: "Visita ao T3 ainda por acontecer",
    rule: "Compromisso ligado a Imóvel entra e gera check-in depois de terminar.",
    item: {
      ...ctx,
      title: "Visita ao T3 das Antas",
      type: "visita",
      due_date: "2026-08-10",
      due_time: "18:00",
      related_property_id: "i1",
      from_calendar: true,
    },
    expect: { inAgenda: true, generatesCheckIn: true },
  },
  {
    name: "Visita que já terminou hoje de manhã",
    rule: "Não se prepara o que já passou.",
    item: {
      ...ctx,
      title: "Visita ao T3 das Antas",
      type: "visita",
      due_date: "2026-08-10",
      due_time: "07:00",
      related_property_id: "i1",
      from_calendar: true,
    },
    expect: { inAgenda: false },
  },
  {
    name: "Reunião de equipa sem contexto",
    rule: "Regra larga: evento neutro entra na agenda, mas sem check-in.",
    item: { ...ctx, title: "Reunião de equipa", due_date: "2026-08-10", due_time: "17:00", from_calendar: true },
    expect: { inAgenda: true, generatesCheckIn: false },
  },
  {
    name: "Evento externo atrasado",
    rule: "Eventos de calendário externo não se arrastam para os dias seguintes.",
    item: {
      ...ctx,
      title: "Reunião com proprietário",
      due_date: "2026-08-07",
      due_time: "10:00",
      person_id: "p1",
      from_calendar: true,
    },
    expect: { inAgenda: false },
  },
  {
    name: "Tarefa criada no Afonso, atrasada",
    rule: "Seguimentos criados no Afonso continuam a aparecer enquanto estiverem abertos.",
    item: { ...ctx, title: "Ligar ao comprador", due_date: "2026-08-05", person_id: "p1" },
    expect: { inAgenda: true },
  },
  {
    name: "Seguimento já concluído",
    rule: "Estado canónico: fechado nunca entra.",
    item: { ...ctx, title: "Ligar ao comprador", due_date: "2026-08-10", status: "concluído", person_id: "p1" },
    expect: { inAgenda: false, generatesCheckIn: false },
  },
  {
    name: "Seguimento arquivado",
    rule: "Arquivar remove o item de todas as superfícies.",
    item: {
      ...ctx,
      title: "Visita ao T2",
      type: "visita",
      due_date: "2026-08-10",
      due_time: "18:00",
      related_property_id: "i1",
      archived_at: "2026-08-09T10:00:00Z",
    },
    expect: { inAgenda: false, generatesCheckIn: false },
  },
  {
    name: "Jogo do FC Porto",
    rule: "Lazer desportivo importado fica fora do briefing matinal.",
    item: { ...ctx, title: "Jogo do FC Porto", due_date: "2026-08-10", due_time: "20:00", from_calendar: true },
    expect: { inAgenda: false, generatesCheckIn: false },
  },
  {
    name: "Ginásio criado no Afonso",
    rule: "A deny-list só filtra eventos de calendário externo.",
    item: { ...ctx, title: "Ginásio", due_date: "2026-08-10", due_time: "19:00" },
    expect: { inAgenda: true, generatesCheckIn: false },
  },
];

export interface CaseOutcome {
  case: BriefingCase;
  result: SimulationResult;
  passed: boolean;
  failures: string[];
}

/** Corre um caso e compara com o esperado. Puro: não toca em dados reais. */
export function runBriefingCase(c: BriefingCase): CaseOutcome {
  const result = simulateBriefing(c.item, new Date(c.now ?? DEFAULT_NOW));
  const failures: string[] = [];
  if (result.inAgenda !== c.expect.inAgenda) {
    failures.push(`inAgenda: esperado ${c.expect.inAgenda}, obtido ${result.inAgenda}`);
  }
  if (c.expect.generatesCheckIn !== undefined && result.generatesCheckIn !== c.expect.generatesCheckIn) {
    failures.push(`generatesCheckIn: esperado ${c.expect.generatesCheckIn}, obtido ${result.generatesCheckIn}`);
  }
  return { case: c, result, passed: failures.length === 0, failures };
}

export function runAllBriefingCases(): CaseOutcome[] {
  return BRIEFING_CASES.map(runBriefingCase);
}