import { describe, expect, it, vi } from "vitest";
import {
  TEMPLATE_PANEL_HINT,
  TEMPLATE_TRUNCATION_NOTE,
  briefingTemplateParams,
  type BriefingEvent,
  type BriefingPart,
} from "./meeting-briefing";
import { deliverBriefingFallback } from "./meeting-briefing.server";

const ev = (title: string): BriefingEvent =>
  ({
    id: title,
    title,
    type: "visita",
    status: "pending",
    due_date: new Date("2026-08-30T10:00:00Z").toISOString(),
    due_time: null,
  }) as any;

describe("briefing — fallback imediato", () => {
  it("1) dois compromissos próximos: {{2}} menciona ambos", () => {
    const companions: BriefingPart[] = [
      { event: ev("reunião com João Pires"), brief: null },
    ];
    const params = briefingTemplateParams(
      ev("visita ao T3 da Boavista"),
      { name: "Ana Silva", properties: [], followUps: [], notes: [] } as any,
      "Júlio",
      null,
      null,
      companions,
    );
    expect(params).toHaveLength(3);
    expect(params[1]).toContain("visita ao T3 da Boavista");
    expect(params[1]).toContain("Ana Silva");
    expect(params[1]).toContain("e mais 1 logo a seguir");
    expect(params[1]).toContain("reunião com João Pires");
  });

  it("2) conteúdo acima de 900 caracteres: corte com aviso explícito", () => {
    const long = "detalhe importante ".repeat(120);
    const params = briefingTemplateParams(
      ev("visita"),
      { name: "Ana", properties: [], followUps: [], notes: [long] } as any,
      "Júlio",
      { deal: { label: long, stage: null } } as any,
      { deadlines: [long] } as any,
    );
    expect(params[2]!.length).toBeLessThanOrEqual(900);
    expect(params[2]).toContain(TEMPLATE_TRUNCATION_NOTE);
    expect(params[2]).toContain(TEMPLATE_PANEL_HINT);
  });

  it("3) sem template + Telegram ligado: entrega por Telegram", async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { phone: null, whatsapp_link_status: null } }),
        insert: vi.fn().mockResolvedValue({ error: null }),
        then: undefined,
      })),
    } as any;
    // channel_links devolve telegram
    supabase.from = vi.fn((table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { phone: null, whatsapp_link_status: null } }) }) }),
        };
      }
      if (table === "channel_links") {
        return { select: () => ({ eq: async () => ({ data: [{ channel: "telegram", external_id: "555" }] }) }) };
      }
      return { insert: async () => ({ error: null }) };
    });

    const sent: any[] = [];
    vi.doMock("@/lib/assessor/channels.server", () => ({
      sendReplyForChannel: async (channel: string, id: string, text: string) => {
        sent.push({ channel, id, text });
        return { ok: true };
      },
    }));

    const r = await deliverBriefingFallback(supabase, "u1", "cartela");
    expect(r.delivered).toBe(true);
    expect(r.via).toBe("telegram");
    expect(sent[0]).toMatchObject({ channel: "telegram", id: "555" });
    vi.doUnmock("@/lib/assessor/channels.server");
  });

  it("4) sem template e sem Telegram: regista em admin_audit_logs", async () => {
    const inserts: any[] = [];
    const supabase = {
      from: (table: string) => {
        if (table === "profiles") {
          return {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { phone: null, whatsapp_link_status: null } }) }) }),
          };
        }
        if (table === "channel_links") {
          return { select: () => ({ eq: async () => ({ data: [] }) }) };
        }
        return {
          insert: async (row: any) => {
            inserts.push({ table, row });
            return { error: null };
          },
        };
      },
    } as any;

    const r = await deliverBriefingFallback(supabase, "u2", "cartela");
    expect(r.delivered).toBe(false);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe("admin_audit_logs");
    expect(inserts[0].row.action).toBe("briefing.template_unavailable");
    expect(inserts[0].row.target_user_id).toBe("u2");
  });
});
