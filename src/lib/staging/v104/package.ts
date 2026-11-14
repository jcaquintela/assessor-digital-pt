// Gera (em memória) os ficheiros DERIVADOS do pacote v1.0.4. Determinístico; não executa SQL nem scripts.
// S4-00…S4-05, quarentena, ACCESS-MATRIX e todas as P/Q exceto o P02 saem do MESMO montador da v1.0.3 e
// têm de ser byte a byte os da v1.0.3 (hashes S4 presos em rules.ts). Os ficheiros escritos à mão (tools/,
// ensaio/*.psql, B*, T01, entradas/, operador/, documentos) vivem na pasta do pacote e entram no MANIFEST.

import { createHash } from "node:crypto";
import { SOURCE_DUMP, STAGING_PROJECT_ID, V100_SQL } from "../v101/rules";
import type { V101Output } from "../v101/build";
import { AUDIT_OPTIONS_V102, type GeneratedFile } from "../v102/package";
import type { QueryFile } from "../v102/queries";
import { generateDerivedFilesV103 } from "../v103/package";
import { buildP02V104, buildR30V104, buildR31, buildR32, P02_V104_NEW, P02_V104_REPLACED } from "./queries";
import { BLOCKERS_V104, OPERATOR_OBLIGATIONS, SESSION_STEPS, STAGING_0000_INPUT_V104, V104_CHANGED_QUERY, V104_COPIED_HANDWRITTEN, V104_PRESERVED_SQL_SHA256, V104_PREVIOUS, V104_VERSION } from "./rules";

export const PACKAGE_DIR_V104 = `staging-install/package/v${V104_VERSION}`;
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

const copiedDerived = (p: string) => p.startsWith("sql/") || p.startsWith("quarantine/") || (/^(preflight|posflight)\//.test(p) && p !== V104_CHANGED_QUERY) || p === "ACCESS-MATRIX.md";

export type SessionQuery = ReturnType<typeof buildR31>;

export function generateDerivedFilesV104(input: { dump: string; v100: { name: string; sql: string }[] }) {
  const base = generateDerivedFilesV103(input);
  const prevP02 = base.queries.find((q) => `${q.dir}/${q.name}` === V104_CHANGED_QUERY)!;
  const p02 = buildP02V104(prevP02);
  const r30 = buildR30V104();
  const r31 = buildR31();
  const r32 = buildR32();
  const queries = base.queries.map((q) => (q === prevP02 ? p02 : q));
  const files: GeneratedFile[] = [];
  for (const f of base.files) {
    if (f.path === V104_CHANGED_QUERY) files.push({ path: f.path, content: p02.sql });
    else if (copiedDerived(f.path)) files.push(f);
  }
  for (const [name, h] of Object.entries(V104_PRESERVED_SQL_SHA256)) {
    const f = files.find((x) => x.path === `sql/${name}`);
    if (!f || sha(f.content) !== h) throw new Error(`v1.0.4: sql/${name} deixou de ser byte a byte o auditado`);
  }
  if (files.filter((f) => f.path.startsWith("sql/")).length !== 6) throw new Error("v1.0.4: esperadas 6 migrações");
  files.push({ path: `ensaio/${r30.name}`, content: r30.sql });
  files.push({ path: `ensaio/${r31.name}`, content: r31.sql });
  files.push({ path: `ensaio/${r32.name}`, content: r32.sql });
  files.push({ path: "BLOCKERS.md", content: [
    `# Bloqueios e ambiguidades — v${V104_VERSION} (gerado de BLOCKERS_V104)`,
    "",
    "Nenhum destes pontos foi \"resolvido\" por simulação. Nada foi executado. G1–G4 continuam NO-GO; o ensaio não tem GO.",
    "",
    "| # | Bloqueio | Impacto | O que falta | Estado |",
    "|---|---|---|---|---|",
    ...BLOCKERS_V104.map((b) => `| ${b.id} | **${b.title}** | ${b.impact} | ${b.missing} | ABERTO |`),
    "",
  ].join("\n") });
  return { files, out: base.out, queries, prevQueries: base.queries, r30, r31, r32, prevR30: base.r30 };
}

const DIFF_EXCLUDED = new Set(["MANIFEST.json", "SHA256SUMS", `DIFF-v${V104_PREVIOUS.version}.md`, "DIFF-v1.0.2.md"]);

export function buildDiffV104(prevSums: string, files: { path: string; content: Buffer }[], prevQueries: QueryFile[], queries: QueryFile[]): string {
  const prev = new Map(prevSums.trim().split("\n").map((l) => [l.slice(66), l.slice(0, 64)] as const).filter(([p]) => !DIFF_EXCLUDED.has(p)));
  const cur = new Map(files.filter((f) => !DIFF_EXCLUDED.has(f.path)).map((f) => [f.path, sha(f.content)] as const));
  const all = [...new Set([...prev.keys(), ...cur.keys()])].sort();
  const state = (p: string) => (!prev.has(p) ? "NOVO" : !cur.has(p) ? "RETIRADO" : prev.get(p) === cur.get(p) ? "idêntico" : "ALTERADO");
  const rows = all.map((p) => `| ${p} | ${state(p)} | ${prev.get(p)?.slice(0, 16) ?? "—"} | ${cur.get(p)?.slice(0, 16) ?? "—"} |`);
  const count = (s: string) => all.filter((p) => state(p) === s).length;
  const p2a = prevQueries.find((q) => `${q.dir}/${q.name}` === V104_CHANGED_QUERY)!;
  const p2b = queries.find((q) => `${q.dir}/${q.name}` === V104_CHANGED_QUERY)!;
  const byId = new Map(p2a.checks.map((c) => [c.id, c]));
  const p2rows = p2b.checks.map((c) => `| ${c.id} | ${!byId.has(c.id) ? "NOVA" : byId.get(c.id)!.ok === c.ok && byId.get(c.id)!.label === c.label ? "idêntica" : "SUBSTITUÍDA"} | ${c.label.replace(/\|/g, "/")} |`);
  const sqlSame = Object.keys(V104_PRESERVED_SQL_SHA256).every((n) => state(`sql/${n}`) === "idêntico");
  return [
    `# Diferenças v${V104_PREVIOUS.version} → v${V104_VERSION} (gerado; nada executado)`,
    "",
    `Comparação ficheiro a ficheiro com o \`SHA256SUMS\` da v${V104_PREVIOUS.version} (commit \`${V104_PREVIOUS.commit}\`). MANIFEST, SHA256SUMS e os ficheiros DIFF ficam de fora.`,
    "",
    `- **Migrações S4-00…S4-05: ${sqlSame ? "6/6 idênticas byte a byte" : "DIFERENTES — ERRO"}** (com os REVOKE e o acesso só pelo servidor).`,
    `- Idênticos: ${count("idêntico")} · alterados: ${count("ALTERADO")} · novos: ${count("NOVO")} · retirados: ${count("RETIRADO")}.`,
    `- F1 (\`pg_get_userbyid(oid)\`): válido; **não alterado** (P01, P05 e Q02 iguais à v${V104_PREVIOUS.version}).`,
    "",
    `| Ficheiro | Estado | sha256 v${V104_PREVIOUS.version} (16) | sha256 v${V104_VERSION} (16) |`,
    "|---|---|---|---|",
    ...rows,
    "",
    `## P02 por verificação (P1, P2): ${P02_V104_REPLACED.join(", ")} substituída, ${P02_V104_NEW.join(", ")} nova`,
    "",
    "| Id | Estado | Verificação |",
    "|---|---|---|",
    ...p2rows,
    "",
    `Verificações: P02 ${p2a.checks.length} → ${p2b.checks.length}. Todas as outras consultas P/Q mantêm o mesmo número e o mesmo texto.`,
    "",
  ].join("\n");
}

export function buildManifestV104(out: V101Output, queries: QueryFile[], session: { name: string; checks: unknown[] }[], allFiles: { path: string; content: Buffer }[]) {
  const byPath = new Map(allFiles.map((f) => [f.path, f.content]));
  const h = (p: string) => sha(byPath.get(p)!);
  const manifest = {
    package: "afonso-v2-staging-install",
    version: V104_VERSION,
    status: "AUDIT_ONLY — NOT EXECUTED anywhere (no SQL, no database disposable or managed, no rehearsal script, no psql script run)",
    executed: false,
    rehearsal_authorized: false,
    rehearsal_go: false,
    gates: "G1–G4 NO-GO",
    target_project: { name: "AFONSO Staging", id: STAGING_PROJECT_ID },
    never_apply_to: "V1 / produção (nem a nenhum outro projeto)",
    supersedes: V104_PREVIOUS,
    source: { dump: SOURCE_DUMP.path, sha256: SOURCE_DUMP.sha256, rehearsal_commit: SOURCE_DUMP.commit, v100_sql: V100_SQL.map((s) => ({ file: `staging-install/migrations/${s.name}`, sha256: s.sha256 })) },
    preserved_from_previous: {
      migrations_byte_identical: Object.entries(V104_PRESERVED_SQL_SHA256).map(([n, s]) => ({ file: `sql/${n}`, sha256: s })),
      copied_handwritten: [...V104_COPIED_HANDWRITTEN],
      f1_pg_get_userbyid: "válido; NÃO alterado",
    },
    evidence_status: {
      executor_effective_role: "PENDENTE — P01/P02 só mostram o dono histórico; exige evidência independente (inclui o caminho de unaccent)",
      functional_security: "NÃO ESTABELECIDA — APIs de servidor com verificação de sessão + has_staging_access não existem",
      auth_identities_read: "NÃO CONFIRMADA no staging — sem permissão, P04/P05/Q03 dão erro (bloqueio)",
      rehearsal_target: "R05–R90 preparados, NÃO executados; os scripts sozinhos NÃO provam isolamento",
      operator_obligations: `${OPERATOR_OBLIGATIONS.join(", ")} POR CUMPRIR pelo operador; o R10 recusa sem ficha completa (só confere forma, não verdade)`,
      unaccent_state_in_staging: "DESCONHECIDO até o P02 correr no staging (só leitura)",
      staging_0000_input: `${STAGING_0000_INPUT_V104.state} — metadados registados, BYTES ORIGINAIS NÃO OBTIDOS (nenhum ficheiro incluído nem reconstruído); bootstrap alternativo: nenhum`,
    },
    staging_0000_input: {
      state: STAGING_0000_INPUT_V104.state,
      bytes_obtained: STAGING_0000_INPUT_V104.bytesObtained,
      included_in_package: false,
      file: STAGING_0000_INPUT_V104.file,
      git_commit: STAGING_0000_INPUT_V104.gitCommit,
      git_blob: STAGING_0000_INPUT_V104.gitBlob,
      sha256: STAGING_0000_INPUT_V104.sha256Full,
      bytes: STAGING_0000_INPUT_V104.bytes,
      lines: STAGING_0000_INPUT_V104.lines,
      trailing_newline: STAGING_0000_INPUT_V104.trailingNewline,
      metadata_source: STAGING_0000_INPUT_V104.metadataSource,
      previous_snapshot_reference: STAGING_0000_INPUT_V104.previousSnapshotRef,
      caveat: STAGING_0000_INPUT_V104.caveat,
      next_step: "transferência autorizada dos bytes originais do repositório do staging; conferência sha256 + blob + tamanho + linhas + sem LF final; só então estado=AUTENTICADO",
    },
    rehearsal_plan: {
      status: "PLANO — NÃO AUTORIZADO, NÃO EXECUTADO, SEM GO",
      document: "REHEARSAL-PLAN.md",
      order: ["E1–E10 (operador, ficha de evidência)", "R05 (entrada 0000; hoje recusa: PENDENTE)", "R10", "R20", ...SESSION_STEPS.map((s) => `R40 ${s.passo}${s.variante ? " (só INSTALADA)" : ""}`), "R90 (descartar; INCERTEZA => destruir a máquina)"],
      session_wrapper: "tools/R40_sessao.sh — único caminho para abrir sessões; por sessão: R20 + R41 + R31 (+R32 se superutilizador) antes e R31 + mesmo PID depois",
      on_any_error: "ABORTAR e DESCARTAR a instância inteira (R90); nunca corrigir e continuar",
    },
    session_steps: SESSION_STEPS.map((s) => ({ ...s })),
    migrations: out.migrations.map((m, i) => ({ order: i + 1, file: `sql/${m.name}`, sha256: h(`sql/${m.name}`), bytes: Buffer.byteLength(m.sql), statements: m.statements, one_migration_per_file: true, identical_to_previous: true })),
    queries: queries.map((q) => ({ file: `${q.dir}/${q.name}`, sha256: h(`${q.dir}/${q.name}`), kind: q.kind, checks: q.checks.length, baseline_items: q.baseline.length, read_only: true, fails_with_error: true, changed_from_previous: `${q.dir}/${q.name}` === V104_CHANGED_QUERY })),
    rehearsal_queries: session.map((r) => ({ file: `ensaio/${r.name}`, sha256: h(`ensaio/${r.name}`), checks: r.checks.length, read_only: true, fails_with_error: true, disposable_only: true })),
    blocked_sql: allFiles.filter((f) => /\.bloqueado\.sql$/.test(f.path)).map((f) => ({ file: f.path, sha256: sha(f.content), guarded: true, disposable_only: true })).sort((a, b) => (a.file < b.file ? -1 : 1)),
    scripts: allFiles.filter((f) => /^tools\/.*\.(sh|psql)$|^ensaio\/.*\.psql$/.test(f.path)).map((f) => ({ file: f.path, sha256: sha(f.content), executed: false })).sort((a, b) => (a.file < b.file ? -1 : 1)),
    quarantine: out.quarantine.map((q) => ({ file: `quarantine/${q.name}`, sha256: h(`quarantine/${q.name}`), items: q.items, executable: false })),
    static_audit: { options: AUDIT_OPTIONS_V102, violations: 0 },
    blockers: BLOCKERS_V104.map((b) => `${b.id} ${b.title}`),
    files: allFiles.filter((f) => f.path !== "MANIFEST.json" && f.path !== "SHA256SUMS").map((f) => ({ path: f.path, sha256: sha(f.content), bytes: f.content.length })).sort((a, b) => (a.path < b.path ? -1 : 1)),
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function buildSha256SumsV104(allFiles: { path: string; content: Buffer }[]): string {
  return allFiles.filter((f) => f.path !== "SHA256SUMS").sort((a, b) => (a.path < b.path ? -1 : 1)).map((f) => `${sha(f.content)}  ${f.path}`).join("\n") + "\n";
}
