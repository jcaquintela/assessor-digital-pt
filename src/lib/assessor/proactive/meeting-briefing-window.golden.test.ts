// Golden tests: janela de 30 min, anti-sobreposição, reagendamento e bloco
// de pendências na Cartela de Briefing.
import { describe, expect, it, vi } from "vitest";
import {
  BRIEFING_GRACE_MINUTES,
  BRIEFING_LEAD_MINUTES,
  formatMeetingBriefing,
  formatPendings,
  groupNearbyEvents,
  isBriefingDue,
} from "./meeting-briefing";
import { rescheduleReminder } from "@/lib/assessor/v3/reminders.server";

const baseEvent = {
  id: "e1",
  user_id: "u1",
  title: "Visita T2 Conselhas",
  due_time: null,
  status: "Pendente",
  person_id: "p1",
  related_property_id: null,
  opportunity_id: null,
  event_class: null,
  created_at: "2026-08-12T09:00:00Z",
  briefing_sent_at: null,
} as any;

const brief = {
  name: "Vasco",
  relationship: "comprador",
  lastInteraction: { when: "2026-08-10T10:00:00Z", text: "Quer ver o T2." },
  properties: [],
  deals: [],
  nextAction: null,
} as any;

describe("Cartela de Briefing — janela de 30 minutos", () => {
  it("1. dispara a 30 min e tolera atraso do cron (~8 min), mas não fora disso", () => {
    expect(BRIEFING_LEAD_MINUTES).toBe(30);
    expect(BRIEFING_GRACE_MINUTES).toBe(8);
    const ev = { ...baseEvent, due_date: "2026-08-13T14:30:00Z" };
    // 30 min antes: dentro.
    expect(isBriefingDue(ev, Date.parse("2026-08-13T14:00:00Z"))).toBe(true);
    // Corrida atrasada 7 min: ainda dentro.
    expect(isBriefingDue(ev, Date.parse("2026-08-13T14:07:00Z"))).toBe(true);
    // Cedo demais (45 min antes): fora.
    expect(isBriefingDue(ev, Date.parse("2026-08-13T13:45:00Z"))).toBe(false);
    // Tarde demais (12 min antes): fora.
    expect(isBriefingDue(ev, Date.parse("2026-08-13T14:18:00Z"))).toBe(false);
  });

  it("2. dois compromissos a <45 min um do outro entram numa só cartela", () => {
    const a = { ...baseEvent, id: "a", due_date: "2026-08-13T14:30:00Z" };
    const b = { ...baseEvent, id: "b", due_date: "2026-08-13T15:00:00Z" };
    const c = { ...baseEvent, id: "c", due_date: "2026-08-13T17:00:00Z" };
    const groups = groupNearbyEvents([c, b, a]);
    expect(groups.map((g) => g.map((e) => e.id))).toEqual([["a", "b"], ["c"]]);
    // Consultores diferentes nunca se misturam.
    const other = { ...baseEvent, id: "d", user_id: "u2", due_date: "2026-08-13T14:35:00Z" };
    expect(groupNearbyEvents([a, other]).length).toBe(2);
  });

  it("3. reagendar limpa briefing_sent_at para haver nova preparação", async () => {
    const patches: any[] = [];
    const supabase = {
      from(table: string) {
        const q: any = {
          select: () => q,
          eq: () => q,
          in: () => q,
          ilike: () => q,
          order: () => q,
          limit: () => q,
          is: () => q,
          maybeSingle: async () => ({ data: null }),
          update(patch: any) { if (table === "follow_ups") patches.push(patch); return q; },
          then: (resolve: any) => resolve({ data: [{ id: "fu1" }], error: null }),
        };
        return q;
      },
    };
    const res = await rescheduleReminder(supabase as any, {
      userId: "u1",
      channel: "telegram",
      related_resource_type: "follow_up",
      related_resource_id: "fu1",
      new_date: "2026-08-13",
      new_time: "16:00",
    });
    expect(res.ok).toBe(true);
    expect(patches.length).toBeGreaterThan(0);
    expect(patches[0].briefing_sent_at).toBeNull();
    expect(patches[0].due_time).toBe("16:00");
  });

  it("4. rascunho de email pendente + prazo próximo aparecem no bloco de pendências", () => {
    const text = formatMeetingBriefing(
      { ...baseEvent, due_date: "2026-08-13T14:30:00Z" },
      brief,
      Date.parse("2026-08-13T14:00:00Z"),
      null,
      {
        emailDrafts: ["Proposta T2 Conselhas"],
        deadlines: ["CPCV — é amanhã"],
      },
    );
    expect(text).toContain("Pendências:");
    expect(text).toContain("Email por enviar: Proposta T2 Conselhas");
    expect(text).toContain("Prazo: CPCV — é amanhã");
  });

  it("5. sem pendências não aparece bloco vazio", () => {
    expect(formatPendings(null)).toBe("");
    expect(formatPendings({})).toBe("");
    expect(formatPendings({ emailDrafts: [], deadlines: [] })).toBe("");
    const text = formatMeetingBriefing(
      { ...baseEvent, due_date: "2026-08-13T14:30:00Z" },
      brief,
      Date.parse("2026-08-13T14:00:00Z"),
      null,
      {},
    );
    expect(text).not.toContain("Pendências");
    expect(text).toContain("Vasco");
  });
});

// Silencia ruído de imports server-side nos testes puros.
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
