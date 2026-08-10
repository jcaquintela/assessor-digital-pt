import { describe, it, expect } from "vitest";
import { announcesDirectThirdPartyContact, enforceNoDirectContact } from "./no-direct-contact";
import { sanitizeReply } from "./sanitize";

const BAD = [
  "Vou contactar o proprietário da Moradia na Alameda da República, Gaia para pedir a caderneta predial.",
  "Já liguei ao proprietário a pedir os documentos.",
  "Envio uma mensagem à proprietária hoje.",
  "Vou falar com o comprador sobre a proposta.",
  "Posso avisar o cliente da nova hora.",
];

const GOOD = [
  "Preparo-te uma mensagem para o proprietário a pedir a caderneta. Envias tu.",
  "Aqui está o rascunho para o comprador; envias tu.",
  "Queres que prepare uma mensagem para a proprietária?",
  "Marco a visita para amanhã às 10h?",
  "Vou buscar o histórico da Moradia.",
];

describe("guardrail: nunca anunciar contacto directo com terceiros", () => {
  it.each(BAD)("deteta anúncio de contacto directo: %s", (t) => {
    expect(announcesDirectThirdPartyContact(t)).toBe(true);
  });

  it.each(GOOD)("não marca linguagem correta: %s", (t) => {
    expect(announcesDirectThirdPartyContact(t)).toBe(false);
  });

  it.each(BAD)("golden: depois de sanitizar deixa de anunciar contacto: %s", (t) => {
    const out = sanitizeReply(t);
    expect(announcesDirectThirdPartyContact(out)).toBe(false);
    expect(out.toLowerCase()).toContain("envias tu");
  });

  it("mantém o contexto do pedido no rascunho", () => {
    const out = enforceNoDirectContact(BAD[0]!);
    expect(out).toContain("proprietário da Moradia na Alameda da República");
    expect(out).toContain("caderneta predial");
    expect(out.toLowerCase()).toContain("preparo-te uma mensagem");
  });

  it("não altera respostas já corretas", () => {
    for (const g of GOOD) expect(sanitizeReply(g)).toBe(g);
  });
});
