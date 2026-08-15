import { describe, expect, it } from "vitest";
import {
  resolveActiveProvider,
  CALENDAR_PROVIDER_CHOICE_REPLY,
  MAIL_PROVIDER_CHOICE_REPLY,
} from "@/lib/providers/active";
import { formatQueryResults, MAIL_PROVIDER_CHOICE_REPLY as REPLY } from "@/lib/assessor/v3/query-results";

const CAL = ["google_calendar", "microsoft_outlook"] as const;

describe("um provedor ativo por modalidade", () => {
  it("1) dois calendários ligados sem escolha: é preciso escolher antes de agir", () => {
    const r = resolveActiveProvider([...CAL], null);
    expect(r.status).toBe("needs_choice");
    expect(r.provider).toBeNull();
    expect(CALENDAR_PROVIDER_CHOICE_REPLY).toMatch(/Definições > Calendário/);
  });

  it("2) com ativo escolhido, só esse provedor recebe a escrita (sem fan-out)", () => {
    const r = resolveActiveProvider([...CAL], "microsoft_outlook");
    expect(r.status).toBe("ok");
    expect(r.provider).toBe("microsoft_outlook");
    // O destino da escrita é exatamente um.
    const targets = r.status === "ok" ? [r.provider] : [];
    expect(targets).toEqual(["microsoft_outlook"]);
  });

  it("3) dois emails ligados sem escolha: o Afonso pede escolha, nunca usa o Gmail em silêncio", () => {
    const r = resolveActiveProvider(["gmail", "outlook"], null);
    expect(r.status).toBe("needs_choice");
    const out = formatQueryResults([
      { name: "search_emails", ok: true, data: { needs_provider_choice: true, options: r.options, items: [] } } as any,
    ])!;
    expect(out).toContain(REPLY);
    expect(out).toBe(MAIL_PROVIDER_CHOICE_REPLY);
  });

  it("4) trocar o ativo reflete-se já na consulta seguinte", () => {
    expect(resolveActiveProvider(["gmail", "outlook"], "gmail").provider).toBe("gmail");
    expect(resolveActiveProvider(["gmail", "outlook"], "outlook").provider).toBe("outlook");
  });

  it("um só provedor ligado fica ativo sem perguntar nada", () => {
    expect(resolveActiveProvider(["gmail"], null)).toMatchObject({ status: "ok", provider: "gmail" });
    expect(resolveActiveProvider(["google_calendar"], null).status).toBe("ok");
  });

  it("escolha obsoleta (provedor desligado) não bloqueia: o que resta fica ativo", () => {
    expect(resolveActiveProvider(["outlook"], "gmail")).toMatchObject({ status: "ok", provider: "outlook" });
  });

  it("nenhum ligado devolve 'none' — orientação para ligar, não para escolher", () => {
    expect(resolveActiveProvider([], null).status).toBe("none");
  });
});
