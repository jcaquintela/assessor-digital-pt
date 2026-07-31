import { describe, it, expect } from "vitest";
import { formatForWhatsApp, boldWa } from "./whatsapp-format";

describe("formatForWhatsApp", () => {
  it("converte negrito markdown", () => {
    expect(formatForWhatsApp("Vi a **placa** do *932*")).toBe("Vi a *placa* do *932*");
  });
  it("remove monospace", () => {
    expect(formatForWhatsApp("```Casa 2```")).toBe("Casa 2");
    expect(formatForWhatsApp("o `código` é 4")).toBe("o código é 4");
  });
  it("normaliza bullets para hífen", () => {
    expect(formatForWhatsApp("Tens 2:\n• um\n* dois")).toBe("Tens 2:\n- um\n- dois");
  });
  it("bold helper limpa asteriscos internos", () => {
    expect(boldWa("*Ana*")).toBe("*Ana*");
  });
});
