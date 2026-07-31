import { describe, expect, it } from "vitest";
import { formatForTelegram } from "./telegram-format";

describe("formatForTelegram", () => {
  it("converte negrito e itálico universais para HTML", () => {
    expect(formatForTelegram("- *Casa 2* · *918 579 839* · _por contactar_")).toBe(
      "- <b>Casa 2</b> · <b>918 579 839</b> · <i>por contactar</i>",
    );
  });
  it("escapa caracteres HTML e não parte com pontos/hífenes", () => {
    expect(formatForTelegram("Preço <150.000 €> & taxas - ok")).toBe(
      "Preço &lt;150.000 €&gt; &amp; taxas - ok",
    );
  });
  it("remove monospace e normaliza listas", () => {
    expect(formatForTelegram("• um\n• dois\n```x```")).toBe("- um\n- dois\nx");
  });
});
