// Golden — "Que mais?" isolado, sem período nem tópico.
//
// Caso real: leitura de agenda (ou pessoas) seguida de "Que mais?". A frase
// não nomeia assunto nem período, por isso não casava em nenhum padrão
// elíptico e caía no caminho de escrita — acabava registada em Diversos.
// Agora resolve-se contra a última leitura guardada.

import { describe, it, expect } from "vitest";
import { resolveEllipticRead } from "./elliptic-read";

const fresh = (tool: string, args: Record<string, unknown> = {}) => ({
  tool,
  args,
  axis: tool === "search_agenda" ? "time" : "none",
  at: new Date().toISOString(),
});

describe("Golden — 'Que mais?' continua a última leitura", () => {
  it("depois de ler a agenda de amanhã, repete a agenda de amanhã", () => {
    const r = resolveEllipticRead("Que mais?", fresh("search_agenda", { period: "tomorrow" }));
    expect(r).toEqual({ tool: "search_agenda", arguments: { period: "tomorrow" } });
  });

  it("depois de listar pessoas, continua em pessoas — nunca em Diversos", () => {
    const r = resolveEllipticRead("Que mais?", fresh("search_people", { query: "" }));
    expect(r?.tool).toBe("search_people");
  });

  it("aceita as variantes equivalentes", () => {
    for (const frase of [
      "E mais?",
      "Mais alguma coisa?",
      "que mais",
      "mais alguma coisa",
      "Há mais alguma coisa?",
      "E mais alguma coisa?",
    ]) {
      expect(resolveEllipticRead(frase, fresh("search_agenda", { period: "today" }))?.tool).toBe(
        "search_agenda",
      );
    }
  });

  it("não inventa leitura sem leitura recente", () => {
    const stale = { ...fresh("search_agenda"), at: new Date(Date.now() - 60 * 60_000).toISOString() };
    expect(resolveEllipticRead("Que mais?", stale)).toBeNull();
    expect(resolveEllipticRead("Que mais?", null)).toBeNull();
  });

  it("não engole frases que só contêm a palavra 'mais'", () => {
    const st = fresh("search_agenda", { period: "today" });
    expect(resolveEllipticRead("marca mais uma visita com o Manuel amanhã", st)).toBeNull();
    expect(resolveEllipticRead("preciso de mais tempo", st)).toBeNull();
    expect(resolveEllipticRead("E depois?", st)).toBeNull();
  });
});
