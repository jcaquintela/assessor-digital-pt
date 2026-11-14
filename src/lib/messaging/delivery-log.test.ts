import { describe, it, expect } from "vitest";
import {
  buildDeliveryEvent,
  extractMetaStatusError,
  providerTsToIso,
  redactProviderText,
} from "./delivery-log";

describe("redactProviderText", () => {
  it("remove telefones, chat ids, emails e tokens", () => {
    const out = redactProviderText(
      "Failed for +351 912 345 678 chat 123456789 joana@example.pt Bearer abc.def EAA" + "x".repeat(30),
    )!;
    expect(out).not.toMatch(/912|345|678|123456789/);
    expect(out).not.toContain("joana@example.pt");
    expect(out).not.toContain("abc.def");
    expect(out).not.toMatch(/EAAx/);
  });
  it("mantém códigos curtos como 131047", () => {
    // 6 dígitos são tratados como número potencialmente pessoal; códigos vão em campo próprio.
    expect(redactProviderText("Re-engagement message")).toBe("Re-engagement message");
    expect(redactProviderText("error 470")).toBe("error 470");
  });
  it("trunca a 200 caracteres e devolve null para vazio", () => {
    expect(redactProviderText("a".repeat(500))!.length).toBe(200);
    expect(redactProviderText("   ")).toBeNull();
    expect(redactProviderText(undefined)).toBeNull();
  });
});

describe("extractMetaStatusError", () => {
  it("lê code, subcode, title e details do primeiro erro", () => {
    const e = extractMetaStatusError({
      id: "wamid.X",
      status: "failed",
      errors: [{ code: 131047, title: "Re-engagement message", error_data: { details: "More than 24 hours have passed" } }],
    });
    expect(e).toEqual({
      code: 131047,
      subcode: null,
      title: "Re-engagement message",
      detail: "More than 24 hours have passed",
    });
  });
  it("devolve null sem errors[]", () => {
    expect(extractMetaStatusError({ id: "x", status: "failed" })).toBeNull();
  });
});

describe("buildDeliveryEvent", () => {
  it("não inclui campos de destinatário e distingue accepted de delivered", () => {
    const now = new Date("2026-11-14T10:00:00Z");
    const ev = buildDeliveryEvent({ channel: "whatsapp", stage: "accepted", provider_message_id: "wamid.1", now });
    expect(ev.stage).toBe("accepted");
    expect(ev.at).toBe("2026-11-14T10:00:00.000Z");
    expect(Object.keys(ev)).not.toContain("to");
    expect(JSON.stringify(ev)).not.toMatch(/phone|chat_id/);
  });
  it("converte o timestamp do fornecedor para UTC", () => {
    expect(providerTsToIso("1794668400")).toBe("2026-11-14T15:00:00.000Z");
    expect(providerTsToIso("x")).toBeNull();
  });
});
