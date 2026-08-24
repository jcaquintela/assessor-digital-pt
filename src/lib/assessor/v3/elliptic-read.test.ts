import { describe, expect, it } from "vitest";
import { LAST_READ_TTL_MS, axisForTool, resolveEllipticRead } from "./elliptic-read";

const NOW = new Date("2026-08-24T18:00:00Z").getTime();

function state(tool: string, args: Record<string, unknown>, ageMs = 30_000) {
  return {
    tool,
    args,
    axis: axisForTool(tool),
    at: new Date(NOW - ageMs).toISOString(),
  };
}

describe("elipses de leitura — último tópico de leitura", () => {
  it("golden 1 — 'E documentos?' resolve depois de leitura do Drive, sem palavras na resposta anterior", () => {
    // A resposta anterior do Afonso listou nomes de ficheiros sem dizer
    // "ficheiro" nem "documento". O texto anterior já não é consultado.
    const r = resolveEllipticRead("E documentos?", state("search_files", { query: "" }), NOW);
    expect(r).toEqual({ tool: "search_files", arguments: { query: "" } });
  });

  it("golden 2 — 'E para a próxima semana?' repete a agenda com o período seguinte", () => {
    const r = resolveEllipticRead(
      "E para a próxima semana?",
      state("search_agenda", { period: "today" }),
      NOW,
    );
    expect(r).toEqual({ tool: "search_agenda", arguments: { period: "next_week" } });
  });

  it("golden 3 — passados mais de 10 minutos a elipse expira e segue o fluxo normal", () => {
    const stale = state("search_agenda", { period: "today" }, LAST_READ_TTL_MS + 1000);
    expect(resolveEllipticRead("E para a próxima semana?", stale, NOW)).toBeNull();
    expect(resolveEllipticRead("E documentos?", { ...stale, tool: "search_files" }, NOW)).toBeNull();
  });

  it("golden 4 — 'E depois?' e 'E agora?' não activam nada", () => {
    const s = state("search_agenda", { period: "today" });
    expect(resolveEllipticRead("E depois?", s, NOW)).toBeNull();
    expect(resolveEllipticRead("E agora?", s, NOW)).toBeNull();
    expect(resolveEllipticRead("E então?", s, NOW)).toBeNull();
    expect(resolveEllipticRead("E o que achas da proposta da Ana?", s, NOW)).toBeNull();
  });

  it("golden 5 — pedido temporal depois do Drive não inventa filtro de datas", () => {
    const drive = state("search_files", { query: "" });
    expect(drive.axis).toBe("none");
    expect(resolveEllipticRead("E para a próxima semana?", drive, NOW)).toBeNull();
    expect(resolveEllipticRead("E amanhã?", drive, NOW)).toBeNull();
  });

  it("troca de tópico continua a funcionar: 'E imóveis?' depois da agenda", () => {
    const r = resolveEllipticRead("E imóveis?", state("search_agenda", { period: "today" }), NOW);
    expect(r?.tool).toBe("search_properties");
  });

  it("eixo temporal aceita 'E hoje?' e 'E esta semana?' sobre a agenda", () => {
    const s = state("search_agenda", { period: "tomorrow" });
    expect(resolveEllipticRead("E hoje?", s, NOW)?.arguments).toEqual({ period: "today" });
    expect(resolveEllipticRead("E esta semana?", s, NOW)?.arguments).toEqual({ period: "week" });
  });

  it("sem leitura recente no estado nada resolve", () => {
    expect(resolveEllipticRead("E documentos?", null, NOW)).toBeNull();
    expect(resolveEllipticRead("E para a próxima semana?", { tool: null, args: null, axis: null, at: null }, NOW)).toBeNull();
  });
});
