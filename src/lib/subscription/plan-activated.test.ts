import { describe, expect, it, vi, beforeEach } from "vitest";
import { planTrialStartText } from "@/lib/assessor/proactive/templates";

const sendText = vi.fn(async () => ({ ok: true }));
const sendPayload = vi.fn(async () => ({ ok: true }));

vi.mock("@/lib/assessor/primary-channel.server", () => ({
  resolveOutboundTarget: async () => ({ channel: "whatsapp", externalId: "351900000000" }),
}));
vi.mock("@/lib/assessor/proactive/push.server", () => ({ isWithin24hWindow: async () => true }));
vi.mock("@/lib/whatsapp/send.server", () => ({
  sendWhatsAppText: (...a: any[]) => sendText(...(a as [])),
  sendWhatsAppPayload: (...a: any[]) => sendPayload(...(a as [])),
}));
vi.mock("@/lib/whatsapp/template-status.server", () => ({ isTemplateApproved: async () => true }));

function fakeDb(trialStatus: string | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { name: "Júlio Quintela", trial_status: trialStatus } }) }),
      }),
    }),
  };
}

describe("aviso de plano ativado", () => {
  beforeEach(() => { sendText.mockClear(); sendPayload.mockClear(); });

  it("subida para Consultor com WhatsApp envia a mensagem do trial, sem duplicar", async () => {
    const { notifyPlanActivated } = await import("./plan-activated.server");
    const r = await notifyPlanActivated(fakeDb(null), "u1", "consultor");
    expect(r.sent).toBe(true);
    expect(sendText).toHaveBeenCalledTimes(1);
    const body = (sendText.mock.calls[0] as any[])[1] as string;
    expect(body).toBe(planTrialStartText("Consultor"));
    expect(body).not.toMatch(/já está ativo\. Já podes usar/);
    expect(body).not.toMatch(/assistente de IA/i);
  });

  it("código promocional mantém a mensagem antiga", async () => {
    const { notifyPlanActivated } = await import("./plan-activated.server");
    await notifyPlanActivated(fakeDb(null), "u1", "consultor", { source: "promo" });
    const body = (sendText.mock.calls[0] as any[])[1] as string;
    expect(body).toMatch(/O teu plano Consultor já está ativo/);
  });

  it("quem já teve trial não recebe a mensagem do trial", async () => {
    const { notifyPlanActivated } = await import("./plan-activated.server");
    await notifyPlanActivated(fakeDb("expired"), "u1", "pro");
    const body = (sendText.mock.calls[0] as any[])[1] as string;
    expect(body).not.toMatch(/14 dias grátis/);
  });
});
