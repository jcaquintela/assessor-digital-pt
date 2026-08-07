import { describe, expect, it } from "vitest";
import { isCalendarAuthError, needsReconnect } from "./auth-error";

describe("ligação de calendário expirada ou revogada", () => {
  it("401 e 403 pedem nova autorização", () => {
    expect(isCalendarAuthError(401, "")).toBe(true);
    expect(isCalendarAuthError(403, "")).toBe(true);
  });

  it("mensagens típicas do Google também contam", () => {
    expect(isCalendarAuthError(400, '{"error":"invalid_grant"}')).toBe(true);
    expect(isCalendarAuthError(404, "Credentials not found")).toBe(true);
  });

  it("falhas normais não pedem nova autorização", () => {
    expect(isCalendarAuthError(500, "internal error")).toBe(false);
    expect(isCalendarAuthError(410, "sync token expired")).toBe(false);
  });

  it("lê o estado guardado da sincronização", () => {
    expect(needsReconnect("401: missing token")).toBe(true);
    expect(needsReconnect("400: invalid_grant")).toBe(true);
    expect(needsReconnect("500: boom")).toBe(false);
    expect(needsReconnect(null)).toBe(false);
  });
});