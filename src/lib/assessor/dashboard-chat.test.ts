import { describe, it, expect } from "vitest";
import { tierAtLeast } from "@/lib/subscription/tiers";
import { buildDashboardInbound, dashboardAdapter } from "./channel-gateway/dashboard-adapter";

const MIN = "pro" as const;

describe("escrita no painel", () => {
  it("só Pro e Team escrevem; Base e Consultor ficam em só-leitura", () => {
    expect(tierAtLeast("base", MIN)).toBe(false);
    expect(tierAtLeast("consultor", MIN)).toBe(false);
    expect(tierAtLeast("pro", MIN)).toBe(true);
    expect(tierAtLeast("hub", MIN)).toBe(true);
    expect(tierAtLeast(null, MIN)).toBe(false);
  });

  it("o inbound do painel é um canal próprio, ligado ao consultor autenticado", () => {
    const i = buildDashboardInbound({ userId: "u1", text: "placa em Lisboa", messageId: "m1" });
    expect(i.channel).toBe("dashboard");
    expect(i.externalConversationId).toBe("u1");
    expect(i.messageType).toBe("text");
    expect(dashboardAdapter.channel).toBe("dashboard");
  });

  it("o painel não tem transporte externo — a resposta é a linha no histórico", async () => {
    const r = await dashboardAdapter.sendText("u1", "olá");
    expect(r.ok).toBe(true);
    expect(r.messageId).toBeNull();
    expect(dashboardAdapter.sendInteractive).toBeUndefined();
  });
});
