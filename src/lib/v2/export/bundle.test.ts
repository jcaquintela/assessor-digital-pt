import { describe, it, expect } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { createHash } from "node:crypto";
import { buildExportZip, sanitizeRow, EXPORT_TABLES } from "./bundle";
import { TABLE_CLASS } from "@/lib/export/inventory";

describe("exportação self-service do titular", () => {
  it("só inclui tabelas 'migrar' ou 'exportar' do inventário, nunca reter/excluir", () => {
    expect(EXPORT_TABLES.length).toBeGreaterThan(20);
    for (const { table } of EXPORT_TABLES) expect(["migrate", "export"]).toContain(TABLE_CLASS[table]);
    const names = EXPORT_TABLES.map((t) => t.table);
    for (const t of ["feature_flags", "admin_audit_logs", "stripe_webhook_events", "telegram_link_tokens", "assessor_ai_logs"]) {
      expect(names).not.toContain(t);
    }
  });

  it("perfil é filtrado por id; o resto por user_id", () => {
    expect(EXPORT_TABLES.find((t) => t.table === "profiles")?.owner).toBe("id");
    expect(EXPORT_TABLES.find((t) => t.table === "people")?.owner).toBe("user_id");
  });

  it("retira tokens, hashes e caminhos internos de cada linha", () => {
    expect(sanitizeRow({ id: 1, confirm_token: "x", storage_path: "u/a", code_hash: "h", idempotency_key: "k", name: "Ana" }))
      .toEqual({ id: 1, name: "Ana" });
  });

  it("ZIP tem dados, documentos originais, LEIA-ME e manifesto com contagens, falhas e hashes corretos", async () => {
    const pdf = new Uint8Array([37, 80, 68, 70, 1, 2, 3]);
    const { zip, manifest } = await buildExportZip({
      generatedAt: "2026-11-14T12:00:00Z",
      tables: [{ table: "people", rows: [{ id: "p1", name: "Ana; Silva", confirm_token: "t" }] }, { table: "tags", rows: [] }],
      files: [{ name: "cc/../escritura.pdf", mime: "application/pdf", bytes: pdf }, { name: "cc/../escritura.pdf", mime: "application/pdf", bytes: pdf }],
      failures: [{ item: "documento:x", reason: "não foi possível descarregar" }],
    });
    const files = unzipSync(zip);
    expect(Object.keys(files).sort()).toEqual([
      "LEIA-ME.txt", "dados/people.csv", "dados/people.json", "dados/tags.json",
      "documentos/2_cc_.._escritura.pdf", "documentos/cc_.._escritura.pdf", "manifesto.json",
    ]);
    const people = JSON.parse(strFromU8(files["dados/people.json"]));
    expect(people).toEqual([{ id: "p1", name: "Ana; Silva" }]);
    const m = JSON.parse(strFromU8(files["manifesto.json"]));
    expect(m.tables).toEqual(manifest.tables);
    expect(m.tables.find((t: any) => t.table === "people").rows).toBe(1);
    expect(m.failures).toHaveLength(1);
    const expected = createHash("sha256").update(pdf).digest("hex");
    expect(m.documents[0].sha256).toBe(expected);
    for (const [p, h] of Object.entries(m.hashes)) {
      expect(createHash("sha256").update(files[p]).digest("hex"), p).toBe(h);
    }
  });
});
