// (1) Teto global de 1 intervenção NÃO solicitada por conta/dia, partilhado
// por todos os emissores proativos. Interruptor `assessor.global_unsolicited_cap.v1`.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb } from "@/lib/assessor/cross-channel/test-fake-db";
import { __resetAccountFlagsForTests, __setAccountFlagForTests } from "@/lib/flags/account-flag.server";
import {
  GLOBAL_CAP_FLAG, classifyIntervention, consolidateBriefing, unsolicitedWindow,
} from "@/lib/assessor/proactive/intervention-policy";

const sends: Array<{ channel: string; to: string; text: string }> = [];
let failNextSend = false;
vi.mock("@/lib/assessor/channels.server", () => ({
  sendReplyForChannel: async (channel: string, to: string, text: string) => {
    if (failNextSend) { failNextSend = false; return { ok: false }; }
    sends.push({ channel, to, text });
    return { ok: true };
  },
}));
vi.mock("@/lib/assessor/primary-channel.server", () => ({
  resolveOutboundTarget: async (_sb: any, uid: string) => ({ channel: "whatsapp", externalId: `wa-${uid}` }),
}));
vi.mock("@/lib/assessor/supreme/briefing.server", async (orig) => ({
  ...(await orig<any>()),
  resolveBriefingAtDispatch: async () => ({ send: true, text: "Bom dia. Hoje tens a visita ao T2 às 11h." }),
}));

import { dispatchPendingNudges } from "@/lib/assessor/v3/proactivity.server";
import { gateDirectProactive, releaseUnsolicited } from "@/lib/assessor/proactive/intervention-gate.server";

const U = "11111111-1111-4111-8111-111111111111";
// Segunda 16/11/2026, 10:00 em Lisboa (UTC+0 no inverno).
const NOW = new Date("2026-11-16T10:00:00Z");
const nudge = (id: string, kind: string, dedupe: string, priority: number | null = null) => ({
  id, user_id: U, kind, priority, status: "pending", suggested_reply: `texto ${id}`,
  subject_type: null, subject_id: null, dedupe_key: dedupe,
  scheduled_for: "2026-11-16T09:00:00Z", created_at: "2026-11-16T09:00:00Z",
});
const BRIEF = nudge("brief", "consultant_silence", "supreme_daily_briefing:20261116");
const OPP = nudge("opp", "opportunity_match", "opportunity:match_lead_imovel:l1:p1:20261116", 75);
const LATE = nudge("late", "followup_overdue", "followup_overdue:f1:20261116");

function seed(prefs: Record<string, any> = {}, nudges: any[] = [BRIEF, OPP, LATE]) {
  return createFakeDb({
    feature_flag_users: [{ user_id: U, flag_key: "assessor.engine.v3" }],
    consultant_preferences: [{ user_id: U, quiet_hours_start: "22:00", quiet_hours_end: "07:30", explicit_opt_ins: [], ...prefs }],
    assessor_nudges: nudges.map((n) => ({ ...n })),
  });
}
const byId = (db: any) => Object.fromEntries(db.tables.assessor_nudges.map((n: any) => [n.id, n]));

beforeEach(() => {
  sends.length = 0;
  failNextSend = false;
  __resetAccountFlagsForTests();
  __setAccountFlagForTests(GLOBAL_CAP_FLAG, U, true);
});

describe("classificação (pura)", () => {
  it("lembretes e rotinas pedidos nunca contam; serviço fica fora; aviso de teto deixa de existir", () => {
    expect(classifyIntervention({ type: "reminder" }, [])).toBe("requested");
    expect(classifyIntervention({ type: "nudge", dedupe_key: "routine:r1:2026-11-16", kind: "routine_digest" }, [])).toBe("requested");
    expect(classifyIntervention({ type: "retention" }, [])).toBe("service");
    expect(classifyIntervention({ type: "nudge", dedupe_key: "supreme_cap_notice:20261116" }, [])).toBe("retired");
  });
  it("ligado por defeito não é ativação explícita; ligado pelo consultor é", () => {
    expect(classifyIntervention({ type: "nudge", dedupe_key: "supreme_daily_briefing:20261116" }, [])).toBe("unsolicited");
    expect(classifyIntervention({ type: "nudge", dedupe_key: "supreme_daily_briefing:20261116" }, ["morning_briefing"])).toBe("activated");
    expect(classifyIntervention({ type: "nudge", dedupe_key: "supreme_evening_review:20261116" }, ["evening_review"])).toBe("activated");
    expect(classifyIntervention({ type: "push_morning" }, ["push"])).toBe("activated");
    expect(classifyIntervention({ type: "meeting_briefing" }, ["push"])).toBe("unsolicited");
    expect(classifyIntervention({ type: "nudge", dedupe_key: "supreme_pre_event:f1" }, ["push"])).toBe("unsolicited");
  });
  it("janela: domingo nunca, sábado só até às 13h, dias úteis 9h–20h, e nunca no silêncio", () => {
    expect(unsolicitedWindow(new Date("2026-11-15T10:00:00Z"))).toEqual({ ok: false, reason: "sunday" });
    expect(unsolicitedWindow(new Date("2026-11-14T13:30:00Z"))).toEqual({ ok: false, reason: "outside_hours" });
    expect(unsolicitedWindow(new Date("2026-11-16T08:30:00Z"))).toEqual({ ok: false, reason: "outside_hours" });
    expect(unsolicitedWindow(NOW, { start: "09:30", end: "12:00" })).toEqual({ ok: false, reason: "quiet_hours" });
    expect(unsolicitedWindow(NOW)).toEqual({ ok: true });
  });
  it("consolidação: o briefing leva a oportunidade dentro", () => {
    expect(consolidateBriefing("Bom dia.", "Há um imóvel que encaixa.")).toBe("Bom dia.\n\nOportunidade do dia: Há um imóvel que encaixa.");
  });
});

describe("envio de avisos com a política ligada", () => {
  it("briefing não ativado + oportunidade + atraso → UMA só mensagem: briefing com a oportunidade dentro", async () => {
    const db = seed();
    const r = await dispatchPendingNudges(db as any, { now: NOW });
    expect(r.sent).toBe(1);
    expect(sends).toHaveLength(1);
    expect(sends[0].text).toContain("Bom dia. Hoje tens a visita");
    expect(sends[0].text).toContain("Oportunidade do dia: texto opp");
    const n = byId(db);
    expect([n.opp.status, n.opp.outcome]).toEqual(["sent", "consolidated_in_briefing"]);
    expect([n.late.status, n.late.outcome]).toEqual(["dismissed", "daily_cap"]);
    expect(db.tables.proactive_daily_ledger).toHaveLength(1);
  });

  it("briefing ativado explicitamente sai à parte e a oportunidade usa a vaga do dia (2 mensagens, 1 não solicitada)", async () => {
    const db = seed({ explicit_opt_ins: ["morning_briefing"] });
    await dispatchPendingNudges(db as any, { now: NOW });
    expect(sends.map((s) => s.text)).toEqual(["Bom dia. Hoje tens a visita ao T2 às 11h.", "texto opp"]);
    expect(db.tables.proactive_daily_ledger).toHaveLength(1);
  });

  it("o aviso de 'teto atingido' nunca sai", async () => {
    const db = seed({}, [nudge("cap", "consultant_silence", "supreme_cap_notice:20261116")]);
    await dispatchPendingNudges(db as any, { now: NOW });
    expect(sends).toEqual([]);
    expect(byId(db).cap.outcome).toBe("retired_cap_notice");
  });

  it("a vaga já gasta por outro módulo (preparação de reunião) cala os avisos", async () => {
    const db = seed({}, [OPP]);
    const g = await gateDirectProactive(db, { userId: U, source: { type: "meeting_briefing" }, refKey: "meeting_briefing:e1", now: NOW });
    expect(g.allow).toBe(true);
    await dispatchPendingNudges(db as any, { now: NOW });
    expect(sends).toEqual([]);
    expect([byId(db).opp.status, byId(db).opp.outcome]).toEqual(["dismissed", "daily_cap"]);
  });

  it("rotina pedida pelo consultor sai mesmo com a vaga gasta; não solicitados no silêncio esperam", async () => {
    const routine = nudge("rot", "routine_digest", "routine:r1:2026-11-16");
    const db = seed({ quiet_hours_start: "09:30", quiet_hours_end: "12:00" }, [OPP, routine]);
    await dispatchPendingNudges(db as any, { now: NOW });
    expect(sends.map((s) => s.text)).toEqual(["texto rot"]);
    expect(byId(db).opp.status).toBe("pending");
  });

  it("idempotência: segundo ciclo do mesmo dia não manda mais nada não solicitado", async () => {
    const db = seed({}, [OPP]);
    await dispatchPendingNudges(db as any, { now: NOW });
    db.tables.assessor_nudges.push({ ...LATE });
    sends.length = 0;
    await dispatchPendingNudges(db as any, { now: new Date("2026-11-16T15:00:00Z") });
    expect(sends).toEqual([]);
  });

  it("envio falhado devolve a vaga (o dia não se perde por um erro de rede)", async () => {
    const db = seed({}, [OPP]);
    failNextSend = true;
    await dispatchPendingNudges(db as any, { now: NOW });
    expect(db.tables.proactive_daily_ledger ?? []).toHaveLength(0);
    expect(byId(db).opp.status).toBe("pending");
  });

  it("interruptor desligado: comportamento da Fase 1 (o briefing agendado não conta)", async () => {
    __setAccountFlagForTests(GLOBAL_CAP_FLAG, U, false);
    const db = seed();
    await dispatchPendingNudges(db as any, { now: NOW });
    expect(sends.map((s) => s.text)).toEqual(["Bom dia. Hoje tens a visita ao T2 às 11h.", "texto opp"]);
    expect(db.tables.proactive_daily_ledger ?? []).toHaveLength(0);
  });
});

describe("emissores diretos", () => {
  it("preparação de reunião e guia de objeções disputam a mesma vaga; retry da mesma é idempotente", async () => {
    const db = seed({}, []);
    const a = await gateDirectProactive(db, { userId: U, source: { type: "meeting_briefing" }, refKey: "meeting_briefing:e1", now: NOW });
    const again = await gateDirectProactive(db, { userId: U, source: { type: "meeting_briefing" }, refKey: "meeting_briefing:e1", now: NOW });
    const b = await gateDirectProactive(db, { userId: U, source: { type: "objection_guide" }, refKey: "objection_guide:e2", now: NOW });
    expect(a.allow).toBe(true);
    expect(again.allow).toBe(true);
    expect(b).toMatchObject({ allow: false, reason: "daily_cap" });
    await releaseUnsolicited(db, { userId: U, now: NOW, refKey: "meeting_briefing:e1" });
    const c = await gateDirectProactive(db, { userId: U, source: { type: "objection_guide" }, refKey: "objection_guide:e2", now: NOW });
    expect(c.allow).toBe(true);
  });

  it("push da manhã ativado pelo consultor sai sem gastar a vaga; ao domingo um não solicitado nunca sai", async () => {
    const db = seed({ explicit_opt_ins: ["push"] }, []);
    const p = await gateDirectProactive(db, { userId: U, source: { type: "push_morning" }, refKey: "push_morning:2026-11-16", now: NOW });
    expect(p).toMatchObject({ allow: true, cls: "activated", reserved: false });
    const sun = await gateDirectProactive(db, { userId: U, source: { type: "meeting_briefing" }, refKey: "m:x", now: new Date("2026-11-15T10:00:00Z") });
    expect(sun).toMatchObject({ allow: false, reason: "sunday" });
  });

  it("interruptor desligado: emissores diretos como antes", async () => {
    __setAccountFlagForTests(GLOBAL_CAP_FLAG, U, false);
    const db = seed({}, []);
    for (let i = 0; i < 3; i++) {
      const g = await gateDirectProactive(db, { userId: U, source: { type: "meeting_briefing" }, refKey: `m:${i}`, now: NOW });
      expect(g.allow).toBe(true);
    }
  });

  it("dois emissores em simultâneo nunca gastam duas vagas", async () => {
    const db = seed({}, []);
    const rs = await Promise.all([
      gateDirectProactive(db, { userId: U, source: { type: "meeting_briefing" }, refKey: "m:1", now: NOW }),
      gateDirectProactive(db, { userId: U, source: { type: "objection_guide" }, refKey: "o:1", now: NOW }),
    ]);
    expect(rs.filter((r) => r.allow)).toHaveLength(1);
  });
});
