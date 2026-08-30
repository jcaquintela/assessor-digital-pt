// Golden tests — Resumo de fim de dia (proativo + sob pedido).
//
// Regra que estes testes protegem: um único agregador (buildDaySnapshot) e um
// único caminho de aviso (assessor_nudges). Silêncio quando o dia não deixou
// rasto.

import { describe, it, expect } from "vitest";
import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";
import { lisbonInstant, lisbonYmd } from "@/lib/assessor/lisbon-day";
import { buildDaySnapshot } from "./day-snapshot.server";
import {
  composeEveningReview,
  detectEveningReviewQuery,
  hasEveningSignal,
  CALM_DAY_REPLY,
} from "./evening-review";
import { generateSupremeNudges, EVENING_REVIEW_PREFIX } from "./briefing.server";
import { detectDayStateQuery } from "../v3/deterministic.server";
import { DETERMINISTIC_ROUTER } from "../v3/deterministic-router.server";
import { computePriorities } from "./priorities.server";

const USER = "u1";

/** Quarta-feira útil, 19:00 em Lisboa. */
const NOW = new Date(lisbonInstant("2026-09-02", 19, 0, 0));
const TODAY = lisbonYmd(NOW);
const TOMORROW = "2026-09-03";

const iso = (ymd: string, hh: number, mm = 0) => new Date(lisbonInstant(ymd, hh, mm, 0)).toISOString();

function activeDaySeed() {
  return {
    consultant_preferences: [{
      user_id: USER,
      morning_briefing_enabled: false,
      morning_days: [1, 2, 3, 4, 5],
      quiet_hours_start: "22:00",
      quiet_hours_end: "07:30",
      evening_wrap_enabled: true,
      evening_time: "19:00",
      max_daily_nudges: 6,
    }],
    profiles: [{ id: USER, name: "Júlio Quintela" }],
    people: [{ id: "p1", user_id: USER, name: "Sr. Nogueira" }],
    properties: [{ id: "im1", user_id: USER, title: "T3 Foz", address: "Rua A" }],
    interactions: [{
      id: "i1", user_id: USER, person_id: "p1", property_id: "im1",
      interaction_type: "visita", occurred_at: iso(TODAY, 11), summary: "Gostou da casa",
      archived_at: null,
    }],
    follow_ups: [
      {
        id: "f1", user_id: USER, title: "Visita ao T3 Foz", type: "evento",
        due_date: iso(TODAY, 11), due_time: "11:00", status: "concluido",
        outcome: "realizada", archived_at: null, person_id: "p1",
      },
      {
        id: "f2", user_id: USER, title: "Enviar proposta ao Sr. Nogueira", type: "tarefa",
        due_date: iso(TODAY, 17), due_time: null, status: "pendente",
        outcome: null, archived_at: null, person_id: "p1", created_at: iso(TODAY, 9),
      },
      {
        id: "f3", user_id: USER, title: "Escritura do Sr. Silva", type: "evento",
        due_date: iso(TOMORROW, 10), due_time: "10:00", status: "pendente",
        outcome: null, archived_at: null, person_id: "p1", created_at: iso(TODAY, 9),
      },
    ],
    pending_actions: [{ id: "pa1", user_id: USER, status: "pending_confirmation" }],
    miscellaneous_items: [{ id: "m1", user_id: USER, status: "inbox" }],
    opportunities: [],
    assessor_nudges: [],
    assessor_messages: [],
  } as any;
}

describe("resumo de fim de dia", () => {
  it("1) dia com atividade real → resumo com as 3 partes", async () => {
    const sup = makeFakeSupabase(activeDaySeed());
    const snap = await buildDaySnapshot(sup as any, USER, { lens: "fim_de_dia", now: NOW });
    expect(snap.visits.length).toBe(1);
    expect(snap.closed.map((c) => c.title)).toContain("Visita ao T3 Foz");
    expect(snap.openToday.map((c) => c.title)).toContain("Enviar proposta ao Sr. Nogueira");
    expect(snap.tomorrow.length).toBeGreaterThan(0);

    const text = composeEveningReview(snap, { firstName: "Júlio" });
    expect(text).toContain("Hoje:");
    expect(text).toContain("Por fechar:");
    expect(text).toContain("Amanhã:");
    expect(text).toContain("Sr. Nogueira");
  });

  it("2) dia calmo em modo automático → não envia nada", async () => {
    const sup = makeFakeSupabase({
      consultant_preferences: activeDaySeed().consultant_preferences,
      profiles: [{ id: USER, name: "Júlio" }],
      follow_ups: [], interactions: [], people: [], properties: [],
      pending_actions: [], miscellaneous_items: [], opportunities: [],
      assessor_nudges: [], assessor_messages: [],
    } as any);
    const snap = await buildDaySnapshot(sup as any, USER, { lens: "fim_de_dia", now: NOW });
    expect(hasEveningSignal(snap)).toBe(false);

    const drafts = await generateSupremeNudges(sup as any, USER, NOW);
    expect(drafts.filter((d) => d.dedupe_key?.startsWith(EVENING_REVIEW_PREFIX))).toEqual([]);
  });

  it("3) dia calmo sob pedido → resposta mínima de 1 linha", async () => {
    const sup = makeFakeSupabase({
      consultant_preferences: activeDaySeed().consultant_preferences,
      follow_ups: [], interactions: [], people: [], properties: [],
      pending_actions: [], miscellaneous_items: [], opportunities: [],
    } as any);
    const snap = await buildDaySnapshot(sup as any, USER, { lens: "fim_de_dia", now: NOW });
    const reply = composeEveningReview(snap);
    expect(reply).toBe(CALM_DAY_REPLY);
    expect(reply.split("\n")).toHaveLength(1);
  });

  it("4) 'resumo do dia' é retrospetivo, não estado do dia", () => {
    for (const frase of ["Resumo do dia", "Como correu o dia?", "O que fiz hoje?", "Balanço de hoje"]) {
      expect(detectEveningReviewQuery(frase)).toBe(true);
      expect(detectDayStateQuery(frase)).toBe(false);
    }
    // O prospetivo continua a funcionar.
    expect(detectDayStateQuery("Como está o meu dia?")).toBe(true);
    expect(detectEveningReviewQuery("Como está o meu dia?")).toBe(false);
    // Precedência no router.
    const names = DETERMINISTIC_ROUTER.map((c) => c.name);
    expect(names.indexOf("evening_review")).toBeLessThan(names.indexOf("day_state"));
  });

  it("5) janela de amanhã (windowStart) não duplica itens de hoje", async () => {
    const sup = makeFakeSupabase(activeDaySeed());
    const tomorrowStart = new Date(lisbonInstant(TOMORROW, 0, 0, 0));
    const tomorrowEnd = new Date(lisbonInstant(TOMORROW, 23, 59, 59));
    const amanha = await computePriorities(sup as any, USER, {
      limit: 5, now: NOW, windowStart: tomorrowStart, windowEnd: tomorrowEnd,
    });
    const ids = amanha.map((p) => p.subject_id);
    expect(ids).toContain("f3");
    expect(ids).not.toContain("f2");
    expect(ids).not.toContain("f1");

    const hoje = await computePriorities(sup as any, USER, { limit: 5, now: NOW });
    expect(hoje.map((p) => p.subject_id)).not.toContain("f3");
  });

  it("6) respeita quiet hours e cap diário — sem caminho paralelo", async () => {
    // Quiet hours: 23:30 está dentro de [22:00, 07:30).
    const seed = activeDaySeed();
    const late = new Date(lisbonInstant(TODAY, 23, 30, 0));
    expect(await generateSupremeNudges(makeFakeSupabase(seed) as any, USER, late)).toEqual([]);

    // Cap diário atingido → nada sai, nem o resumo.
    const capped = activeDaySeed();
    capped.consultant_preferences[0].max_daily_nudges = 1;
    capped.assessor_nudges = [{
      id: "n1", user_id: USER, status: "sent",
      sent_at: new Date().toISOString(), dedupe_key: "x",
    }];
    expect(await generateSupremeNudges(makeFakeSupabase(capped) as any, USER, NOW)).toEqual([]);
  });
});
