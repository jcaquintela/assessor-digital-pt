// Gera (em memória) os ficheiros DERIVADOS do pacote v1.0.5 e o DIFF/MANIFEST/SHA256SUMS. Determinístico;
// não executa SQL nem scripts. Os derivados vêm do MESMO montador da v1.0.4 (byte a byte iguais), exceto o
// BLOCKERS.md, gerado de BLOCKERS_V105.
import { createHash } from "node:crypto";
import { SOURCE_DUMP, STAGING_PROJECT_ID } from "../v101/rules";
import type { GeneratedFile } from "../v102/package";
import { generateDerivedFilesV104 } from "../v104/package";
import { OPERATOR_OBLIGATIONS, SESSION_STEPS } from "../v104/rules";
import { BLOCKERS_V105, FINDINGS_V105, RESIDUAL_RISKS_V105, STAGING_0000_INPUT_V105, V105_CHANGED_HANDWRITTEN, V105_NEW, V105_PRESERVED_SQL_SHA256, V105_PREVIOUS, V105_RETIRED, V105_VERSION } from "./rules";

export const PACKAGE_DIR_V105 = `staging-install/package/v${V105_VERSION}`;
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

export function generateDerivedFilesV105(input: { dump: string; v100: { name: string; sql: string }[] }) {
  const base = generateDerivedFilesV104(input);
  const files: GeneratedFile[] = base.files.filter((f) => f.path !== "BLOCKERS.md");
  for (const [name, h] of Object.entries(V105_PRESERVED_SQL_SHA256)) {
    const f = files.find((x) => x.path === `sql/${name}`);
    if (!f || sha(f.content) !== h) throw new Error(`v1.0.5: sql/${name} deixou de ser byte a byte o auditado`);
  }
  files.push({ path: "BLOCKERS.md", content: [
    `# Bloqueios e ambiguidades — v${V105_VERSION} (gerado de BLOCKERS_V105)`,
    "",
    "Nenhum destes pontos foi \"resolvido\" por simulação. Nada foi executado. G1–G4 continuam NO-GO; o ensaio não tem GO.",
    "",
    "| # | Bloqueio | Impacto | O que falta | Estado |",
    "|---|---|---|---|---|",
    ...BLOCKERS_V105.map((b) => `| ${b.id} | **${b.title}** | ${b.impact} | ${b.missing} | ABERTO |`),
    "",
  ].join("\n") });
  return { files, out: base.out, queries: base.queries, r30: base.r30, r31: base.r31, r32: base.r32 };
}

const DIFF_EXCLUDED = new Set(["MANIFEST.json", "SHA256SUMS", "DIFF-v1.0.3.md", "DIFF-v1.0.4.md"]);

export function buildDiffV105(prevSums: string, files: { path: string; content: Buffer }[]): string {
  const prev = new Map(prevSums.trim().split("\n").map((l) => [l.slice(66), l.slice(0, 64)] as const).filter(([p]) => !DIFF_EXCLUDED.has(p)));
  const cur = new Map(files.filter((f) => !DIFF_EXCLUDED.has(f.path)).map((f) => [f.path, sha(f.content)] as const));
  const all = [...new Set([...prev.keys(), ...cur.keys()])].sort();
  const state = (p: string) => (!prev.has(p) ? "NOVO" : !cur.has(p) ? "RETIRADO" : prev.get(p) === cur.get(p) ? "idêntico" : "ALTERADO");
  const count = (s: string) => all.filter((p) => state(p) === s).length;
  const sqlSame = Object.keys(V105_PRESERVED_SQL_SHA256).every((n) => state(`sql/${n}`) === "idêntico");
  const e0000 = state(STAGING_0000_INPUT_V105.packagedPath) === "idêntico";
  return [
    `# Diferenças v${V105_PREVIOUS.version} → v${V105_VERSION} (gerado; nada executado)`,
    "",
    `Comparação ficheiro a ficheiro com o \`SHA256SUMS\` da v${V105_PREVIOUS.version} (commit \`${V105_PREVIOUS.commit}\`). MANIFEST, SHA256SUMS e os ficheiros DIFF ficam de fora.`,
    "",
    `- **Migrações S4-00…S4-05: ${sqlSame ? "6/6 idênticas byte a byte" : "DIFERENTES — ERRO"}** (com os REVOKE e o acesso só pelo servidor).`,
    `- **Entrada 0000 autenticada: ${e0000 ? "idêntica byte a byte" : "DIFERENTE — ERRO"}**.`,
    `- Idênticos: ${count("idêntico")} · alterados: ${count("ALTERADO")} · novos: ${count("NOVO")} · retirados: ${count("RETIRADO")}.`,
    "",
    `| Ficheiro | Estado | sha256 v${V105_PREVIOUS.version} (16) | sha256 v${V105_VERSION} (16) |`,
    "|---|---|---|---|",
    ...all.map((p) => `| ${p} | ${state(p)} | ${prev.get(p)?.slice(0, 16) ?? "—"} | ${cur.get(p)?.slice(0, 16) ?? "—"} |`),
    "",
  ].join("\n");
}

export function buildManifestV105(allFiles: { path: string; content: Buffer }[]) {
  const byPath = new Map(allFiles.map((f) => [f.path, f.content]));
  const h = (p: string) => { const c = byPath.get(p); if (!c) throw new Error(`v1.0.5: falta ${p}`); return sha(c); };
  const manifest = {
    package: "afonso-v2-staging-install",
    version: V105_VERSION,
    status: "AUDIT_ONLY — NOT EXECUTED anywhere (no SQL, no database disposable or managed, no rehearsal script, no psql script run)",
    executed: false,
    rehearsal_authorized: false,
    rehearsal_go: false,
    gates: "G1–G4 NO-GO",
    target_project: { name: "AFONSO Staging", id: STAGING_PROJECT_ID },
    never_apply_to: "V1 / produção (nem a nenhum outro projeto)",
    supersedes: V105_PREVIOUS,
    source: { dump: SOURCE_DUMP.path, sha256: SOURCE_DUMP.sha256, rehearsal_commit: SOURCE_DUMP.commit },
    preserved_from_previous: {
      migrations_byte_identical: Object.entries(V105_PRESERVED_SQL_SHA256).map(([n, s]) => ({ file: `sql/${n}`, sha256: s })),
      staging_0000_input_byte_identical: { file: STAGING_0000_INPUT_V105.packagedPath, sha256: STAGING_0000_INPUT_V105.sha256Full, git_blob: STAGING_0000_INPUT_V105.gitBlob, state: STAGING_0000_INPUT_V105.state, caveat: STAGING_0000_INPUT_V105.caveat },
      f1_pg_get_userbyid: "válido; NÃO alterado",
    },
    changed_files: [...V105_CHANGED_HANDWRITTEN, "BLOCKERS.md"].sort(),
    new_files: [...V105_NEW].sort(),
    retired_files: [...V105_RETIRED],
    audit_findings: FINDINGS_V105.map((f) => ({ id: f.id, status: "corrigido — NÃO executado", proof: f.prova })),
    residual_risks: RESIDUAL_RISKS_V105.map((r) => `${r.id} ${r.text}`),
    static_regression_test: { file: "verificacao/V01_regressao_estatica.mjs", sha256: h("verificacao/V01_regressao_estatica.mjs"), evidence: "evidence/regressao-estatica.txt", evidence_sha256: h("evidence/regressao-estatica.txt"), command: "node verificacao/V01_regressao_estatica.mjs <pasta-do-pacote>", reads_only: true },
    evidence_status: {
      operator_obligations: `${OPERATOR_OBLIGATIONS.join(", ")} POR CUMPRIR pelo operador; o R10 confere forma + integridade de 10 artefactos, não a verdade`,
      rehearsal_target: "R05–R90 preparados, NÃO executados; os scripts sozinhos NÃO provam isolamento",
      staging_0000_input: `${STAGING_0000_INPUT_V105.state} — igual à v1.0.4; correspondência com a BD real do staging NÃO verificada`,
    },
    session_steps: SESSION_STEPS.map((s) => ({ ...s })),
    scripts: allFiles.filter((f) => /^tools\/.*\.(sh|psql)$|^ensaio\/.*\.psql$|^verificacao\/.*\.mjs$/.test(f.path)).map((f) => ({ file: f.path, sha256: sha(f.content), executed: false })).sort((a, b) => (a.file < b.file ? -1 : 1)),
    blockers: BLOCKERS_V105.map((b) => `${b.id} ${b.title}`),
    files: allFiles.filter((f) => f.path !== "MANIFEST.json" && f.path !== "SHA256SUMS").map((f) => ({ path: f.path, sha256: sha(f.content), bytes: f.content.length })).sort((a, b) => (a.path < b.path ? -1 : 1)),
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function buildSha256SumsV105(allFiles: { path: string; content: Buffer }[]): string {
  return allFiles.filter((f) => f.path !== "SHA256SUMS").sort((a, b) => (a.path < b.path ? -1 : 1)).map((f) => `${sha(f.content)}  ${f.path}`).join("\n") + "\n";
}
