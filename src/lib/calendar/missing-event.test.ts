import { describe, it, expect } from "vitest";
import { isExternalEventMissing } from "./missing-event";

describe("evento apagado no calendário externo", () => {
  it("Outlook: 404 quando o consultor apaga o evento", () => {
    expect(isExternalEventMissing(404, null, "ErrorItemNotFound")).toBe(true);
  });
  it("Google: 410 (gone)", () => {
    expect(isExternalEventMissing(410, null, "")).toBe(true);
  });
  it("Google: 200 mas status cancelled", () => {
    expect(isExternalEventMissing(200, { id: "x", status: "cancelled" })).toBe(true);
  });
  it("Outlook: 200 com isCancelled", () => {
    expect(isExternalEventMissing(200, { id: "x", isCancelled: true })).toBe(true);
  });
  it("evento vivo não é tocado", () => {
    expect(isExternalEventMissing(200, { id: "x", status: "confirmed" })).toBe(false);
  });
  it("falha de rede/servidor não conta como apagado", () => {
    expect(isExternalEventMissing(500, null, "boom")).toBe(false);
    expect(isExternalEventMissing(0, null, "not_connected")).toBe(false);
  });
});
