import { describe, it, expect } from "vitest";
import { classifyPhoneInput, formatPtPhone, normalizePhoneInput, PHONE_INVALID_MESSAGE } from "./phone-input";

describe("golden: número de telefone escrito à mão", () => {
  it("1) '932451222' sem espaços é aceite directamente", () => {
    const r = classifyPhoneInput("932451222");
    expect(r.valid).toBe(true);
    expect(r.e164).toBe("+351932451222");
    expect(r.message).toBeNull();
    expect(formatPtPhone("932451222")).toBe("932 451 222");
  });

  it("2) '932 451 222' com espaços mantém-se aceite", () => {
    expect(classifyPhoneInput("932 451 222").valid).toBe(true);
    expect(normalizePhoneInput("932-451.222")).toBe("932451222");
  });

  it("3) '+351932451222' é aceite", () => {
    const r = classifyPhoneInput("+351932451222");
    expect(r.valid).toBe(true);
    expect(r.e164).toBe("+351932451222");
    expect(classifyPhoneInput("00351 932 451 222").valid).toBe(true);
  });

  it("4) '12345' dá mensagem clara, não 'código não existe'", () => {
    const r = classifyPhoneInput("12345");
    expect(r.isPhoneAttempt).toBe(true);
    expect(r.valid).toBe(false);
    expect(r.message).toBe(PHONE_INVALID_MESSAGE);
  });

  it("texto normal não é tratado como tentativa de número", () => {
    expect(classifyPhoneInput("É o número do Manuel").isPhoneAttempt).toBe(false);
    expect(classifyPhoneInput("BETA-2026").isPhoneAttempt).toBe(false);
  });

  it("fixo 21 e 30 também são válidos", () => {
    expect(classifyPhoneInput("213456789").valid).toBe(true);
    expect(classifyPhoneInput("300 123 456").valid).toBe(true);
  });
});
