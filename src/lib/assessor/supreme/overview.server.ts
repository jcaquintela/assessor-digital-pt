// Resumo geral do dia — contagens simples, nenhuma lógica de priorização.
// Serve a grelha de 6 cartões de /hoje e a sugestão do mentor.

export interface OverviewSummary {
  deals: { count: number; value: number };
  properties: { count: number; toAcquire: number };
  people: { count: number; contactedWeek: number };
  misc: { pending: number };
  agenda: {
    today: number;
    nextLabel: string | null;
    nextTime: string | null;
    /** Fonte única dos compromissos de hoje — o cartão e o bloco "Próximos compromissos" leem daqui. */
    items: AgendaItem[];
  };
  billing: { forecast: number; open: number };
}

export interface AgendaItem {
  id: string;
  title: string;
  time: string | null;
  /** Dia de calendário em Lisboa "YYYY-MM-DD" — o cliente decide o que é hoje/amanhã. */
  date: string;
  type: string | null;
  personId: string | null;
  propertyId: string | null;
}

import { isFollowUpOpen, isFollowUpEvent } from "@/lib/follow-ups/state";
import { lisbonYmd, lisbonInstant } from "@/lib/assessor/lisbon-day";
import { todayEvents, type DayEvent } from "@/lib/agenda/day-events";

/**
 * Estado de um compromisso — delega na regra canónica
 * (`src/lib/follow-ups/state.ts`). Mantido por compatibilidade de chamadas.
 */
export function isOpenFollowUp(status: unknown): boolean {
  return isFollowUpOpen({ status });
}

export interface MentorTip {
  text: string;
  linkLabel: string;
  to: string;
  key: string;
  /** Porque disparou: dias sem contacto e que atividade foi usada como referência. */
  reason: string;
  /** Factos apurados desta volta — o nível 2 compõe a linha contextual a partir daqui. */
  facts?: MentorFacts;
  /** Linha contextual (nível 2). Preenchida em `overview.functions.ts` por tier. */
  context?: string | null;
}

import type { MentorFacts } from "./mentor-context";
import { emptyFacts } from "./mentor-context";

import { isDealActive } from "@/lib/deals/stages";
import { computeLastContact } from "@/lib/insights/last-contact.server";

const CLOSED_PROPERTY = new Set(["vendido", "arquivado"]);

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 864e5).toISOString();
}

/**
 * Janela de "hoje" em Lisboa, como instantes reais.
 *
 * `follow_ups.due_date` é `timestamptz` (o sync do calendário grava o instante
 * de início), por isso estes limites são comparados como instantes, não como
 * dias soltos. A versão anterior tirava o dia correcto em Lisboa mas colava-lhe
 * `T00:00:00+00:00` — meia-noite UTC. No horário de verão isso fazia o dia
 * começar à 01:00 de Lisboa e um compromisso das 00:30 caía fora de "hoje".
 *
 * Os limites saem agora de `lisbonInstant`, que é DST-aware: nos dias de
 * transição o dia tem 23h ou 25h e o fim é sempre "o instante antes da
 * meia-noite seguinte", nunca início+24h.
 */
export function todayRangeLisbon(now = new Date()): { start: string; end: string; endTomorrow: string } {
  const ymd = lisbonYmd(now);
  const [y, m, d] = ymd.split("-").map(Number);
  const dayAfter = (n: number) =>
    new Date(Date.UTC(y!, m! - 1, d! + n)).toISOString().slice(0, 10);
  const startMs = lisbonInstant(ymd, 0, 0);
  return {
    start: new Date(startMs).toISOString(),
    end: new Date(lisbonInstant(dayAfter(1), 0, 0) - 1).toISOString(),
    endTomorrow: new Date(lisbonInstant(dayAfter(2), 0, 0) - 1).toISOString(),
  };
}

export async function computeOverview(supabase: any, userId: string): Promise<OverviewSummary> {
  const { start, end } = todayRangeLisbon();
  // Hoje + amanhã: quando já não há nada hoje, o dashboard mostra o primeiro de amanhã.
  const endTomorrow = new Date(new Date(end).getTime() + 864e5).toISOString();

  // Arquivado nunca conta: o resumo de /hoje tem de bater certo com as páginas
  // de cada módulo (Pessoas, Imóveis, Negócios), que já filtram `archived_at`.
  const [deals, props, people, misc, events, movements, interactions] = await Promise.all([
    supabase.from("opportunities").select("id, status, stage, value, archived_at").eq("user_id", userId).is("archived_at", null),
    supabase.from("properties").select("id, status").eq("user_id", userId).is("archived_at", null),
    supabase.from("people").select("id").eq("user_id", userId).is("archived_at", null),
    // Diversos: a fonte única de verdade é `status` (archived_at nunca é
    // escrito nesta tabela), por isso não se filtra por `archived_at`.
    supabase.from("miscellaneous_items").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "inbox"),
    supabase.from("follow_ups").select("id, title, type, due_date, due_time, status, outcome, archived_at, person_id, related_property_id")
      .eq("user_id", userId).gte("due_date", start).lte("due_date", endTomorrow).order("due_time", { ascending: true }),
    supabase.from("financial_movements").select("id, type, amount, status").eq("user_id", userId).eq("type", "commission").is("archived_at", null),
    supabase.from("interactions").select("person_id").eq("user_id", userId).is("archived_at", null).gte("occurred_at", isoDaysAgo(7)),
  ]);

  const dealRows = ((deals.data as any[]) ?? []).filter(isDealActive);
  const propRows = ((props.data as any[]) ?? []).filter(
    (p) => !CLOSED_PROPERTY.has(String(p.status ?? "").toLowerCase()),
  );
  const eventRows: AgendaItem[] = ((events.data as any[]) ?? [])
    // Regra canónica: aberto/fechado + só compromissos de agenda contam como
    // "Compromissos hoje". Tarefas do dia deixam de inflacionar esta contagem.
    .filter((e) => isFollowUpOpen(e) && isFollowUpEvent(e))
    .map((e) => ({
      id: String(e.id),
      title: String(e.title ?? "Compromisso"),
      time: e.due_time ? String(e.due_time).slice(0, 5) : null,
      date: lisbonYmd(e.due_date),
      type: e.type ? String(e.type) : null,
      personId: e.person_id ?? null,
      propertyId: e.related_property_id ?? e.property_id ?? null,
    }))
    .sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99"));
  // Seletor central: contagem do dia inteiro. Os campos `nextLabel/nextTime`
  // ficam como o primeiro compromisso do dia (compatibilidade); quem mostra
  // "o próximo" usa `nextEvent()` sobre `items` com o relógio do consultor.
  const todayItems = todayEvents(eventRows as DayEvent[]);
  const next = todayItems[0] ?? null;
  const todayTotal = todayItems.length;
  const commissions = ((movements.data as any[]) ?? []);
  const open = commissions.filter((m) => {
    const s = String(m.status ?? "").toLowerCase();
    return s !== "recebida" && s !== "received" && s !== "paga" && s !== "paid";
  });

  return {
    deals: { count: dealRows.length, value: dealRows.reduce((s, d) => s + (d.value == null ? 0 : Number(d.value)), 0) },
    properties: {
      count: propRows.length,
      toAcquire: propRows.filter((p) => String(p.status ?? "") === "por_angariar").length,
    },
    people: {
      count: ((people.data as any[]) ?? []).length,
      contactedWeek: new Set(((interactions.data as any[]) ?? []).map((i) => i.person_id).filter(Boolean)).size,
    },
    misc: { pending: misc.count ?? 0 },
    agenda: {
      today: todayTotal,
      nextLabel: next?.title ?? null,
      nextTime: next?.time ?? null,
      items: eventRows,
    },
    billing: { forecast: open.reduce((s, m) => s + Number(m.amount ?? 0), 0), open: open.length },
  };
}

// Sugestão do mentor: padrões reais nos dados, tom de conselho.
// "Parado" mede-se pelo último CONTACTO REAL registado (interações e seguimentos
// com resultado), nunca por edições de campos — editar uma ficha não reinicia o contador.
// Se não houver padrão relevante, devolve null — nunca se inventa nada.
/** Compatibilidade: quem só quer a sugestão continua a chamar isto. */
export async function computeMentorTip(supabase: any, userId: string): Promise<MentorTip | null> {
  return (await computeMentor(supabase, userId)).tip;
}

export async function computeMentor(
  supabase: any,
  userId: string,
): Promise<{ tip: MentorTip | null; facts: MentorFacts }> {
  const now = Date.now();
  const days = (iso: string | null) => (iso ? Math.floor((now - new Date(iso).getTime()) / 864e5) : 0);

  const [props, deals, people, contacto, leads] = await Promise.all([
    supabase.from("properties").select("id, status, created_at").eq("user_id", userId).is("archived_at", null),
    supabase.from("opportunities").select("id, status, stage, stage_changed_at, archived_at").eq("user_id", userId).is("archived_at", null),
    supabase.from("people").select("id, name, created_at").eq("user_id", userId).is("archived_at", null).limit(200),
    // Fonte única de "contacto real" — partilhada com a Deteção de Oportunidades.
    computeLastContact(supabase, userId),
    // Crescimento: entrada nova no funil nos últimos 7 dias.
    supabase.from("prospecting_leads").select("id, created_at").eq("user_id", userId).gte("created_at", isoDaysAgo(7)),
  ]);

  const doneRows = contacto.rows.followUps;
  const linkRows = contacto.rows.links;
  const dealRowsAll = ((deals.data as any[]) ?? []);

  // ---- Factos da semana (últimos 7 dias). Contagens factuais, nunca previsão.
  const facts: MentorFacts = emptyFacts();
  facts.leadsSemana = ((leads.data as any[]) ?? []).filter((l) => days(l.created_at ?? null) < 7).length;
  facts.seguimentosFechados = doneRows.filter((r) => days(r.outcome_recorded_at ?? null) < 7).length;
  facts.negociosMovidos = dealRowsAll.filter(
    (d) => d.stage_changed_at && days(d.stage_changed_at) < 7,
  ).length;

  // Mapas de último contacto real — fonte única (`last-contact.ts`).
  const lastByDeal = contacto.maps.byDeal;
  const lastByPerson = contacto.maps.byPerson;
  const lastByProperty = contacto.maps.byProperty;

  // 1. Imóveis por angariar sem contacto real há mais de 10 dias.
  //    Sem qualquer contacto, conta-se desde a criação do imóvel.
  const parados = ((props.data as any[]) ?? []).filter((p) => {
    if (String(p.status ?? "") !== "por_angariar") return false;
    return days(lastByProperty.get(p.id) ?? p.created_at ?? null) >= 10;
  });
  if (parados.length) {
    // O caso mais parado do grupo serve de exemplo concreto.
    const pior = parados
      .map((p) => {
        const contacto = lastByProperty.get(p.id) ?? null;
        return { id: p.id, dias: days(contacto ?? p.created_at ?? null), temContacto: !!contacto };
      })
      .sort((a, b) => b.dias - a.dias)[0];
    facts.eixo = "produtividade";
    facts.total = parados.length;
    facts.unicoNoEstado = parados.length === 1;
    facts.diasSemContacto = pior.dias;
    facts.semNegocioLigado = !linkRows.some((l) => l.property_id === pior.id);
    const tip: MentorTip = {
      key: "imoveis-parados",
      text: `Tens ${parados.length} imóve${parados.length === 1 ? "l" : "is"} "Por angariar" há mais de 10 dias sem nenhum movimento registado. Vale a pena retomares o contacto antes que arrefeçam de vez.`,
      linkLabel: parados.length === 1 ? "Ver o imóvel →" : `Ver os ${parados.length} imóveis →`,
      to: "/imoveis",
      reason: pior.temContacto
        ? `limiar de 10 dias; o mais parado está há ${pior.dias} dias desde o último contacto real registado (interação ou seguimento com resultado, incluindo através de um negócio ligado ao imóvel).`
        : `limiar de 10 dias; o mais parado nunca teve contacto registado — contam-se ${pior.dias} dias desde que criaste a ficha. Editar campos não conta como contacto.`,
    };
    return { tip, facts };
  }

  // 2. Negócios na mesma fase há 25+ dias e sem contacto real nesse período.
  const presos = dealRowsAll.filter((d) => {
    if (!isDealActive(d)) return false;
    if (days(d.stage_changed_at) < 25) return false;
    const contacto = lastByDeal.get(d.id) ?? null;
    return !contacto || days(contacto) >= 25;
  });
  if (presos.length) {
    const piorD = presos
      .map((d) => {
        const contacto = lastByDeal.get(d.id) ?? null;
        return { fase: days(d.stage_changed_at), contacto: contacto ? days(contacto) : null };
      })
      .sort((a, b) => b.fase - a.fase)[0];
    facts.eixo = "produtividade";
    facts.total = presos.length;
    facts.unicoNoEstado = presos.length === 1;
    facts.diasSemContacto = piorD.contacto ?? piorD.fase;
    const tip: MentorTip = {
      key: "negocios-parados",
      text: `${presos.length === 1 ? "Há 1 negócio" : `Há ${presos.length} negócios`} na mesma fase há mais de três semanas. Ou avança, ou fecha — deixar parado só ocupa cabeça.`,
      linkLabel: "Ver negócios →",
      to: "/negocios",
      reason: `limiar de 25 dias; o mais preso está na mesma fase há ${piorD.fase} dias e ${
        piorD.contacto === null
          ? "sem qualquer contacto real registado"
          : `com o último contacto real há ${piorD.contacto} dias`
      } (interações e seguimentos com resultado).`,
    };
    return { tip, facts };
  }

  // 3. Pessoas sem contacto real há mais de 60 dias.
  const rows = ((people.data as any[]) ?? []).filter((p) => days(p.created_at) >= 60);
  if (rows.length) {
    const frias = rows.filter((p) => days(lastByPerson.get(p.id) ?? p.created_at ?? null) >= 60);
    if (frias.length >= 3) {
      facts.eixo = "crescimento";
      facts.total = frias.length;
      facts.unicoNoEstado = false;
      facts.diasSemContacto = Math.max(
        ...frias.map((p) => days(lastByPerson.get(p.id) ?? p.created_at ?? null)),
      );
      const tip: MentorTip = {
        key: "pessoas-frias",
        text: `Tens ${frias.length} pessoas sem contacto registado há mais de dois meses — ${frias.slice(0, 2).map((p) => String(p.name).split(" ")[0]).join(" e ")} entre elas. Um contacto curto agora vale mais do que uma campanha daqui a meio ano.`,
        linkLabel: "Ver pessoas →",
        to: "/pessoas",
        reason: `limiar de 60 dias; a mais fria está há ${Math.max(
          ...frias.map((p) => days(lastByPerson.get(p.id) ?? p.created_at ?? null)),
        )} dias sem interação nem seguimento com resultado registado.`,
      };
      return { tip, facts };
    }
  }

  return { tip: null, facts };
}
