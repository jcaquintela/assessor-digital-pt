// Golden tests — eliminação permanente do Drive (Fase 2).
import { describe, it, expect } from "vitest";
import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";
import { permanentlyDeleteDriveFile } from "./purge.server";

const USER = "df098797-b532-40bb-a298-003ef99fe81a";
const FILE = "3f2a1c55-8b7e-4a11-9c22-aa11bb22cc33";

function baseDb(over: Record<string, any[]> = {}) {
  return makeFakeSupabase({
    uploaded_files: [
      {
        id: FILE,
        user_id: USER,
        original_file_name: "CPCV Rua das Flores.pdf",
        storage_path: `${USER}/cpcv.pdf`,
        archived_at: "2026-09-01T10:00:00.000Z",
        deleted_at: null,
      },
    ],
    file_links: [
      { id: "fl-1", user_id: USER, file_id: FILE, entity_type: "person", entity_id: "p1" },
    ],
    admin_audit_logs: [],
    ...over,
  });
}

/** Envolve o fake para o storage falhar e registar a ordem das operações. */
function withStorageFailure(sb: any) {
  return {
    ...sb,
    storage: {
      from() {
        return {
          async remove() {
            return { data: null, error: { message: "network" } };
          },
        };
      },
    },
  };
}

describe("1. ficheiro arquivado", () => {
  it("remove ligações, apaga do storage e elimina o registo", async () => {
    const sb = baseDb();
    const res = await permanentlyDeleteDriveFile(sb as any, {
      userId: USER,
      fileId: FILE,
      reason: "documento repetido",
    });
    expect(res.deleted).toBe(true);
    expect(sb.state.file_links).toHaveLength(0);
    expect(sb.removedPaths).toEqual([`${USER}/cpcv.pdf`]);
    expect(sb.state.uploaded_files).toHaveLength(0);
  });
});

describe("2. falha no storage", () => {
  it("não elimina a linha da base de dados", async () => {
    const sb = baseDb();
    await expect(
      permanentlyDeleteDriveFile(withStorageFailure(sb) as any, {
        userId: USER,
        fileId: FILE,
        reason: "documento repetido",
      }),
    ).rejects.toThrow(/armazenamento/i);
    expect(sb.state.uploaded_files).toHaveLength(1);
  });
});

describe("3. várias ligações", () => {
  it("remove todas, sem órfãos, e não toca nas de outros ficheiros", async () => {
    const sb = baseDb({
      file_links: [
        { id: "fl-1", user_id: USER, file_id: FILE, entity_type: "person", entity_id: "p1" },
        { id: "fl-2", user_id: USER, file_id: FILE, entity_type: "property", entity_id: "i1" },
        { id: "fl-3", user_id: USER, file_id: FILE, entity_type: "opportunity", entity_id: "n1" },
        { id: "fl-4", user_id: USER, file_id: "outro", entity_type: "person", entity_id: "p2" },
      ],
    });
    const res = await permanentlyDeleteDriveFile(sb as any, {
      userId: USER,
      fileId: FILE,
      reason: "já não faz falta",
    });
    expect(res.links).toBe(3);
    expect(sb.state.file_links.map((l: any) => l.id)).toEqual(["fl-4"]);
  });
});

describe("4. auditoria", () => {
  it("grava o retrato completo antes do delete", async () => {
    const sb = baseDb();
    await permanentlyDeleteDriveFile(sb as any, {
      userId: USER,
      fileId: FILE,
      reason: "enviado por engano",
    });
    const logs = sb.state.admin_audit_logs as any[];
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe("registo.eliminacao_permanente.drive_file");
    expect(logs[0].reason).toBe("enviado por engano");
    expect(logs[0].resource_id).toBe(FILE);
    expect(logs[0].metadata.snapshot.original_file_name).toBe("CPCV Rua das Flores.pdf");
    expect(logs[0].metadata.snapshot.storage_path).toBe(`${USER}/cpcv.pdf`);
    expect(logs[0].metadata.children.file_links).toHaveLength(1);
  });

  it("sem motivo o servidor recusa", async () => {
    const sb = baseDb();
    await expect(
      permanentlyDeleteDriveFile(sb as any, { userId: USER, fileId: FILE, reason: " " }),
    ).rejects.toThrow(/motivo/i);
    expect(sb.state.uploaded_files).toHaveLength(1);
  });
});

describe("5. ficheiro não arquivado", () => {
  it("bloqueia sem apagar nada", async () => {
    const sb = baseDb({
      uploaded_files: [
        {
          id: FILE,
          user_id: USER,
          original_file_name: "Ativo.pdf",
          storage_path: `${USER}/ativo.pdf`,
          archived_at: null,
          deleted_at: null,
        },
      ],
    });
    await expect(
      permanentlyDeleteDriveFile(sb as any, { userId: USER, fileId: FILE, reason: "engano" }),
    ).rejects.toThrow(/arquivado/i);
    expect(sb.state.uploaded_files).toHaveLength(1);
    expect(sb.state.file_links).toHaveLength(1);
    expect(sb.removedPaths).toHaveLength(0);
    expect(sb.state.admin_audit_logs).toHaveLength(0);
  });
});
