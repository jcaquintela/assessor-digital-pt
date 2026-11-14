// Golden (dispatcher): teto global de 1 intervenção não solicitada por dia e
// por conta, horário de silêncio, e o aviso só vai para o próprio consultor.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";

const sends: Array<{ channel: string; to: string; text: string }> = [];
vi.mock("@/lib/assessor/channels.server", () => ({
  sendReplyForChannel: async (channel: string, to: string, text: string) => {
    sends.push({ channel, to, text });
    return { ok: true };
  },
}));
vi.mock("@/lib/assessor/primary-channel.server", () => ({
  resolveOutboundTarget: async (_sb: any, uid: string) => ({ channel: "whatsapp", externalId: `consultor-${uid}` }),
}));

import { dispatchPendingNudges } from "./proactivity.server";

const U = "11111111-1111-1111-1111-111111111111";
// Terça 17/11/2026, 10:00 em Lisboa (UTC+0 no inverno).
const NOW = new Date("2026-11-17T10:00:00Z");

const nudge = (id: string, kind: string, dedupe: string, priority: number | null = null) => ({
  id, user_id: U, kind, priority, status: "pending",
  suggested_reply: `texto ${id}`, subject_type: null, subject_id: null,
  dedupe_key: dedupe, scheduled_for: "2026-11-17T09:00:00Z", created_at: "2026-11-17T09:00:00Z",
});

function seed(extra: Record<string, any[]> = {}) {
  return makeFakeSupabase({
    feature_flag_users: [{ user_id: U, flag_key: "assessor.engine.v3" }],
    consultant_preferences: [{ user_id: U, quiet_hours_start: "22:00", quiet_hours_end: "07:30" }],
    assessor_nudges: [
      nudge("a", "followup_overdue", "followup_overdue:f1:20261117"),
      nudge("b", "deal_stalled", "opportunity:negocio_arrefecer:d1:20261117", 90),
      nudge("c", "opportunity_match", "opportunity:match_lead_imovel:l1:p1:20261117", 60),
    ],
    ...extra,
  });
}

beforeEach(() => { sends.length = 0; });

describe("dispatcher com teto diário", () => {
  it("de 3 avisos elegíveis sai 1 (o de maior prioridade) e os outros não se acumulam", async () => {
    const sb = seed();
    const r = await dispatchPendingNudges(sb as any, { now: NOW });
    expect(r.sent).toBe(1);
    expect(sends.map((s) => s.text)).toEqual(["texto b"]);
    const byId = Object.fromEntries(sb.state.assessor_nudges.map((n: any) => [n.id, n]));
    expect(byId.b.status).toBe("sent");
    expect([byId.a.status, byId.a.outcome]).toEqual(["dismissed", "daily_cap"]);
    expect([byId.c.status, byId.c.outcome]).toEqual(["dismissed", "daily_cap"]);
  });

  it("um segundo ciclo no mesmo dia não envia mais nada não solicitado", async () => {
    const sb = seed();
    await dispatchPendingNudges(sb as any, { now: NOW });
    sb.state.assessor_nudges.push(nudge("d", "deal_stalled", "opportunity:negocio_arrefecer:d9:20261117", 99));
    sends.length = 0;
    const r = await dispatchPendingNudges(sb as any, { now: new Date("2026-11-17T11:00:00Z") });
    expect(r.sent).toBe(0);
    expect(sends).toEqual([]);
  });

  it("o teto é configurável por conta", async () => {
    const sb = seed({ consultant_preferences: [{ user_id: U, max_unsolicited_nudges_per_day: 2 }] });
    const r = await dispatchPendingNudges(sb as any, { now: NOW });
    expect(r.sent).toBe(2);
    expect(sends.map((s) => s.text)).toEqual(["texto b", "texto c"]);
  });

  it("no horário de silêncio do consultor os não solicitados esperam", async () => {
    const sb = seed({ consultant_preferences: [{ user_id: U, quiet_hours_start: "09:30", quiet_hours_end: "12:00" }] });
    const r = await dispatchPendingNudges(sb as any, { now: NOW });
    expect(r.sent).toBe(0);
    expect(sb.state.assessor_nudges.every((n: any) => n.status === "pending")).toBe(true);
  });

  it("ao domingo não sai nada", async () => {
    const sb = seed();
    const r = await dispatchPendingNudges(sb as any, { now: new Date("2026-11-15T10:00:00Z") });
    expect(r.sent).toBe(0);
  });

  it("o aviso vai só para o canal do próprio consultor, nunca para terceiros", async () => {
    const sb = seed();
    await dispatchPendingNudges(sb as any, { now: NOW });
    expect(sends.every((s) => s.to === `consultor-${U}`)).toBe(true);
  });
});
