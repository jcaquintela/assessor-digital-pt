// Golden: em Diversos, arquivar pelo caminho real de escrita (status =
// 'archived') tira a nota das vistas de trabalho e põe-na no separador certo.
import { describe, it, expect } from "vitest";
import { matchesMiscTab, isMiscInbox } from "./archived";

const nota = { id: "m1", status: "inbox", archived_at: null };

describe("Diversos — status é a fonte única de arquivado", () => {
  it("nota por tratar aparece em recentes e em tratar", () => {
    expect(matchesMiscTab(nota, "recentes")).toBe(true);
    expect(matchesMiscTab(nota, "tratar")).toBe(true);
    expect(matchesMiscTab(nota, "arquivados")).toBe(false);
  });

  it("depois de arquivar (status='archived') sai das vistas de trabalho", () => {
    const arquivada = { ...nota, status: "archived" }; // caminho real de escrita
    expect(matchesMiscTab(arquivada, "recentes")).toBe(false);
    expect(matchesMiscTab(arquivada, "tratar")).toBe(false);
    expect(matchesMiscTab(arquivada, "arquivados")).toBe(true);
    expect(isMiscInbox(arquivada)).toBe(false);
  });

  it("archived_at preenchido não arquiva nada — só status conta", () => {
    const enganosa = { ...nota, archived_at: "2026-08-01T00:00:00Z" };
    expect(matchesMiscTab(enganosa, "tratar")).toBe(true);
  });

  it("eliminada nunca aparece em separador nenhum", () => {
    const eliminada = { ...nota, status: "deleted" };
    for (const t of ["recentes", "tratar", "classificados", "arquivados"] as const) {
      expect(matchesMiscTab(eliminada, t)).toBe(false);
    }
  });
});
