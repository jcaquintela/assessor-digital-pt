import { describe, expect, it } from "vitest";
import { hasCommercialOutcomeContext } from "./outcome-eligibility";
import { findAwaitingOutcome } from "./supreme/priorities.server";
import { generateSupremeNudges } from "./supreme/briefing.server";

// Compromissos genéricos vindos do calendário (almoço, reunião interna,
// médico...) não são seguimentos comerciais. Nunca podem provocar
// "Como correu X?" enquanto não estiverem ligados a Pessoa, Imóvel ou Negócio.

const GENERIC_TITLES = [
  "Reunião de equipa",
  "Almoço",
  "Almoço com a família",
  "Ginásio",
  "Consulta médica",
  "Formação interna",
  "Aniversário da Maria",
];

function genericEvent(title: string, minutesAgo: number) {
  return {
    id: `ev-${title.toLowerCase().replace(/\s+/g, "-")}`,
    user_id: "u1",
    title,
    type: "Evento",
    due_date: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    status: "agendado",
    outcome: null,
    person_id: null,
    related_property_id: null,
    opportunity_id: null,
    source_channel: "google_calendar",
  };
}

function makeSupabase(rows: Record<string, any[]>) {
  const build = (table: string) => {
    let data = [...(rows[table] ?? [])];
    const api: any = {
      select: (_cols?: string, opts?: any) => {
        if (opts?.head) {
          return { ...api, then: (res: any, rej: any) => Promise.resolve({ count: data.length }).then(res, rej) };
        }
        return api;
      },
      eq: (c: string, v: any) => { data = data.filter((r) => r[c] === v); return api; },
      neq: (c: string, v: any) => { data = data.filter((r) => r[c] !== v); return api; },
      is: (c: string, v: any) => { data = data.filter((r) => (r[c] ?? null) === v); return api; },
      not: () => api,
      like: () => { data = []; return api; },
      in: (c: string, vals: any[]) => { data = data.filter((r) => vals.includes(r[c])); return api; },
      gte: (c: string, v: any) => { data = data.filter((r) => new Date(r[c]) >= new Date(v)); return api; },
      lte: (c: string, v: any) => { data = data.filter((r) => new Date(r[c]) <= new Date(v)); return api; },
      lt: (c: string, v: any) => { data = data.filter((r) => new Date(r[c]) < new Date(v)); return api; },
      order: () => api,
      limit: () => api,
      maybeSingle: () => Promise.resolve({ data: data[0] ?? null }),
      then: (res: any, rej: any) => Promise.resolve({ data, count: data.length }).then(res, rej),
    };
    return api;
  };
  return { from: (t: string) => build(t) };
}

describe("golden: eventos genéricos concluídos não pedem check-in", () => {
  it.each(GENERIC_TITLES)("%s não tem contexto comercial", (title) => {
    expect(hasCommercialOutcomeContext(genericEvent(title, 60))).toBe(false);
  });

  it.each(GENERIC_TITLES)("%s não entra em 'Aguardam resultado'", async (title) => {
    const supabase = makeSupabase({ follow_ups: [genericEvent(title, 60)], people: [] });
    await expect(findAwaitingOutcome(supabase as any, "u1")).resolves.toEqual([]);
  });

  it("vários eventos genéricos juntos continuam a não gerar nada", async () => {
    const supabase = makeSupabase({
      follow_ups: GENERIC_TITLES.map((t, i) => genericEvent(t, 30 + i * 10)),
      people: [],
    });
    await expect(findAwaitingOutcome(supabase as any, "u1")).resolves.toEqual([]);
  });

  it("só o compromisso com Pessoa/Imóvel/Negócio sobrevive à mistura", async () => {
    const comercial = {
      ...genericEvent("Visita ao T3", 45),
      id: "visita-1",
      person_id: "p1",
    };
    const supabase = makeSupabase({
      follow_ups: [...GENERIC_TITLES.map((t) => genericEvent(t, 60)), comercial],
      people: [{ id: "p1", name: "Sr. Almeida" }],
    });
    const out = await findAwaitingOutcome(supabase as any, "u1");
    expect(out.map((i) => i.id)).toEqual(["visita-1"]);
  });

  it("o nudge pós-compromisso ignora eventos genéricos terminados há 60 min", async () => {
    const now = new Date();
    now.setUTCHours(12, 0, 0, 0);
    const supabase = makeSupabase({
      consultant_preferences: [{
        user_id: "u1", morning_briefing_enabled: false, morning_time: "08:00",
        morning_days: [1, 2, 3, 4, 5], quiet_hours_start: "22:00", quiet_hours_end: "07:30",
        max_daily_nudges: 6,
      }],
      assessor_nudges: [],
      follow_ups: [
        { ...genericEvent("Reunião de equipa", 60), due_date: new Date(now.getTime() - 60 * 60_000).toISOString() },
        { ...genericEvent("Almoço", 45), due_date: new Date(now.getTime() - 45 * 60_000).toISOString() },
      ],
      people: [],
    });
    const drafts = await generateSupremeNudges(supabase as any, "u1", now);
    expect(drafts.filter((d) => d.dedupe_key?.startsWith("supreme_outcome_check:"))).toEqual([]);
  });

  it("o nudge pós-compromisso mantém-se para um evento com Pessoa", async () => {
    const now = new Date();
    now.setUTCHours(12, 0, 0, 0);
    const supabase = makeSupabase({
      consultant_preferences: [{
        user_id: "u1", morning_briefing_enabled: false, morning_time: "08:00",
        morning_days: [1, 2, 3, 4, 5], quiet_hours_start: "22:00", quiet_hours_end: "07:30",
        max_daily_nudges: 6,
      }],
      assessor_nudges: [],
      follow_ups: [{
        ...genericEvent("Visita ao T3", 60),
        id: "visita-1",
        person_id: "p1",
        due_date: new Date(now.getTime() - 60 * 60_000).toISOString(),
      }],
      people: [{ id: "p1", name: "Sr. Almeida" }],
    });
    const drafts = await generateSupremeNudges(supabase as any, "u1", now);
    expect(drafts.some((d) => d.dedupe_key === "supreme_outcome_check:visita-1")).toBe(true);
  });
});