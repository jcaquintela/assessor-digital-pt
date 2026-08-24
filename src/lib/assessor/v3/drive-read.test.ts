import { describe, it, expect } from "vitest";
import { detectReadRequest } from "./read-intent";
import { resolveEllipticRead } from "./elliptic-read";
import {
  detectDriveFileRequest,
  buildFileActionQuestion,
  fileActionDoneReply,
  fileActionCancelledReply,
} from "@/lib/drive/bulk-archive";
import { formatQueryResults } from "./query-results";
import { isDiscardAudioRequest, UNDO_KEEP_DONE_REPLY, UNDO_KEEP_TOO_LATE_REPLY } from "./audio-undo";

describe("leitura do Drive Inteligente", () => {
  it("'Lista aqui todos os ficheiros no drive' é leitura pura com ferramenta", () => {
    const r = detectReadRequest("Lista aqui todos os ficheiros no drive");
    expect(r.pure).toBe(true);
    expect(r.tool).toBe("search_files");
  });

  it("lista grande mostra os recentes e oferece sempre ver tudo", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      original_file_name: `doc-${i}.pdf`,
      document_type: "caderneta",
    }));
    const out = formatQueryResults([
      { name: "search_files", ok: true, data: { results: rows, total: 34 } } as any,
    ])!;
    expect(out).toContain("Tens 34 ficheiros no Drive Inteligente:");
    expect(out).toContain("Queres a lista toda ou só de uma pessoa/imóvel?");
  });

  it("lista curta não faz pergunta", () => {
    const out = formatQueryResults([
      { name: "search_files", ok: true, data: { results: [{ original_file_name: "a.pdf" }], total: 1 } } as any,
    ])!;
    expect(out).toContain("Tens 1 ficheiro no Drive Inteligente:");
    expect(out).not.toContain("lista toda");
  });

  it("golden 1 — 'Lista os documentos da Drive' vai à ferramenta, não a Diversos", () => {
    const r = detectReadRequest("Lista os documentos da Drive.");
    expect(r.pure).toBe(true);
    expect(r.tool).toBe("search_files");
  });

  it("golden 4 — 'E documentos?' resolve pelo tópico da última leitura", () => {
    const now = Date.now();
    const drive = { tool: "search_files", args: { query: "" }, axis: "none", at: new Date(now - 1000).toISOString() };
    expect(resolveEllipticRead("E documentos?", drive, now)?.tool).toBe("search_files");
    expect(resolveEllipticRead("E documentos?", null, now)).toBeNull();
  });
});

describe("apagar ficheiros do Drive por conversa", () => {
  it("golden 2 — 'Apaga os áudios todos' pede confirmação com a contagem real", () => {
    expect(detectDriveFileRequest("Apaga os áudios todos")).toEqual({
      kind: "audio", term: null, mode: "delete",
    });
    const q = buildFileActionQuestion("audio", ["a.ogg", "b.ogg", "c.ogg"], "delete");
    expect(q).toContain("Encontrei 3 áudios");
    expect(q).toContain("Queres mesmo apagar estes 3?");
    expect(q).toContain("não pode ser desfeito");
    expect(q).not.toMatch(/apaguei/i);
  });

  it("golden 3 — depois do sim, a confirmação diz o que foi apagado", () => {
    expect(fileActionDoneReply("audio", 6, "delete")).toBe("Apaguei 6 áudios do Drive Inteligente.");
    expect(fileActionCancelledReply("delete")).toBe("Certo, não apaguei nada.");
  });

  it("arquivar mantém o texto reversível de sempre", () => {
    expect(detectDriveFileRequest("arquiva as fotos")?.mode).toBe("archive");
    expect(fileActionDoneReply("image", 2, "archive")).toMatch(/Arquivei 2 fotos/);
  });

  it("apanha um ficheiro identificado pelo nome", () => {
    expect(detectDriveFileRequest("apaga o ficheiro caderneta gaia")).toEqual({
      kind: "any", term: "caderneta gaia", mode: "delete",
    });
  });
});

describe("descarta depois de já ter guardado", () => {
  it("reconhece o pedido", () => {
    expect(isDiscardAudioRequest("Descarta")).toBe(true);
    expect(isDiscardAudioRequest("afinal descarta o ficheiro")).toBe(true);
    expect(isDiscardAudioRequest("apaga o áudio")).toBe(true);
    expect(isDiscardAudioRequest("marca visita amanhã")).toBe(false);
  });

  it("as respostas dizem sempre que efeito ficou", () => {
    expect(UNDO_KEEP_DONE_REPLY).toContain("Removi o ficheiro");
    expect(UNDO_KEEP_TOO_LATE_REPLY).toContain("Já está guardado");
    expect(UNDO_KEEP_TOO_LATE_REPLY).toContain("Eliminar");
  });
});
