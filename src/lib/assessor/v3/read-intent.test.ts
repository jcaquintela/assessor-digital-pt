import { describe, it, expect } from "vitest";
import { detectReadRequest } from "./read-intent";

describe("read-intent", () => {
  it("pedido de leitura pura nunca é escrita", () => {
    const r = detectReadRequest("Entretanto lista aqui os contactos todos que tens meus");
    expect(r.pure).toBe(true);
    expect(r.tool).toBe("search_people");
  });

  it("reconhece 'Que pessoas tenho guardadas?'", () => {
    const r = detectReadRequest("Que pessoas tenho guardadas?");
    expect(r.pure).toBe(true);
    expect(r.tool).toBe("search_people");
  });

  it("reconhece imóveis e agenda", () => {
    expect(detectReadRequest("mostra-me os imóveis").tool).toBe("search_properties");
    expect(detectReadRequest("Quais são os compromissos que tenho?").tool).toBe("search_agenda");
  });

  it("documentos é leitura sem ferramenta directa", () => {
    const r = detectReadRequest("lista os documentos");
    expect(r.pure).toBe(true);
    expect(r.topic).toBe("documents");
  });

  it("frases de escrita não são leitura", () => {
    expect(detectReadRequest("Marca visita amanhã às 15h").pure).toBe(false);
    expect(detectReadRequest("Regista a placa 912 333 411").pure).toBe(false);
    expect(detectReadRequest("Guarda isto para depois").pure).toBe(false);
  });
});
