// Monta os ficheiros de migração LIMPOS da V2 para o AFONSO Staging.
// Só lê ficheiros deste repositório e escreve em staging-install/migrations/.
// Não liga a nenhuma base de dados, não executa SQL e não lê segredos.
//
// Uso: bun scripts/staging/build-staging-schema.ts

import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildStagingSchema, type SourceFile } from "../../src/lib/staging/schema-builder";
import { STAGING_SCHEMA_RULES } from "../../src/lib/staging/schema-rules";

export function loadSources(root = process.cwd()): SourceFile[] {
  const read = (path: string, name: string): SourceFile => {
    const sql = readFileSync(path, "utf8");
    return { name, sql, sha256: createHash("sha256").update(sql).digest("hex") };
  };
  const supa = join(root, "supabase/migrations");
  const supaFiles = readdirSync(supa).filter((f) => f.endsWith(".sql")).sort();
  const journal = JSON.parse(readFileSync(join(root, "drizzle/migrations/meta/_journal.json"), "utf8")) as {
    entries: { idx: number; tag: string }[];
  };
  const drizzleFiles = [...journal.entries].sort((a, b) => a.idx - b.idx).map((e) => `${e.tag}.sql`);
  return [
    ...supaFiles.map((f) => read(join(supa, f), f)),
    ...drizzleFiles.map((f) => read(join(root, "drizzle/migrations", f), f)),
  ];
}

if ((import.meta as any).main) {
  const sources = loadSources();
  const result = buildStagingSchema(sources, STAGING_SCHEMA_RULES);
  if (result.findings.length) {
    console.error(`Montagem recusada: ${result.findings.length} ocorrências de dados reais ou recursos de produção.`);
    for (const f of result.findings) console.error(`  ${f.kind} ${f.file}:${f.line} ${f.excerpt}`);
    process.exit(1);
  }
  const out = join(process.cwd(), "staging-install/migrations");
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const manifest = {
    generated_from: { supabase_migrations: sources.filter((s) => !/^\d{4}_/.test(s.name)).length, drizzle_migrations: sources.filter((s) => /^\d{4}_/.test(s.name)).length },
    chunks: result.chunks.map((c) => ({
      file: c.name,
      sources: c.sources.length,
      lines: c.sql.split("\n").length,
      sha256: createHash("sha256").update(c.sql).digest("hex"),
    })),
    excluded: result.excluded,
    stripped: result.stripped,
    findings: 0,
  };
  for (const c of result.chunks) writeFileSync(join(out, c.name), c.sql);
  writeFileSync(join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`OK: ${result.chunks.length} blocos, ${result.excluded.length} ficheiros excluídos, ${result.stripped.length} ficheiros com partes retiradas, 0 ocorrências.`);
}
