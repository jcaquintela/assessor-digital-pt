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
  type: string | null;
  personId: string | null;
  propertyId: string | null;
}

/** Estados que tiram um compromisso do dia. */
const DONE_FOLLOW_UP = new Set([
  "concluído", "concluido", "concluída", "concluida", "done", "completed", "cancelado", "cancelled", "arquivado",
]);

export function isOpenFollowUp(status: unknown): boolean {
  return !DONE_FOLLOW_UP.has(String(status ?? "").trim().toLowerCase());
}

export interface MentorTip {
  text: string;
  linkLabel: string;
  to: string;
  key: string;
  /** Porque disparou: dias sem contacto e que atividade foi usada como referência. */
  reason: string;
}

import { isDealClosed } from "@/lib/deals/stages";

const CLOSED_PROPERTY = new Set(["vendido", "arquivado"]);

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 864e5).toISOString();
}

function todayRangeLisbon(now = new Date()): { start: string; end: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  const start = new Date(`${m.year}-${m.month}-${m.day}T00:00:00+00:00`);
  return { start: start.toISOString(), end: new Date(start.getTime() + 864e5 - 1).toISOString() };
}

export async function computeOverview(supabase: any, userId: string): Promise<OverviewSummary> {
  const { start, end } = todayRangeLisbon();

  const [deals, props, people, misc, events, movements, interactions] = await Promise.all([
    supabase.from("opportunities").select("id, status, stage, value, archived_at").eq("user_id", userId),
    supabase.from("properties").select("id, status").eq("user_id", userId),
    supabase.from("people").select("id").eq("user_id", userId),
    supabase.from("miscellaneous_items").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "inbox"),
    supabase.from("follow_ups").select("id, title, type, due_date, due_time, status, person_id, related_property_id")
      .eq("user_id", userId).gte("due_date", start).lte("due_date", end).order("due_time", { ascending: true }),
    supabase.from("financial_movements").select("id, type, amount, status").eq("user_id", userId).eq("type", "commission"),
    supabase.from("interactions").select("person_id").eq("user_id", userId).gte("occurred_at", isoDaysAgo(7)),
  ]);

  const dealRows = ((deals.data as any[]) ?? []).filter(
    (d) => !d.archived_at && !isDealClosed(d),
  );
  const propRows = ((props.data as any[]) ?? []).filter(
    (p) => !CLOSED_PROPERTY.has(String(p.status ?? "").toLowerCase()),
  );
  const eventRows: AgendaItem[] = ((events.data as any[]) ?? [])
    .filter((e) => isOpenFollowUp(e.status))
    .map((e) => ({
      id: String(e.id),
      title: String(e.title ?? "Compromisso"),
      time: e.due_time ? String(e.due_time).slice(0, 5) : null,
      type: e.type ? String(e.type) : null,
      personId: e.person_id ?? null,
      propertyId: e.related_property_id ?? e.property_id ?? null,
    }))
    .sort((a, b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99"));
  const next = eventRows[0] ?? null;
  const commissions = ((movements.data as any[]) ?? []);
  const open = commissions.filter((m) => {
    const s = String(m.status ?? "").toLowerCase();
    return s !== "recebida" && s !== "received" && s !== "paga" && s !== "paid";
  });

  return {
    deals: { count: dealRows.length, value: dealRows.reduce((s, d) => s + Number(d.value ?? 0), 0) },
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
      today: eventRows.length,
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
export async function computeMentorTip(supabase: any, userId: string): Promise<MentorTip | null> {
  const now = Date.now();
  const days = (iso: string | null) => (iso ? Math.floor((now - new Date(iso).getTime()) / 864e5) : 0);
  /** Data mais recente de um conjunto, ou null. */
  const latest = (...vals: (string | null | undefined)[]) => {
    const ts = vals.filter(Boolean).map((v) => new Date(v as string).getTime()).filter((n) => !Number.isNaN(n));
    return ts.length ? new Date(Math.max(...ts)).toISOString() : null;
  };

  const [props, deals, people, ints, done, links] = await Promise.all([
    supabase.from("properties").select("id, status, created_at").eq("user_id", userId),
    supabase.from("opportunities").select("id, status, stage, stage_changed_at, archived_at").eq("user_id", userId),
    supabase.from("people").select("id, name, created_at").eq("user_id", userId).limit(200),
    // Contactos reais registados (save_interaction e equivalentes).
    supabase.from("interactions").select("person_id, opportunity_id, occurred_at").eq("user_id", userId),
    // Seguimentos com resultado registado contam como contacto real.
    supabase.from("follow_ups").select("person_id, opportunity_id, related_property_id, outcome_recorded_at")
      .eq("user_id", userId).not("outcome_recorded_at", "is", null),
    supabase.from("opportunity_properties").select("opportunity_id, property_id").eq("user_id", userId),
  ]);

  const intRows = ((ints.data as any[]) ?? []);
  const doneRows = ((done.data as any[]) ?? []);
  const linkRows = ((links.data as any[]) ?? []);

  // Último contacto real por negócio.
  const lastByDeal = new Map<string, string | null>();
  for (const r of intRows) if (r.opportunity_id) lastByDeal.set(r.opportunity_id, latest(lastByDeal.get(r.opportunity_id), r.occurred_at));
  for (const r of doneRows) if (r.opportunity_id) lastByDeal.set(r.opportunity_id, latest(lastByDeal.get(r.opportunity_id), r.outcome_recorded_at));

  // Último contacto real por pessoa.
  const lastByPerson = new Map<string, string | null>();
  for (const r of intRows) if (r.person_id) lastByPerson.set(r.person_id, latest(lastByPerson.get(r.person_id), r.occurred_at));
  for (const r of doneRows) if (r.person_id) lastByPerson.set(r.person_id, latest(lastByPerson.get(r.person_id), r.outcome_recorded_at));

  // Último contacto real por imóvel: seguimentos do imóvel + contactos dos negócios ligados a ele.
  const lastByProperty = new Map<string, string | null>();
  for (const r of doneRows) if (r.related_property_id) lastByProperty.set(r.related_property_id, latest(lastByProperty.get(r.related_property_id), r.outcome_recorded_at));
  for (const l of linkRows) {
    if (!l.property_id || !l.opportunity_id) continue;
    lastByProperty.set(l.property_id, latest(lastByProperty.get(l.property_id), lastByDeal.get(l.opportunity_id) ?? null));
  }

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
        return { dias: days(contacto ?? p.created_at ?? null), temContacto: !!contacto };
      })
      .sort((a, b) => b.dias - a.dias)[0];
    return {
      key: "imoveis-parados",
      text: `Tens ${parados.length} imóve${parados.length === 1 ? "l" : "is"} "Por angariar" há mais de 10 dias sem nenhum movimento registado. Vale a pena retomares o contacto antes que arrefeçam de vez.`,
      linkLabel: parados.length === 1 ? "Ver o imóvel →" : `Ver os ${parados.length} imóveis →`,
      to: "/imoveis",
      reason: pior.temContacto
        ? `limiar de 10 dias; o mais parado está há ${pior.dias} dias desde o último contacto real registado (interação ou seguimento com resultado, incluindo através de um negócio ligado ao imóvel).`
        : `limiar de 10 dias; o mais parado nunca teve contacto registado — contam-se ${pior.dias} dias desde que criaste a ficha. Editar campos não conta como contacto.`,
    };
  }

  // 2. Negócios na mesma fase há 25+ dias e sem contacto real nesse período.
  const presos = ((deals.data as any[]) ?? []).filter((d) => {
    if (d.archived_at || isDealClosed(d)) return false;
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
    return {
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
  }

  // 3. Pessoas sem contacto real há mais de 60 dias.
  const rows = ((people.data as any[]) ?? []).filter((p) => days(p.created_at) >= 60);
  if (rows.length) {
    const frias = rows.filter((p) => days(lastByPerson.get(p.id) ?? p.created_at ?? null) >= 60);
    if (frias.length >= 3) {
      return {
        key: "pessoas-frias",
        text: `Tens ${frias.length} pessoas sem contacto registado há mais de dois meses — ${frias.slice(0, 2).map((p) => String(p.name).split(" ")[0]).join(" e ")} entre elas. Um contacto curto agora vale mais do que uma campanha daqui a meio ano.`,
        linkLabel: "Ver pessoas →",
        to: "/pessoas",
        reason: `limiar de 60 dias; a mais fria está há ${Math.max(
          ...frias.map((p) => days(lastByPerson.get(p.id) ?? p.created_at ?? null)),
        )} dias sem interação nem seguimento com resultado registado.`,
      };
    }
  }

  return null;
}
