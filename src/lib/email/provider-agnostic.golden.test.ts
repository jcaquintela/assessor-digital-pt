import { describe, expect, it } from "vitest";
import {
  EMAIL_NOT_CONNECTED_REPLY,
  EMAIL_NEEDS_RECONNECT_REPLY,
  formatQueryResults,
} from "@/lib/assessor/v3/query-results";
import { expiryOf, isExpired } from "@/lib/email/gmail/reauth";

const r = (name: string, data: any) => [{ name, ok: true, data } as any];

describe("email agnóstico ao provedor", () => {
  it("sem provedor ligado, diz que falta ligar o email (nunca 'não tenho acesso')", () => {
    const out = formatQueryResults(r("search_emails", { not_connected: true, items: [] }))!;
    expect(out).toContain(EMAIL_NOT_CONNECTED_REPLY);
    expect(out.toLowerCase()).not.toContain("não tenho acesso");
    expect(out.toLowerCase()).not.toMatch(/gmail|outlook/);
  });

  it("resumo pedido sem provedor ligado dá a mesma orientação", () => {
    const out = formatQueryResults(r("summarize_email", { not_connected: true }))!;
    expect(out).toContain(EMAIL_NOT_CONNECTED_REPLY);
  });

  it("autorização expirada pede religação, sem nomear provedor", () => {
    const out = formatQueryResults(r("search_emails", { needs_reconnect: true, items: [] }))!;
    expect(out).toContain(EMAIL_NEEDS_RECONNECT_REPLY);
    expect(out.toLowerCase()).not.toMatch(/gmail|outlook/);
  });

  it("a regra dos 7 dias do modo Teste só se aplica ao Gmail", () => {
    const connected_at = new Date(Date.now() - 9 * 864e5).toISOString();
    expect(isExpired({ provider: "gmail", connected_at })).toBe(true);
    expect(expiryOf({ provider: "outlook", connected_at })).toBeNull();
    expect(isExpired({ provider: "outlook", connected_at })).toBe(false);
  });

  it("no Outlook, só uma expiração explícita conta", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(isExpired({ provider: "outlook", expires_at: past })).toBe(true);
  });
});
