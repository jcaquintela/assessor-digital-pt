import { describe, it, expect } from "vitest";
import {
  buildProspectingScript, formatScriptReply, isOwnerSaleLead, readScriptChoice, SCRIPT_OFFER_QUESTION,
} from "./script-draft";

describe("oferta de guião (placa → lead)", () => {
  it("só vale para vende o próprio", () => {
    expect(isOwnerSaleLead("owner_sale")).toBe(true);
    expect(isOwnerSaleLead("other_agency")).toBe(false);
    expect(isOwnerSaleLead(null)).toBe(false);
  });

  it("um 'sim' solto não escolhe guião (é do lembrete)", () => {
    expect(readScriptChoice("sim")).toBe("none");
    expect(readScriptChoice("chamada")).toBe("chamada");
    expect(readScriptChoice("mensagem")).toBe("mensagem");
    expect(readScriptChoice("quero um guião")).toBe("chamada");
    expect(readScriptChoice("não quero guião")).toBe("refuse");
  });

  it("a pergunta é objetiva e sem jargão", () => {
    expect(SCRIPT_OFFER_QUESTION).toMatch(/guião/i);
    expect(SCRIPT_OFFER_QUESTION).not.toMatch(/intent|payload|tool/i);
  });

  it("guião de chamada usa o imóvel e trata a comissão sem defensiva", () => {
    const s = buildProspectingScript("chamada", { location: "Almada", typology: "T3", propertyType: "apartamento", consultantName: "Júlio" });
    expect(s).toContain("T3 apartamento em Almada");
    expect(s).toContain("Júlio");
    expect(s.toLowerCase()).toContain("comissão");
  });

  it("mensagem fica curta e sem promessas de eficácia", () => {
    const s = buildProspectingScript("mensagem", {});
    expect(s.length).toBeLessThan(700);
    expect(s.toLowerCase()).not.toMatch(/convers[ãa]o|comprovad|estat[íi]stic/);
  });

  it("o rascunho diz que não é enviado automaticamente", () => {
    expect(formatScriptReply("mensagem", "x").toLowerCase()).toContain("não envio nada por ti");
  });
});
