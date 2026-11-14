// Gera (em memória) os ficheiros DERIVADOS do pacote v1.0.3. Determinístico; não executa SQL.
// S4-00…S4-05, quarentena, ACCESS-MATRIX e todas as P/Q exceto o P02 saem do MESMO montador da
// v1.0.2 e têm de ser byte a byte os da v1.0.2 (hashes presos em rules.ts). Documentos escritos à
// mão vivem na pasta do pacote e entram no MANIFEST/SHA256SUMS.

import { createHash } from "node:crypto";
import { SOURCE_DUMP, STAGING_PROJECT_ID, V100_SQL } from "../v101/rules";
import type { V101Output } from "../v101/build";
import { AUDIT_OPTIONS_V102, generateDerivedFilesV102, type GeneratedFile } from "../v102/package";
import type { QueryFile } from "../v102/queries";
import { buildP02V103, buildR30, P02_NEW_IDS, P02_REPLACED_ID } from "./queries";
import { BLOCKERS_V103, STAGING_0000_INPUT, V103_CHANGED_QUERY, V103_COPIED_HANDWRITTEN, V103_PRESERVED_SQL_SHA256, V103_PREVIOUS, V103_VERSION } from "./rules";

export const PACKAGE_DIR_V103 = `staging-install/package/v${V103_VERSION}`;
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

/** Derivados copiados da v1.0.2 sem alteração (o resto da v1.0.2 — DIFF-v1.0.1, BLOCKERS — é substituído). */
const copiedDerived = (p: string) => p.startsWith("sql/") || p.startsWith("quarantine/") || (/^(preflight|posflight)\//.test(p) && p !== V103_CHANGED_QUERY) || p === "ACCESS-MATRIX.md";

export function generateDerivedFilesV103(input: { dump: string; v100: { name: string; sql: string }[] }): { files: GeneratedFile[]; out: V101Output; queries: QueryFile[]; prevQueries: QueryFile[]; r30: ReturnType<typeof buildR30> } {
  const base = generateDerivedFilesV102(input);
  const prevP02 = base.queries.find((q) => `${q.dir}/${q.name}` === V103_CHANGED_QUERY)!;
  const p02 = buildP02V103(prevP02);
  const r30 = buildR30();
  const queries = base.queries.map((q) => (q === prevP02 ? p02 : q));
  const files: GeneratedFile[] = [];
  for (const f of base.files) {
    if (f.path === V103_CHANGED_QUERY) files.push({ path: f.path, content: p02.sql });
    else if (copiedDerived(f.path)) files.push(f);
  }
  for (const [name, h] of Object.entries(V103_PRESERVED_SQL_SHA256)) {
    const f = files.find((x) => x.path === `sql/${name}`);
    if (!f || sha(f.content) !== h) throw new Error(`v1.0.3: sql/${name} deixou de ser byte a byte o da v1.0.2`);
  }
  if (files.filter((f) => f.path.startsWith("sql/")).length !== 6) throw new Error("v1.0.3: esperadas 6 migrações");
  files.push({ path: "ensaio/R30_sessao_alvo.sql", content: r30.sql });
  files.push({ path: "BLOCKERS.md", content: [
    `# Bloqueios e ambiguidades — v${V103_VERSION} (gerado de BLOCKERS_V103)`,
    "",
    "Nenhum destes pontos foi \"resolvido\" por simulação. Cada um diz o que falta e quem decide. G1–G4 continuam NO-GO.",
    "",
    "| # | Bloqueio | Impacto | O que falta | Estado |",
    "|---|---|---|---|---|",
    ...BLOCKERS_V103.map((b) => `| ${b.id} | **${b.title}** | ${b.impact} | ${b.missing} | ABERTO |`),
    "",
  ].join("\n") });
  return { files, out: base.out, queries, prevQueries: base.queries, r30 };
}

/** Ficheiros que não entram na comparação com a v1.0.2 (gerados por cima dela). */
const DIFF_EXCLUDED = new Set(["MANIFEST.json", "SHA256SUMS", `DIFF-v${V103_PREVIOUS.version}.md`]);

export function buildDiffV103(prevSums: string, files: { path: string; content: Buffer }[], prevQueries: QueryFile[], queries: QueryFile[]): string {
  const prev = new Map(prevSums.trim().split("\n").map((l) => [l.slice(66), l.slice(0, 64)] as const).filter(([p]) => !DIFF_EXCLUDED.has(p) && p !== "MANIFEST.json"));
  const cur = new Map(files.filter((f) => !DIFF_EXCLUDED.has(f.path)).map((f) => [f.path, sha(f.content)] as const));
  const all = [...new Set([...prev.keys(), ...cur.keys()])].sort();
  const state = (p: string) => (!prev.has(p) ? "NOVO" : !cur.has(p) ? "RETIRADO" : prev.get(p) === cur.get(p) ? "idêntico" : "ALTERADO");
  const rows = all.map((p) => `| ${p} | ${state(p)} | ${prev.get(p)?.slice(0, 16) ?? "—"} | ${cur.get(p)?.slice(0, 16) ?? "—"} |`);
  const count = (s: string) => all.filter((p) => state(p) === s).length;
  const p2a = prevQueries.find((q) => `${q.dir}/${q.name}` === V103_CHANGED_QUERY)!;
  const p2b = queries.find((q) => `${q.dir}/${q.name}` === V103_CHANGED_QUERY)!;
  const byId = new Map(p2a.checks.map((c) => [c.id, c]));
  const p2rows = p2b.checks.map((c) => `| ${c.id} | ${!byId.has(c.id) ? "NOVA" : byId.get(c.id)!.ok === c.ok && byId.get(c.id)!.label === c.label ? "idêntica" : "SUBSTITUÍDA"} | ${c.label.replace(/\|/g, "/")} |`);
  const sqlSame = Object.keys(V103_PRESERVED_SQL_SHA256).every((n) => state(`sql/${n}`) === "idêntico");
  return [
    `# Diferenças v${V103_PREVIOUS.version} → v${V103_VERSION} (gerado; nada executado)`,
    "",
    `Comparação ficheiro a ficheiro com o \`SHA256SUMS\` da v${V103_PREVIOUS.version} (commit \`${V103_PREVIOUS.commit}\`). MANIFEST, SHA256SUMS e este ficheiro ficam de fora.`,
    "",
    `- **Migrações S4-00…S4-05: ${sqlSame ? "6/6 idênticas byte a byte" : "DIFERENTES — ERRO"}** (com os REVOKE e o acesso só pelo servidor). Os cabeçalhos dizem "v1.0.2" de propósito: mudá-los mudaria os hashes auditados.`,
    `- Idênticos: ${count("idêntico")} · alterados: ${count("ALTERADO")} · novos: ${count("NOVO")} · retirados: ${count("RETIRADO")}.`,
    `- F1 (\`pg_get_userbyid(oid)\`): falso positivo confirmado pela auditoria; **não alterado** (P05, Q02 e P01 iguais à v${V103_PREVIOUS.version}).`,
    "",
    "| Ficheiro | Estado | sha256 v1.0.2 (16) | sha256 v1.0.3 (16) |",
    "|---|---|---|---|",
    ...rows,
    "",
    `## P02 por verificação (R4): ${P02_REPLACED_ID} substituída, ${P02_NEW_IDS.join(", ")} novas`,
    "",
    "| Id | Estado | Verificação |",
    "|---|---|---|",
    ...p2rows,
    "",
    `Verificações: P02 ${p2a.checks.length} → ${p2b.checks.length}. Todas as outras consultas P/Q mantêm o mesmo número e o mesmo texto.`,
    "",
  ].join("\n");
}

export function buildManifestV103(out: V101Output, queries: QueryFile[], r30: ReturnType<typeof buildR30>, allFiles: { path: string; content: Buffer }[]) {
  const byPath = new Map(allFiles.map((f) => [f.path, f.content]));
  const h = (p: string) => sha(byPath.get(p)!);
  const manifest = {
    package: "afonso-v2-staging-install",
    version: V103_VERSION,
    status: "AUDIT_ONLY — NOT EXECUTED anywhere (no database, disposable or managed; no rehearsal script run)",
    executed: false,
    rehearsal_authorized: false,
    gates: "G1–G4 NO-GO",
    target_project: { name: "AFONSO Staging", id: STAGING_PROJECT_ID },
    never_apply_to: "V1 / produção (nem a nenhum outro projeto)",
    supersedes: V103_PREVIOUS,
    source: { dump: SOURCE_DUMP.path, sha256: SOURCE_DUMP.sha256, rehearsal_commit: SOURCE_DUMP.commit, v100_sql: V100_SQL.map((s) => ({ file: `staging-install/migrations/${s.name}`, sha256: s.sha256 })) },
    preserved_from_previous: {
      migrations_byte_identical: Object.entries(V103_PRESERVED_SQL_SHA256).map(([n, s]) => ({ file: `sql/${n}`, sha256: s })),
      copied_handwritten: [...V103_COPIED_HANDWRITTEN],
      f1_pg_get_userbyid: "falso positivo (auditoria final v1.0.2); NÃO alterado",
    },
    evidence_status: {
      executor_effective_role: "PENDENTE — P01/P02 só mostram o dono histórico; exige evidência independente (inclui o caminho de unaccent)",
      functional_security: "NÃO ESTABELECIDA — APIs de servidor com verificação de sessão + has_staging_access não existem",
      auth_identities_read: "NÃO CONFIRMADA no staging — sem permissão, P04/P05/Q03 dão erro (bloqueio)",
      rehearsal_target: "R10–R41 preparados, NÃO executados; os scripts sozinhos NÃO provam isolamento",
      operator_preconditions: "E1–E9 POR VERIFICAR pelo operador (externas aos scripts)",
      unaccent_state_in_staging: "DESCONHECIDO até o P02 correr no staging (só leitura)",
      staging_0000_input: `sha256 integral NÃO registado (só prefixo ${STAGING_0000_INPUT.sha256Prefix}, snapshot ${STAGING_0000_INPUT.snapshotCommit})`,
    },
    rehearsal_plan: {
      status: "PLANO — NÃO AUTORIZADO, NÃO EXECUTADO",
      document: "REHEARSAL-PLAN.md",
      order: ["E1–E9 (operador)", "R10", "R20", "R40 (R41 + R30)", "B00", "B01 (+B01b se INSTALADA)", "0000 do staging (externo)", "B02", "R20", "P00–P04", "P05", "S4-00…S4-05 (uma transação por ficheiro)", "Q00–Q05", "R20", "T01 (separado, só descartável)", "R90 (descartar)"],
      on_any_error: "ABORTAR e DESCARTAR a instância inteira (R90); nunca corrigir e continuar",
    },
    migrations: out.migrations.map((m, i) => ({ order: i + 1, file: `sql/${m.name}`, sha256: h(`sql/${m.name}`), bytes: Buffer.byteLength(m.sql), statements: m.statements, one_migration_per_file: true, identical_to_previous: true })),
    queries: queries.map((q) => ({ file: `${q.dir}/${q.name}`, sha256: h(`${q.dir}/${q.name}`), kind: q.kind, checks: q.checks.length, baseline_items: q.baseline.length, read_only: true, fails_with_error: true, changed_from_previous: `${q.dir}/${q.name}` === V103_CHANGED_QUERY })),
    rehearsal_queries: [{ file: `ensaio/${r30.name}`, sha256: h(`ensaio/${r30.name}`), checks: r30.checks.length, read_only: true, fails_with_error: true, disposable_only: true }],
    blocked_sql: allFiles.filter((f) => /\.bloqueado\.sql$/.test(f.path)).map((f) => ({ file: f.path, sha256: sha(f.content), guarded: true, disposable_only: true })).sort((a, b) => (a.file < b.file ? -1 : 1)),
    scripts: allFiles.filter((f) => /^tools\/.*\.(sh|psql)$|^ensaio\/.*\.psql$/.test(f.path)).map((f) => ({ file: f.path, sha256: sha(f.content), executed: false, requires_authorization_argument: f.path.endsWith(".sh") && !f.path.endsWith("lib_ensaio.sh") })).sort((a, b) => (a.file < b.file ? -1 : 1)),
    quarantine: out.quarantine.map((q) => ({ file: `quarantine/${q.name}`, sha256: h(`quarantine/${q.name}`), items: q.items, executable: false })),
    static_audit: { options: AUDIT_OPTIONS_V102, violations: 0 },
    blockers: BLOCKERS_V103.map((b) => `${b.id} ${b.title}`),
    files: allFiles.filter((f) => f.path !== "MANIFEST.json" && f.path !== "SHA256SUMS").map((f) => ({ path: f.path, sha256: sha(f.content), bytes: f.content.length })).sort((a, b) => (a.path < b.path ? -1 : 1)),
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function buildSha256SumsV103(allFiles: { path: string; content: Buffer }[]): string {
  return allFiles.filter((f) => f.path !== "SHA256SUMS").sort((a, b) => (a.path < b.path ? -1 : 1)).map((f) => `${sha(f.content)}  ${f.path}`).join("\n") + "\n";
}
