import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadSources } from "../../../scripts/staging/build-staging-schema";
import { buildStagingSchema, scanSql } from "./schema-builder";
import { STAGING_SCHEMA_RULES } from "./schema-rules";

const sources = loadSources();
const result = buildStagingSchema(sources, STAGING_SCHEMA_RULES);
const all = result.chunks.map((c) => c.sql).join("\n");
/** Só instruções de topo: retira corpos de funções ($$ … $$), onde inserções são lógica legítima. */
const topLevel = all.replace(/\$([a-z_]*)\$[\s\S]*?\$\1\$/gi, "$BODY$");

describe("esquema limpo para o AFONSO Staging (só ficheiros, nada executado)", () => {
  it("lê toda a história: 174 + 10 migrações de origem", () => {
    expect(sources.length).toBe(184);
  });

  it("zero identificadores, emails, telefones ou recursos de produção no resultado", () => {
    expect(result.findings).toEqual([]);
  });

  it("exclui os 9 ficheiros de dados de produção e retira partes de 5", () => {
    expect(result.excluded.map((e) => e.file).sort()).toEqual(
      STAGING_SCHEMA_RULES.filter((r) => r.action === "exclude").map((r) => r.file).sort(),
    );
    expect(result.excluded.length).toBe(9);
    expect(result.stripped.length).toBe(5);
    for (const e of result.excluded) expect(all).not.toContain(`origem: ${e.file}`);
  });

  it("sem administrador fixo, fusão de contas, piloto real nem ativações individuais", () => {
    expect(all).not.toMatch(/VALUES\s*\('[0-9a-f-]{36}',\s*'super_admin'/i);
    expect(all).not.toMatch(/:=\s*public\.merge_accounts_apply\(/i);
    expect(topLevel).not.toMatch(/INSERT INTO public\.pilot_participants/i);
    expect(topLevel).not.toMatch(/INSERT INTO public\.pilots\b/i);
    expect(topLevel).not.toMatch(/INSERT INTO public\.feature_flag_users/i);
    // A estrutura mantém-se: a função de fusão e as tabelas do piloto existem.
    expect(all).toMatch(/CREATE OR REPLACE FUNCTION public\.merge_accounts_apply/i);
    expect(all).toMatch(/CREATE TABLE[^;]*public\.pilot_participants/i);
  });

  it("conserva os papéis admin/tester do staging e acrescenta os da V2 numa transação própria", () => {
    const prelude = result.chunks[0];
    expect(prelude.name).toBe("S2-00_staging_roles_prelude.sql");
    expect(prelude.sql).toMatch(/ADD VALUE IF NOT EXISTS 'consultant'/);
    expect(prelude.sql).toMatch(/ADD VALUE IF NOT EXISTS 'super_admin'/);
    expect(prelude.sql).not.toMatch(/DROP\s+(TYPE|TABLE|FUNCTION)/i);
    expect(prelude.sql).not.toMatch(/CREATE TYPE/i);
    expect(all).not.toMatch(/DROP\s+FUNCTION[^;]*has_staging_access/i);
  });

  it("separa blocos depois de cada ADD VALUE do histórico", () => {
    const parts = result.chunks.slice(1, -1);
    expect(parts.length).toBe(2);
    expect(parts[0].sources.at(-1)).toBe("20260812210439_d760fbe9-d42d-4997-89aa-76a6c11d4754.sql");
  });

  it("termina com todos os interruptores desligados e verificações que abortam", () => {
    const last = result.chunks.at(-1)!;
    expect(last.name).toBe("S2-99_staging_safety_checks.sql");
    expect(last.sql).toMatch(/SET enabled_globally = false/);
    expect(last.sql).toMatch(/RAISE EXCEPTION 'staging: há pilotos ou participantes/);
  });

  it("recusa montar se um ficheiro revisto mudou", () => {
    const tampered = sources.map((s) =>
      s.name === STAGING_SCHEMA_RULES[0].file ? { ...s, sha256: "0".repeat(64) } : s,
    );
    expect(() => buildStagingSchema(tampered, STAGING_SCHEMA_RULES)).toThrow(/mudou desde a revisão/);
  });

  it("a pesquisa apanha dados reais e recursos de produção", () => {
    const kinds = scanSql("x.sql", [
      "insert into t values ('11111111-2222-3333-4444-555555555555');",
      "-- contacto ana@empresa.pt",
      "-- tel +351 910 000 000",
      "-- https://app.meuafonso.com/hoje",
      "select cron.schedule('x','* * * * *','select 1');",
    ].join("\n")).map((f) => f.kind);
    expect(kinds).toEqual(["uuid", "email", "phone", "production_ref", "scheduler_or_vault"]);
    expect(scanSql("y.sql", "-- teste@example.test '00000000-0000-0000-0000-000000000000'")).toEqual([]);
  });

  it("os ficheiros guardados em staging-install/ são reprodutíveis", () => {
    const manifest = JSON.parse(readFileSync("staging-install/migrations/manifest.json", "utf8"));
    for (const c of result.chunks) {
      const saved = readFileSync(`staging-install/migrations/${c.name}`, "utf8");
      expect(saved).toBe(c.sql);
      expect(manifest.chunks.find((m: any) => m.file === c.name).sha256).toBe(
        createHash("sha256").update(c.sql).digest("hex"),
      );
    }
  });
});
