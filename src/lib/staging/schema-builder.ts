// Montagem do esquema LIMPO da V2 para o AFONSO Staging (só texto; não executa SQL).
// Puro: recebe os ficheiros de origem já lidos e devolve os blocos de migração,
// o que foi excluído/retirado e o resultado da pesquisa de dados reais.

import type { SchemaRule } from "./schema-rules";
import { STAGING_ROLES_PRELUDE, STAGING_SAFETY_CHECKS } from "./schema-rules";

export interface SourceFile {
  name: string;
  sha256: string;
  sql: string;
}

export interface ScanFinding {
  kind: "uuid" | "email" | "phone" | "production_ref" | "scheduler_or_vault" | "bucket_row" | "account_merge" | "flag_user" | "transaction_control";
  file: string;
  line: number;
  /** Excerto mascarado (nunca o valor completo). */
  excerpt: string;
}

export interface BuildResult {
  chunks: { name: string; sources: string[]; sql: string }[];
  excluded: { file: string; reason: string }[];
  stripped: { file: string; reason: string; removed: number }[];
  findings: ScanFinding[];
}

const PATTERNS: { kind: ScanFinding["kind"]; re: RegExp }[] = [
  { kind: "uuid", re: /'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/gi },
  { kind: "email", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g },
  { kind: "phone", re: /(?<!\d)(?:\+?351[\s-]?)?9[1236]\d[\s-]?\d{3}[\s-]?\d{3}(?!\d)/g },
  { kind: "production_ref", re: /meuafonso\.com|bf908ebc|ydwthwusdlxlgyreulsd|assessor-digital-pt|afonsoaibot/gi },
  { kind: "scheduler_or_vault", re: /cron\.(?:schedule|unschedule)|net\.http_(?:post|get)|vault\.(?:create_secret|secrets)/gi },
  { kind: "bucket_row", re: /insert\s+into\s+storage\.buckets/gi },
  { kind: "account_merge", re: /(?::=|perform|select)\s*(?:public\.)?merge_accounts_apply\s*\(/gi },
  { kind: "flag_user", re: /insert\s+into\s+public\.feature_flag_users/gi },
  { kind: "transaction_control", re: /^\s*(?:begin|commit|rollback)\s*;/gim },
];

const NIL_UUID = "'00000000-0000-0000-0000-000000000000'";
const SAFE_EMAIL = /@(?:example\.(?:com|pt|org|test)|exemplo\.pt|[a-z0-9.-]*\.invalid|[a-z0-9.-]*\.test)$/i;

function mask(s: string): string {
  return s
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "uuid…")
    .replace(/[A-Za-z0-9._%+-]+@/g, "***@")
    .replace(/\d{6,}/g, (d) => `${d.slice(0, 3)}…${d.slice(-2)}`);
}

export function scanSql(file: string, sql: string): ScanFinding[] {
  const out: ScanFinding[] = [];
  const lines = sql.split("\n");
  lines.forEach((text, i) => {
    for (const { kind, re } of PATTERNS) {
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) {
        if (kind === "uuid" && m[0] === NIL_UUID) continue;
        if (kind === "email" && SAFE_EMAIL.test(m[0])) continue;
        out.push({ kind, file, line: i + 1, excerpt: mask(text.trim()).slice(0, 120) });
      }
    }
  });
  return out;
}

function applyRule(src: SourceFile, rule: SchemaRule): { sql: string | null; removed: number } {
  if (rule.sha256 !== src.sha256) {
    throw new Error(`staging-schema: ${src.name} mudou desde a revisão (sha256). Rever a regra antes de montar.`);
  }
  if (rule.action === "exclude") return { sql: null, removed: 0 };
  let sql = src.sql;
  let removed = 0;
  for (const p of rule.patterns) {
    const re = new RegExp(p, "g");
    const hits = sql.match(re)?.length ?? 0;
    if (hits !== 1) throw new Error(`staging-schema: ${src.name}: padrão a retirar encontrado ${hits} vezes (esperado 1).`);
    sql = sql.replace(re, "-- [retirado na montagem de staging: dados de produção]");
    removed += 1;
  }
  return { sql, removed };
}

const ADD_VALUE_RE = /alter\s+type\s+[^;]*\badd\s+value\b/i;

/**
 * Ordem: ficheiros recebidos já em ordem de aplicação (supabase por data, depois
 * drizzle pelo journal). Um bloco termina a seguir a cada ALTER TYPE … ADD VALUE,
 * porque o novo valor só pode ser usado noutra transação.
 */
export function buildStagingSchema(sources: SourceFile[], rules: readonly SchemaRule[]): BuildResult {
  const byFile = new Map(rules.map((r) => [r.file, r]));
  const seen = new Set<string>();
  const excluded: BuildResult["excluded"] = [];
  const stripped: BuildResult["stripped"] = [];
  const kept: { name: string; sql: string }[] = [];

  for (const src of sources) {
    const rule = byFile.get(src.name);
    if (!rule) { kept.push({ name: src.name, sql: src.sql }); continue; }
    seen.add(src.name);
    const { sql, removed } = applyRule(src, rule);
    if (sql === null) excluded.push({ file: src.name, reason: rule.reason });
    else { stripped.push({ file: src.name, reason: rule.reason, removed }); kept.push({ name: src.name, sql }); }
  }
  const missing = rules.filter((r) => !seen.has(r.file)).map((r) => r.file);
  if (missing.length) throw new Error(`staging-schema: regras sem ficheiro de origem: ${missing.join(", ")}`);

  const groups: { name: string; sql: string }[][] = [[]];
  for (const k of kept) {
    groups[groups.length - 1].push(k);
    if (ADD_VALUE_RE.test(k.sql)) groups.push([]);
  }
  if (groups[groups.length - 1].length === 0) groups.pop();

  const header = (title: string) =>
    `-- ${title}\n-- Gerado por scripts/staging/build-staging-schema.ts para o projeto AFONSO Staging.\n` +
    `-- NÃO EXECUTAR neste projeto (produção/V1). Aplicar só no staging, por ordem, um bloco por migração.\n\n`;

  const chunks: BuildResult["chunks"] = [
    { name: "S2-00_staging_roles_prelude.sql", sources: [], sql: header("S2-00 · prelúdio de papéis") + STAGING_ROLES_PRELUDE },
    ...groups.map((g, i) => ({
      name: `S2-${String(i + 1).padStart(2, "0")}_v2_schema_part${i + 1}.sql`,
      sources: g.map((x) => x.name),
      sql: header(`S2-${String(i + 1).padStart(2, "0")} · esquema V2, parte ${i + 1} de ${groups.length}`) +
        g.map((x) => `-- ===== origem: ${x.name} =====\n${x.sql.trim()}\n`).join("\n"),
    })),
    { name: "S2-99_staging_safety_checks.sql", sources: [], sql: header("S2-99 · verificações finais") + STAGING_SAFETY_CHECKS },
  ];

  const findings = chunks.flatMap((c) => scanSql(c.name, c.sql));
  return { chunks, excluded, stripped, findings };
}
