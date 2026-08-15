import { describe, expect, it } from "vitest";
import { canUseEmailModule, EMAIL_PLAN_REQUIRED_REPLY } from "@/lib/subscription/email-gate";
import { formatQueryResults } from "@/lib/assessor/v3/query-results";
import { resolveActiveProvider } from "@/lib/providers/active";

describe("gate do módulo de Email (plano Pro)", () => {
  it("1) consultor não-Pro que chama o servidor directamente fica bloqueado (não é só UI escondida)", () => {
    for (const t of ["base", "consultor", null, undefined, "lixo"]) {
      expect(canUseEmailModule(t as string | null)).toBe(false);
    }
    // A ferramenta de conversa devolve plano em falta, não emails.
    const out = formatQueryResults([
      { name: "search_emails", ok: true, data: { plan_required: true, items: [] } } as any,
    ])!;
    expect(out).toContain(EMAIL_PLAN_REQUIRED_REPLY);
  });

  it("2) Pro em past_due mantém o email a funcionar", () => {
    expect(canUseEmailModule("pro", "past_due")).toBe(true);
    expect(canUseEmailModule("pro", "active")).toBe(true);
    expect(canUseEmailModule("hub", "past_due")).toBe(true);
  });

  it("3) combinação cruzada: Outlook no calendário + Gmail no email funcionam sem conflito", () => {
    const cal = resolveActiveProvider(["microsoft_outlook"], null);
    const mail = resolveActiveProvider(["gmail"], null);
    expect(cal).toMatchObject({ status: "ok", provider: "microsoft_outlook" });
    expect(mail).toMatchObject({ status: "ok", provider: "gmail" });
    // A regra é "um por modalidade", não "uma ligação única".
    expect(cal.provider).not.toBe(mail.provider);
  });

  it("4) conta com dois calendários ligados: o seletor resolve sem desligar nada", () => {
    const antes = resolveActiveProvider(["google_calendar", "microsoft_outlook"], null);
    expect(antes.status).toBe("needs_choice");
    const depois = resolveActiveProvider(["google_calendar", "microsoft_outlook"], "google_calendar");
    expect(depois).toMatchObject({ status: "ok", provider: "google_calendar" });
    // As duas ligações continuam disponíveis — escolher não apaga dados.
    expect(depois.options).toEqual(["google_calendar", "microsoft_outlook"]);
  });
});
