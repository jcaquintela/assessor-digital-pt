// Goldens do módulo de Email (Gmail).
// Caso real a evitar: adivinhar a pessoa pelo nome quando o endereço de email
// já a identifica sem margem de dúvida.

import { describe, it, expect } from "vitest";
import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";
import { resolveSenderPerson } from "./resolve-sender.server";
import { parseFromHeader, normalizeEmail } from "./sender";
import { isSummaryRequest, AUTO_SUMMARIZE_ON_ARRIVAL } from "./summary";
import { shouldWarnReauth, isExpired, isAuthError, reauthWarningMessage } from "./reauth";
import { confirmAndSendDraft, buildRawEmail } from "./gmail.server";

const USER = "user-1";

function ctxWith(people: any[]) {
  return { supabase: makeFakeSupabase({ people, pending_actions: [] }), userId: USER };
}

describe("remetente conhecido liga por email", () => {
  it("liga sem passar por resolução de nome", async () => {
    const ctx = ctxWith([
      { id: "p1", user_id: USER, name: "Ana Silva", email: "Ana.Silva@Zome.pt", email_normalized: "ana.silva@zome.pt" },
      { id: "p2", user_id: USER, name: "Ana Costa", email_normalized: "ana.costa@x.pt" },
    ]);
    const res = await resolveSenderPerson(ctx as any, {
      from: "Ana <ana.silva@zome.pt>",
      subject: "Proposta T2",
    });
    expect(res.status).toBe("linked");
    expect(res.matchedBy).toBe("email");
    expect(res.personId).toBe("p1");
  });

  it("normaliza maiúsculas e espaços do cabeçalho", () => {
    expect(parseFromHeader('"Ana Silva" <ANA.Silva@Zome.pt>')).toEqual({
      email: "ana.silva@zome.pt",
      name: "Ana Silva",
    });
    expect(normalizeEmail("  X@Y.PT ")).toBe("x@y.pt");
  });
});

describe("remetente desconhecido cai na resolução por nome", () => {
  it("nome parcial pede confirmação, nunca liga sozinho", async () => {
    const ctx = ctxWith([
      { id: "p1", user_id: USER, name: "Ana Silva", email_normalized: "ana.silva@zome.pt" },
    ]);
    const res = await resolveSenderPerson(ctx as any, {
      from: "Silva <outro@dominio.pt>",
      subject: "Visita",
    });
    expect(res.matchedBy).toBe("name");
    expect(res.status).not.toBe("linked");
    expect(["confirm_partial", "choose", "confirm_exact", "new"]).toContain(res.status);
  });

  it("sem nome nem correspondência, não inventa pessoa", async () => {
    const ctx = ctxWith([]);
    const res = await resolveSenderPerson(ctx as any, { from: "noreply@portal.pt" });
    expect(res.personId).toBeNull();
    expect(res.matchedBy).toBe("none");
  });
});

describe("sumarização só a pedido", () => {
  it("nunca resume automaticamente à chegada", () => {
    expect(AUTO_SUMMARIZE_ON_ARRIVAL).toBe(false);
  });
  it("reconhece pedidos explícitos", () => {
    expect(isSummaryRequest("resume-me esse email")).toBe(true);
    expect(isSummaryRequest("do que fala o email da Ana?")).toBe(true);
    expect(isSummaryRequest("Chegou email da Ana")).toBe(false);
    expect(isSummaryRequest("")).toBe(false);
  });
});

describe("rascunho nunca envia sem confirmação", () => {
  it("bloqueia envio não confirmado", async () => {
    await expect(confirmAndSendDraft("k", "d1", false)).rejects.toThrow(/não confirmado/i);
  });
  it("constrói o corpo RFC 2822 em base64url", () => {
    const raw = buildRawEmail(["a@b.pt"], "Olá", "Corpo");
    expect(raw).not.toContain("+");
    expect(Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()).toContain("To: a@b.pt");
  });
});

describe("token em modo Teste avisa antes de falhar", () => {
  const now = new Date("2026-08-15T12:00:00Z");
  it("avisa a menos de 24h do fim", () => {
    const conn = { connected_at: "2026-08-09T06:00:00Z" }; // expira 16/08 06:00
    expect(shouldWarnReauth(conn, now)).toBe(true);
    expect(reauthWarningMessage(18)).toMatch(/expira dentro de/);
  });
  it("não repete o aviso no mesmo dia", () => {
    const conn = { connected_at: "2026-08-09T06:00:00Z", reauth_warned_at: "2026-08-15T08:00:00Z" };
    expect(shouldWarnReauth(conn, now)).toBe(false);
  });
  it("detecta expirado e fala claro, sem falhar em silêncio", () => {
    const conn = { connected_at: "2026-08-01T06:00:00Z" };
    expect(isExpired(conn, now)).toBe(true);
    expect(reauthWarningMessage(null)).toMatch(/Perdi o acesso ao teu email/);
  });
  it("401 é autorização caducada; falta de scope não", () => {
    expect(isAuthError(401, "invalid_grant")).toBe(true);
    expect(isAuthError(403, "insufficient authentication scopes")).toBe(false);
    expect(isAuthError(500, "boom")).toBe(false);
  });
});