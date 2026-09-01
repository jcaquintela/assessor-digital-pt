// Execução das rotinas do tipo "resumo": lê os dados reais no momento do
// disparo e devolve texto pronto a enviar. Reaproveita as leituras que já
// existem (agenda do dia, prioridades, leads de prospeção).

import { classifyDigestQuery, composeDigestText, agendaLine, type DigestFacts } from "./routines-digest";

/** Leads que já foram abordadas e continuam sem resposta, ou por contactar. */
async function leadsFacts(supabase: any, userId: string): Promise<DigestFacts> {
  const { data } = await supabase
    .from("prospecting_leads")
    .select("id, title, status, location, last_contact_attempt_at, archived_at")
    .eq("user_id", userId)
    .in("status", ["to_contact", "contact_attempted"])
    .limit(50);
  const rows = ((data as any[]) ?? []).filter((r) => !r.archived_at);
  return {
    topic: "leads",
    total: rows.length,
    lines: rows.map((r) => {
      const label = String(r.title ?? "").trim() || String(r.location ?? "").trim() || "lead";
      return r.status === "contact_attempted" ? `${label} (sem resposta)` : `${label} (por contactar)`;
    }),
  };
}

async function agendaFacts(supabase: any, userId: string, now: Date): Promise<DigestFacts> {
  const { loadDayAgendaFacts } = await import("./proactive/day-agenda-facts.server");
  const events = await loadDayAgendaFacts(supabase, userId, now);
  return { topic: "agenda", total: events.length, lines: events.map(agendaLine) };
}

async function prioritiesFacts(supabase: any, userId: string, now: Date): Promise<DigestFacts> {
  const { computePriorities } = await import("./supreme/priorities.server");
  const items = await computePriorities(supabase, userId, { limit: 5, now });
  return {
    topic: "prioridades",
    total: items.length,
    lines: items.map((i) => String(i.action ?? "").trim()).filter(Boolean),
  };
}

/**
 * Constrói o texto do resumo para uma rotina digest.
 * Devolve sempre string (nunca inventa: leitura vazia → frase honesta).
 */
export async function buildDigestText(
  supabase: any,
  userId: string,
  opts: { query?: string | null; title?: string | null; now?: Date } = {},
): Promise<string> {
  const now = opts.now ?? new Date();
  const topic = classifyDigestQuery(opts.query ?? opts.title ?? "");
  const facts =
    topic === "leads"
      ? await leadsFacts(supabase, userId)
      : topic === "agenda"
        ? await agendaFacts(supabase, userId, now)
        : await prioritiesFacts(supabase, userId, now);
  return composeDigestText(facts, opts.title ?? null);
}
