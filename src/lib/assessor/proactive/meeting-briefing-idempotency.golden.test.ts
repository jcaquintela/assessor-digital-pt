// Golden tests: nunca duas cartelas para o mesmo compromisso.
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendReply = vi.fn(async () => ({ ok: true }));

vi.mock("@/lib/assessor/primary-channel.server", () => ({
  resolveOutboundTarget: async () => ({ channel: "telegram", externalId: "123" }),
}));
vi.mock("@/lib/assessor/channels.server", () => ({
  sendReplyForChannel: (...a: any[]) => sendReply(...(a as [])),
}));
vi.mock("@/lib/assessor/v3/person-brief.server", () => ({
  buildPersonBrief: async () => ({
    kind: "ok",
    brief: {
      name: "Vasco",
      relationship: "comprador",
      lastInteraction: { when: "2026-08-10T10:00:00Z", text: "Quer ver o T2." },
      properties: [],
      deals: [],
      nextAction: null,
    },
  }),
}));

import { sendMeetingBriefing } from "./meeting-briefing.server";

const NOW = new Date("2026-08-13T14:16:00Z");

const event = {
  id: "e1",
  user_id: "u1",
  title: "Visita T2 Conselhas",
  due_date: "2026-08-13T14:30:00Z",
  due_time: null,
  status: "Pendente",
  person_id: "p1",
  related_property_id: null,
  opportunity_id: null,
  event_class: null,
  created_at: "2026-08-12T09:00:00Z",
  briefing_sent_at: null,
} as any;

function makeSupabase() {
  const state: { sentAt: string | null } = { sentAt: null };
  const supabase = {
    from(table: string) {
      const q: any = {
        _filters: {} as Record<string, unknown>,
        _update: null as any,
        select: () => q,
        eq: () => q,
        is(col: string, val: null) {
          q._filters[col] = val;
          return q;
        },
        maybeSingle: async () => ({ data: table === "people" ? { name: "Vasco" } : null }),
        update(patch: any) {
          q._update = patch;
          return q;
        },
        insert: async () => ({ error: null }),
        then(resolve: any) {
          // Executa o update quando a query é aguardada.
          if (q._update && table === "follow_ups") {
            const guarded = "briefing_sent_at" in q._filters;
            if (guarded && state.sentAt !== null) return resolve({ data: [], error: null });
            state.sentAt = q._update.briefing_sent_at ?? null;
            return resolve({ data: [{ id: "e1" }], error: null });
          }
          return resolve({ data: null, error: null });
        },
      };
      return q;
    },
  };
  return { supabase, state };
}

describe("cartela de briefing — idempotência", () => {
  beforeEach(() => sendReply.mockClear());

  it("1. reexecução do runner não reenvia a mesma cartela", async () => {
    const { supabase } = makeSupabase();
    const first = await sendMeetingBriefing(supabase as any, event, { now: NOW });
    expect(first.sent).toBe(true);
    const second = await sendMeetingBriefing(supabase as any, event, { now: NOW });
    expect(second.sent).toBe(false);
    expect(second.reason).toBe("already_sent");
    expect(sendReply).toHaveBeenCalledTimes(1);
  });

  it("2. evento alterado perto da hora continua a contar como já enviado", async () => {
    const { supabase } = makeSupabase();
    await sendMeetingBriefing(supabase as any, event, { now: NOW });
    const alterado = { ...event, title: "Visita T2 (novo horário)", briefing_sent_at: null };
    const again = await sendMeetingBriefing(supabase as any, alterado, { now: NOW });
    expect(again.sent).toBe(false);
    expect(again.reason).toBe("already_sent");
    expect(sendReply).toHaveBeenCalledTimes(1);
  });

  it("3. falha de envio liberta a reserva para nova tentativa", async () => {
    const { supabase, state } = makeSupabase();
    sendReply.mockResolvedValueOnce({ ok: false } as any);
    const failed = await sendMeetingBriefing(supabase as any, event, { now: NOW });
    expect(failed.sent).toBe(false);
    expect(failed.reason).toBe("send_failed");
    expect(state.sentAt).toBe(null);
    const retry = await sendMeetingBriefing(supabase as any, event, { now: NOW });
    expect(retry.sent).toBe(true);
  });
});
