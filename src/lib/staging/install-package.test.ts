import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Pacote de instalação auditável para o AFONSO Staging (staging-install/package/v1.0.0).
// Garante integridade (hashes), cópia integral dos SQL, consultas só de leitura e
// ausência de dados reais. Não liga a nenhuma base.
const PKG = join(process.cwd(), "staging-install/package/v1.0.0");
const SRC = join(process.cwd(), "staging-install/migrations");
const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const queries = ["preflight", "posflight"].flatMap((d) =>
  readdirSync(join(PKG, d)).map((n) => ({ name: `${d}/${n}`, sql: readFileSync(join(PKG, d, n), "utf8") })),
);
/** Retira comentários e literais de texto, para analisar só o código SQL. */
const codeOnly = (s: string) =>
  s.replace(/--[^\n]*/g, " ").replace(/'(?:[^']|'')*'/g, "''").replace(/"(?:[^"]|"")*"/g, '""');

describe("pacote de instalação do staging v1.0.0", () => {
  it("SHA256SUMS cobre todos os ficheiros e confere", () => {
    const lines = readFileSync(join(PKG, "SHA256SUMS"), "utf8").trim().split("\n");
    const listed = new Map(lines.map((l) => [l.slice(66), l.slice(0, 64)]));
    const onDisk = walk(PKG)
      .map((p) => relative(PKG, p))
      .filter((p) => p !== "SHA256SUMS" && !p.includes("__pycache__"));
    expect([...listed.keys()].sort()).toEqual(onDisk.sort());
    for (const [file, hash] of listed) expect(sha(join(PKG, file)), file).toBe(hash);
  });

  it("os 4 SQL são cópias integrais de staging-install/migrations", () => {
    const names = readdirSync(join(PKG, "sql")).sort();
    expect(names).toEqual([
      "S2-00_staging_roles_prelude.sql",
      "S2-01_v2_schema_part1.sql",
      "S2-02_v2_schema_part2.sql",
      "S2-99_staging_safety_checks.sql",
    ]);
    for (const n of names) expect(sha(join(PKG, "sql", n)), n).toBe(sha(join(SRC, n)));
  });

  it("preflight e posflight: um único SELECT/WITH, sem escrita nem efeitos", () => {
    expect(queries).toHaveLength(10);
    const forbidden =
      /\b(insert|update|delete|merge|create|alter|drop|grant|revoke|truncate|copy|call|do|set|reset|lock|vacuum|comment|refresh|notify|listen|prepare|execute|begin|commit|rollback|savepoint)\b|set_config|nextval|setval|pg_advisory|dblink|lo_import|pg_read_file|has_staging_access\s*\(|\bhas_role\s*\(/i;
    for (const q of queries) {
      const code = codeOnly(q.sql).trim();
      expect(code, q.name).toMatch(/^(with|select)\b/i);
      expect(code.replace(/;\s*$/, ""), q.name).not.toContain(";");
      expect(code, q.name).not.toMatch(forbidden);
    }
  });

  it("sem dados reais: o email do proprietário é um marcador", () => {
    for (const q of queries) {
      expect(q.sql, q.name).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      expect(q.sql, q.name).not.toMatch(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    }
    for (const n of ["P04_conta_proprietario.sql"]) expect(readFileSync(join(PKG, "preflight", n), "utf8")).toContain("__EMAIL_AUTORIZADO__");
    expect(readFileSync(join(PKG, "posflight", "Q03_conta_proprietario.sql"), "utf8")).toContain("__EMAIL_AUTORIZADO__");
    for (const f of walk(PKG)) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/saguii|meuafonso\.com|ydwthwusdlxlgyreulsd/i);
      for (const m of text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []) expect(m, f).toMatch(/\.invalid$/);
    }
  });

  it("o manifesto declara destino staging e bloqueios em aberto", () => {
    const m = JSON.parse(readFileSync(join(PKG, "MANIFEST.json"), "utf8"));
    expect(m.target_project.id).toBe("8d741542-70d9-4078-bfc6-64e3d047396a");
    expect(m.status).toMatch(/AUDIT_ONLY/);
    expect(m.sql.every((s: { identical_to_source: boolean }) => s.identical_to_source)).toBe(true);
    expect(m.blockers.join(" ")).toMatch(/TRIGGER/);
  });
});
