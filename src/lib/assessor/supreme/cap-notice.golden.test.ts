// Golden — aviso quando o teto de avisos/dia trava lembretes.
import { describe, it, expect } from "vitest";
import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";
import { generateSupremeNudges, CAP_NOTICE_PREFIX } from "./briefing.server";

const USER = "22222222-2222-4222-8222-222222222222";

function sentNudge(i: number) {
  return {
    id: `n${i}`,
    user_id: USER,
    status: "sent",
    sent_at: new Date().toISOString(),
    dedupe_key: `x${i}`,
  };
}

// Evento interno daqui a 60 min (14:00 Lisboa), dentro da janela 45–75 min.
function eventInOneHour() {
  return {
    id: "ev1",
    user_id: USER,
    title: "Reunião de equipa",
    type: "reuniao",
    status: "Pendente",
    outcome: null,
    archived_at: null,
    person_id: null,
    event_class: "interno",
    due_date: "2026-09-03T00:00:00Z",
    due_time: "14:00",
  };
}

function setup(over: { cap: number; sent: number; nudges?: any[]; events?: any[] }) {
  return makeFakeSupabase({
    consultant_preferences: [
      {
        user_id: USER,
        morning_briefing_enabled: false,
        evening_wrap_enabled: false,
        quiet_hours_start: "22:00",
        quiet_hours_end: "07:30",
        max_daily_nudges: over.cap,
      },
    ],
    assessor_nudges: over.nudges ?? Array.from({ length: over.sent }, (_, i) => sentNudge(i)),
    follow_ups: over.events ?? [eventInOneHour()],
    people: [],
  }) as any;
}

// Meio-dia de um dia útil, longe de quiet hours e das janelas de briefing.
const NOW = new Date("2026-09-03T12:00:00.000Z");

describe("golden — aviso de teto de avisos atingido", () => {
  it("teto atingido com lembretes por dar → envia um aviso explicativo", async () => {
    const drafts = await generateSupremeNudges(setup({ cap: 1, sent: 1 }), USER, NOW);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].dedupe_key).toContain(CAP_NOTICE_PREFIX);
    expect(drafts[0].suggested_reply).toMatch(/teto|máximo/i);
    expect(drafts[0].suggested_reply).toMatch(/definicoes|avisos/i);
  });

  it("aviso é uma vez por dia — não repete", async () => {
    const nudges = [
      sentNudge(0),
      { id: "c", user_id: USER, status: "sent", sent_at: NOW.toISOString(), dedupe_key: `${CAP_NOTICE_PREFIX}20260903` },
    ];
    const drafts = await generateSupremeNudges(setup({ cap: 1, sent: 0, nudges }), USER, NOW);
    expect(drafts).toEqual([]);
  });

  it("teto atingido sem nada para dizer → silêncio total", async () => {
    const supabase = setup({ cap: 1, sent: 1, events: [] });
    const drafts = await generateSupremeNudges(supabase, USER, NOW);
    expect(drafts).toEqual([]);
  });

  it("com espaço no teto → nenhum aviso extra", async () => {
    const drafts = await generateSupremeNudges(setup({ cap: 6, sent: 0 }), USER, NOW);
    expect(drafts.some((d) => d.dedupe_key?.includes(CAP_NOTICE_PREFIX))).toBe(false);
  });
});
