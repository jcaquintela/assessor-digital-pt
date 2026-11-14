// AFONSO 2.0 — exportação self-service do titular (decisão 37).
// Partes puras: que tabelas entram, que colunas saem, manifesto com contagens,
// datas, hashes e falhas, e o ZIP. O ZIP é montado no browser do próprio
// titular; nada fica guardado no servidor.

import { zipSync, strToU8 } from "fflate";
import { TABLE_CLASS } from "@/lib/export/inventory";
import { toCsv } from "@/lib/export/download";

// Sem coluna de dono por titular (ou só acessíveis pelo serviço): ficam de fora.
const NO_OWNER_COLUMN = new Set(["daily_digests", "telegram_pairings"]);

/** Tabelas do titular que entram no ZIP e a coluna dona. Só "migrate"/"export". */
export const EXPORT_TABLES: ReadonlyArray<{ table: string; owner: "user_id" | "id" }> = Object.entries(TABLE_CLASS)
  .filter(([t, c]) => (c === "migrate" || c === "export") && !NO_OWNER_COLUMN.has(t))
  .map(([table]) => ({ table, owner: table === "profiles" ? "id" : "user_id" }) as const)
  .sort((a, b) => a.table.localeCompare(b.table));


/** Colunas internas/segredos que nunca saem, mesmo sendo do titular. */
export const EXCLUDED_COLUMN = /token|secret|password|hash|idempotency|cache_key|storage_path|internal_file_name|checksum|api_key/i;

export function sanitizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) if (!EXCLUDED_COLUMN.test(k)) out[k] = v;
  return out;
}

export interface ExportTable { table: string; rows: Record<string, unknown>[]; truncated?: boolean }
export interface ExportFile { name: string; mime: string; bytes: Uint8Array; createdAt?: string | null }
export interface ExportFailure { item: string; reason: string }

export interface ExportManifest {
  format: "afonso-export/1";
  generatedAt: string;
  tables: Array<{ table: string; rows: number; truncated: boolean; files: string[] }>;
  documents: Array<{ path: string; mime: string; bytes: number; sha256: string; createdAt: string | null }>;
  failures: ExportFailure[];
  hashes: Record<string, string>;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeName(n: string): string {
  const s = n.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").trim();
  return s.length ? s.slice(0, 120) : "ficheiro";
}

function tableCsv(rows: Record<string, unknown>[]): string {
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return toCsv(headers, rows.map((r) => headers.map((h) => {
    const v = r[h];
    return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
  })));
}

const README = `Os teus dados do Afonso
=======================

Esta pasta tem os dados e documentos que são teus.

- dados/<nome>.json e dados/<nome>.csv: os teus registos (o CSV abre no Excel).
- documentos/: os ficheiros originais que enviaste.
- manifesto.json: o que foi incluído, quantos registos, datas, falhas e a
  impressão digital (SHA-256) de cada ficheiro, para confirmares que nada mudou.

Não inclui dados de outras pessoas com conta, segredos de acesso nem configurações internas.
`;

export async function buildExportZip(input: {
  generatedAt: string;
  tables: ExportTable[];
  files: ExportFile[];
  failures: ExportFailure[];
}): Promise<{ zip: Uint8Array; manifest: ExportManifest }> {
  const entries: Record<string, Uint8Array> = {};
  const hashes: Record<string, string> = {};
  const add = async (path: string, bytes: Uint8Array) => {
    entries[path] = bytes;
    hashes[path] = await sha256(bytes);
  };

  const tables: ExportManifest["tables"] = [];
  for (const t of [...input.tables].sort((a, b) => a.table.localeCompare(b.table))) {
    const rows = t.rows.map(sanitizeRow);
    const json = `dados/${t.table}.json`;
    const csv = `dados/${t.table}.csv`;
    await add(json, strToU8(JSON.stringify(rows, null, 2)));
    const files = [json];
    if (rows.length) {
      await add(csv, strToU8(tableCsv(rows)));
      files.push(csv);
    }
    tables.push({ table: t.table, rows: rows.length, truncated: !!t.truncated, files });
  }

  const documents: ExportManifest["documents"] = [];
  const used = new Set<string>();
  for (const f of input.files) {
    let base = safeName(f.name);
    let path = `documentos/${base}`;
    for (let i = 2; used.has(path); i++) path = `documentos/${i}_${base}`;
    used.add(path);
    await add(path, f.bytes);
    documents.push({ path, mime: f.mime, bytes: f.bytes.byteLength, sha256: hashes[path], createdAt: f.createdAt ?? null });
  }

  await add("LEIA-ME.txt", strToU8(README));
  const manifest: ExportManifest = {
    format: "afonso-export/1",
    generatedAt: input.generatedAt,
    tables,
    documents,
    failures: input.failures,
    hashes: { ...hashes },
  };
  entries["manifesto.json"] = strToU8(JSON.stringify(manifest, null, 2));
  return { zip: zipSync(entries, { level: 6 }), manifest };
}
