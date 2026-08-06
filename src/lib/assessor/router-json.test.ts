import { describe, it, expect } from "vitest";
import { parseRouterJson } from "./router.server";

describe("parseRouterJson", () => {
  it("lê JSON normal", () => {
    expect(parseRouterJson('{"intent":"create_event"}')).toEqual({ intent: "create_event" });
  });

  it("lê JSON dentro de texto", () => {
    expect(parseRouterJson('Claro:\n```json\n{"intent":"none"}\n```')).toEqual({ intent: "none" });
  });

  it("repara resposta cortada a meio de um objeto", () => {
    const raw = '{"intent":"create_event","entities":{"title":"Visita ao Paulo","when":"amanhã"';
    expect(parseRouterJson(raw)).toEqual({
      intent: "create_event",
      entities: { title: "Visita ao Paulo", when: "amanhã" },
    });
  });

  it("repara resposta cortada a meio de uma string", () => {
    const raw = '{"intent":"create_event","reply":"Marquei a visita ao Pau';
    expect(parseRouterJson(raw)).toEqual({ intent: "create_event", reply: "Marquei a visita ao Pau" });
  });

  it("devolve null quando não há JSON nenhum", () => {
    expect(parseRouterJson("desculpa, não consigo")).toBeNull();
  });
});
