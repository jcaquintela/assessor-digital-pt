import { describe, expect, it } from "vitest";
import {
  buildBulkArchiveQuestion,
  detectBulkArchiveRequest,
  kindLabel,
  noMatchesReply,
} from "./bulk-archive";

describe("detectBulkArchiveRequest", () => {
  it("reconhece 'apaga os áudios todos'", () => {
    expect(detectBulkArchiveRequest("Apaga os áudios todos")).toEqual({ kind: "audio", term: null });
  });

  it("reconhece arquivar fotos e documentos", () => {
    expect(detectBulkArchiveRequest("arquiva as fotos")?.kind).toBe("image");
    expect(detectBulkArchiveRequest("elimina os pdfs")?.kind).toBe("document");
  });

  it("exige 'todos' quando fala só de ficheiros", () => {
    expect(detectBulkArchiveRequest("apaga os ficheiros")).toBeNull();
    expect(detectBulkArchiveRequest("apaga todos os ficheiros")?.kind).toBe("any");
  });

  it("ignora pedidos no singular e frases sem verbo", () => {
    expect(detectBulkArchiveRequest("apaga o áudio")).toBeNull();
    expect(detectBulkArchiveRequest("mostra-me os áudios")).toBeNull();
  });

  it("apanha palavra-chave do nome", () => {
    expect(detectBulkArchiveRequest("apaga os áudios do Coelho")).toEqual({ kind: "audio", term: "coelho" });
  });
});

describe("pergunta de confirmação", () => {
  it("mostra a lista e diz que é reversível", () => {
    const q = buildBulkArchiveQuestion("audio", ["a.ogg", "b.ogg", "c.ogg"]);
    expect(q).toContain("Encontrei 3 áudios");
    expect(q).toContain("1. a.ogg");
    expect(q).toContain("Confirmas arquivar estes 3?");
    expect(q).toMatch(/revers[íi]vel/i);
    expect(q).not.toMatch(/eliminei|apaguei/i);
  });

  it("resume quando passa dos 10", () => {
    const q = buildBulkArchiveQuestion("image", Array.from({ length: 14 }, (_, i) => `f${i}.jpg`));
    expect(q).toContain("… e mais 4");
  });

  it("responde quando não há nada", () => {
    expect(noMatchesReply({ kind: "audio", term: null })).toMatch(/Não encontrei áudios/);
    expect(kindLabel("document", 1)).toBe("documento");
  });
});