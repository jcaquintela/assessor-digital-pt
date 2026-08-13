import { describe, it, expect } from "vitest";
import { detectEllipticDriveRead, detectReadRequest } from "./read-intent";
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
*** noop
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
