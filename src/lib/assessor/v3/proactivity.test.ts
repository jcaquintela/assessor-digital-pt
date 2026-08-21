import { describe, it, expect, vi } from "vitest";
import {
  DOCUMENT_NUDGE_MAX_ATTEMPTS,
  generateNudgesForUser,
  resolveLatestDocumentNudgeAnswer,
} from "./proactivity.server";
import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";

// Cada `from()` devolve um builder novo — há chamadas em paralelo (Promise.all).
function fakeSupabase(fixtures: Record<string, any[]>) {
  return {
    from(t: string) {
      const rows = fixtures[t] ?? [];
      let headCount = false;
      const b: any = {
        select(_s?: string, opts?: any) { headCount = !!(opts?.head && opts?.count === "exact"); return b; },
        eq() { return b; },
        is() { return b; },
        in() { return b; },
        not() { return b; },
        lt() { return b; },
        lte() { return b; },
        gte() { return b; },
        order() { return b; },
        limit() { return b; },
        maybeSingle() { return Promise.resolve({ data: rows[0] ?? null }); },
        then(res: any) { return res(headCount ? { count: rows.length } : { data: rows }); },
      };
      return b;
    },
  };
}

describe("proactivity — regras", () => {
  it("não gera nudges quando quota diária esgotada", async () => {
    const sup = fakeSupabase({
      assessor_nudges: new Array(3).fill({ id: "n" }),
    });
    const out = await generateNudgesForUser(sup as any, "u1", { maxPerDay: 3 });
    expect(out).toEqual([]);
  });

  it("gera nudge para follow-up vencido", async () => {
    const sup = fakeSupabase({
      assessor_nudges: [],
      opportunities: [],
      follow_ups: [{ id: "f1", title: "Ligar ao João", due_date: new Date(Date.now() - 5 * 864e5).toISOString(), status: "pending" }],
      properties: [],
      assessor_messages: [{ created_at: new Date().toISOString() }],
    });
    const out = await generateNudgesForUser(sup as any, "u1");
    expect(out.some((n) => n.kind === "followup_overdue")).toBe(true);
  });

  it("cada nudge tem dedupe_key único e resposta sanitizada", async () => {
    const sup = fakeSupabase({
      assessor_nudges: [],
      opportunities: [],
      follow_ups: [{ id: "f1", title: "Enviar CPU", due_date: new Date(Date.now() - 5 * 864e5).toISOString(), status: "pending" }],
      properties: [],
      assessor_messages: [{ created_at: new Date().toISOString() }],
    });
    const out = await generateNudgesForUser(sup as any, "u1");
    expect(out[0].dedupe_key).toMatch(/^followup_overdue:f1:/);
    expect(out[0].suggested_reply.toLowerCase()).not.toContain("payload");
  });

  it("não cria outro nudge documental enquanto existe um pendente", async () => {
    const sup = makeFakeSupabase({
      assessor_nudges: [{ id: "n1", user_id: "u1", kind: "property_missing_docs", subject_id: "p1", status: "pending", outcome: null, outcome_at: null }],
      opportunities: [], follow_ups: [],
      properties: [{ id: "p1", user_id: "u1", title: "Moradia", status: "active", created_at: "2025-01-01" }],
      uploaded_files: [], assessor_messages: [{ role: "user", created_at: new Date().toISOString() }],
    });
    expect(await generateNudgesForUser(sup as any, "u1")).toEqual([]);
  });

  it(`ao fim de ${DOCUMENT_NUDGE_MAX_ATTEMPTS} perguntas passa para Diversos e deixa de insistir`, async () => {
    const sup = makeFakeSupabase({
      assessor_nudges: [1, 2].map((n) => ({ id: `n${n}`, user_id: "u1", kind: "property_missing_docs", subject_id: "p1", status: "sent", outcome: null, outcome_at: null })),
      opportunities: [], follow_ups: [],
      properties: [{ id: "p1", user_id: "u1", title: "Moradia", status: "active", created_at: "2025-01-01" }],
      uploaded_files: [], miscellaneous_items: [], assessor_messages: [{ role: "user", created_at: new Date().toISOString() }],
    });
    expect(await generateNudgesForUser(sup as any, "u1")).toEqual([]);
    expect(sup.state.miscellaneous_items).toHaveLength(1);
    expect(sup.state.miscellaneous_items[0]).toMatchObject({ category: "Por tratar", status: "inbox" });
    expect(sup.state.assessor_nudges.every((n) => n.status === "dismissed")).toBe(true);
  });

  it("regista um não e fecha todas as repetições do mesmo imóvel", async () => {
    const question = 'Falta a caderneta no imóvel "Moradia". Peço ao proprietário?';
    const sup = makeFakeSupabase({
      assessor_nudges: [1, 2].map((n) => ({ id: `n${n}`, user_id: "u1", kind: "property_missing_docs", subject_id: "p1", status: "sent", suggested_reply: question, sent_at: `2026-08-0${n}T08:00:00Z`, outcome_at: null })),
    });
    const result = await resolveLatestDocumentNudgeAnswer(sup as any, {
      userId: "u1", channel: "whatsapp", answer: "no", lastAssistantContent: question,
    });
    expect(result.resolved).toBe(true);
    expect(sup.state.assessor_nudges.every((n) => n.status === "resolved" && n.outcome === "no")).toBe(true);
  });
});