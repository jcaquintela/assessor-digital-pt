// Golden tests do bug "Bom dia — a agenda está livre" com 5 compromissos reais.
//
// Causa raiz: a query das prioridades ia buscar as 50 linhas MAIS ANTIGAS em
// aberto; com 62 registos velhos por fechar, os compromissos de hoje nunca
// chegavam ao motor. Blindagem: "livre" só se diz depois de confirmar a
// agenda real do dia, na mesma janela da consulta directa.

import { describe, expect, it } from "vitest";
import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";
import { computePriorities } from "../supreme/priorities.server";
import { loadDayAgendaFacts } from "./day-agenda-facts.server";
import { composeNoPrioritiesBriefing } from "./day-agenda-facts";
import { composeBriefingText } from "../supreme/briefing.server";

const USER = "u1";
const NOW = new Date("2026-08-31T07:02:00Z"); // 08:02 em Lisboa

/** Os 5 compromissos reais do dia (Outlook), tal como estão na base de dados. */
const TODAY_EVENTS = [
  { id: "e1", title: "Level-Up 2026", due_date: "2026-08-31T09:00:00+00:00", due_time: "10:00" },
  { id: "e2", title: "OPS COMMAND", due_date: "2026-08-31T09:45:00+00:00", due_time: "10:45" },
  { id: "e3", title: "Propdesk >< ZOME", due_date: "2026-08-31T10:30:00+00:00", due_time: "11:30" },
  { id: "e4", title: "Almoço", due_date: "2026-08-31T12:00:00+00:00", due_time: "13:00" },
  { id: "e5", title: "M36 weekly follow up", due_date: "2026-08-31T13:30:00+00:00", due_time: "14:30" },
].map((e) => ({
  ...e,
  user_id: USER,
  type: "evento",
  status: "agendado",
  outcome: null,
  archived_at: null,
  priority: "media",
  created_at: "2026-08-28T08:12:12+00:00",
}));

/** 62 registos antigos em aberto — o histórico que escondia o dia de hoje. */
function oldBacklog(n = 62) {
  return Array.from({ length: n }, (_, i) => ({
    id: `old-${String(i).padStart(3, "0")}`,
    user_id: USER,
    title: `Tarefa antiga ${i}`,
    type: "tarefa",
    due_date: `2026-0${i % 2 === 0 ? 5 : 6}-${String((i % 28) + 1).padStart(2, "0")}T09:00:00+00:00`,
    due_time: null,
    status: "pendente",
    outcome: null,
    archived_at: null,
    priority: "media",
    created_at: "2026-05-01T09:00:00+00:00",
  }));
}

describe("briefing nunca diz agenda livre com o dia cheio", () => {
  it("1) 62 registos antigos + 5 eventos de hoje: o briefing lista os de hoje e não diz livre", async () => {
    const db = makeFakeSupabase({ follow_ups: [...oldBacklog(), ...TODAY_EVENTS] });
    const items = await computePriorities(db as any, USER, { limit: 20, now: NOW });
    const titles = items.map((i) => i.action).join(" | ");
    expect(titles).toContain("Level-Up 2026");
    expect(titles).toContain("OPS COMMAND");
    const text = composeBriefingText(items, { firstName: "Julio", now: NOW });
    expect(text).not.toContain("agenda está livre");
  });

  it("2) briefing atrasado com a manhã já passada: livre a partir de agora, não o dia todo", async () => {
    const tarde = new Date("2026-08-31T15:30:00Z"); // 16:30 em Lisboa
    const db = makeFakeSupabase({ follow_ups: TODAY_EVENTS });
    const events = await loadDayAgendaFacts(db as any, USER, tarde);
    const text = composeNoPrioritiesBriefing("Julio", events, tarde);
    expect(text).toContain("A partir de agora estás livre");
    expect(text).toContain("Level-Up 2026");
    expect(text).not.toContain("agenda está livre");
  });

  it("3) dia só com lazer: distingue sem trabalho de sem nada", async () => {
    const db = makeFakeSupabase({
      follow_ups: TODAY_EVENTS.filter((e) => e.title === "Almoço"),
    });
    const events = await loadDayAgendaFacts(db as any, USER, NOW);
    const text = composeNoPrioritiesBriefing("Julio", events, NOW);
    expect(text).toContain("Sem compromissos de trabalho");
    expect(text).toContain("Almoço às 13:00");
    expect(text).not.toContain("agenda está livre");
  });

  it("4) regressão: volume de histórico antigo nunca esconde os eventos de hoje", async () => {
    const db = makeFakeSupabase({ follow_ups: [...oldBacklog(200), ...TODAY_EVENTS] });
    const items = await computePriorities(db as any, USER, { limit: 100, now: NOW });
    const ids = new Set(items.map((i) => i.subject_id));
    // O "Almoço" sai por ser lazer sem ligação comercial; os 4 de trabalho ficam.
    for (const id of ["e1", "e2", "e3", "e5"]) expect(ids.has(id)).toBe(true);
  });

  it("5) dia genuinamente vazio continua a poder dizer que está livre", async () => {
    const db = makeFakeSupabase({ follow_ups: [] });
    const events = await loadDayAgendaFacts(db as any, USER, NOW);
    expect(composeNoPrioritiesBriefing("Julio", events, NOW)).toContain("agenda está livre");
  });
});
