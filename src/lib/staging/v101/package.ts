// Gera (em memória) os ficheiros DERIVADOS do pacote v1.0.1. Determinístico: sem
// datas nem nada do ambiente. Os documentos escritos à mão vivem na pasta do pacote
// e entram no MANIFEST/SHA256SUMS. Não executa SQL.

import { createHash } from "node:crypto";
import { accessMatrix, auditMigrations, buildAccessModel, PRINCIPALS } from "./audit";
import { buildV101, type V101Output } from "./build";
import { buildQueries } from "./queries";
import { SOURCE_DUMP, STAGING_PROJECT_ID, V100_SQL, V101_VERSION } from "./rules";
import { statementKind, splitStatements } from "./sql-split";

export const PACKAGE_DIR = `staging-install/package/v${V101_VERSION}`;
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

export const BLOCKERS = [
  "B1 NÃO ENSAIADO: a v1.0.1 não foi aplicada em nenhuma base (nem descartável), por instrução. A ordem e a validade do SQL estão verificadas só por análise estática. Aplicar exige primeiro um ensaio descartável com autorização separada.",
  "B2 EXECUTOR: BYPASSRLS e REFERENCES em auth.users do papel real das migrações só são inferidos do catálogo (P01/P02); não há prova definitiva sem escrever.",
  "B3 AMBIGUIDADE 'acesso somente via funções server-side autorizadas': aplicado no sentido mais estrito (nenhuma permissão direta de cliente em tabelas e funções V2). A app V2 ainda lê/escreve várias tabelas com a sessão do utilizador; no staging essas chamadas são recusadas até a app passar a usar o servidor (com verificação de has_staging_access) ou o proprietário aprovar uma lista de tabelas abertas.",
  "B4 ADMIN DO STAGING ≠ ADMIN V2: o papel admin do staging não dá super_admin/support_admin. Mapear um no outro é uma decisão de privilégios do proprietário; não feito.",
  "B5 PERFIL AUTOMÁTICO: o gatilho em auth.users que cria perfil/papel/categorias está em quarentena (QZ-02). Contas de teste novas não recebem perfil V2 sem autorização separada.",
  "B6 APAGAMENTO EM CASCATA: sem as 84 chaves para auth.users, apagar uma conta já não apaga em cascata as linhas V2 dessa conta. O apagamento tem de passar por um caminho explícito (por decidir) antes de haver dados de teste.",
  "B7 FICHEIROS E TEMPO REAL: sem bucket nem políticas de storage (QZ-04) e sem publicação Realtime (QZ-03). Essas funções não existem no staging até autorização.",
  "B8 TESTE COMPORTAMENTAL DA MATRIZ: tests-db/T01 está preparado mas bloqueado (escreve contas sintéticas numa transação com ROLLBACK). Só com autorização separada, e só numa base descartável ou no staging.",
  "B9 DIVERGÊNCIA INTENCIONAL: 6 valores por omissão de envio/sincronização passam a false no staging (diferente da V1).",
] as const;

export interface GeneratedFile { path: string; content: string }

export function generateDerivedFiles(input: { dump: string; v100: { name: string; sql: string }[] }): { files: GeneratedFile[]; out: V101Output } {
  const out = buildV101(input);
  const violations = auditMigrations(out.migrations);
  if (violations.length) throw new Error(`v1.0.1: auditoria estática com ${violations.length} violações: ${violations.slice(0, 3).map((v) => `${v.file}:${v.line} ${v.rule}`).join("; ")}`);
  const queries = buildQueries(out.facts);
  const matrix = accessMatrix(buildAccessModel(out.migrations));
  const matrixV100 = accessMatrix(buildAccessModel(input.v100, false));
  const files: GeneratedFile[] = [];
  for (const m of out.migrations) files.push({ path: `sql/${m.name}`, content: m.sql });
  for (const q of queries) files.push({ path: `${q.dir}/${q.name}`, content: q.sql });
  for (const q of out.quarantine) files.push({ path: `quarantine/${q.name}`, content: q.content });

  const f = out.facts;
  const row = (r: (typeof matrix)[number]) => `| ${r.principal} | ${r.tablesWithDirectAccess} | ${r.executableFunctions} | ${r.tablesUnderGate} | ${r.tablesIfGrantedToClient} |`;
  files.push({ path: "ACCESS-MATRIX.md", content: [
    `# Matriz de acesso — v${V101_VERSION} (gerada por análise estática; nada executado)`,
    "",
    "Modelo: parte do **pior caso** — PUBLIC, anon e authenticated com todas as permissões em cada objeto novo (como se o staging tivesse privilégios por omissão abertos) — e aplica, pela ordem dos ficheiros, os GRANT/REVOKE, o RLS, a barreira RESTRICTIVE e as políticas V2.",
    "",
    "- `sem papel`, `tester` e `admin` são o mesmo papel de base de dados (`authenticated`). Só `has_staging_access(auth.uid())` os distingue, e só atua através da barreira.",
    "- `service_role` ignora RLS (BYPASSRLS) e é o único com permissões diretas.",
    "",
    "| Quem | Tabelas V2 com acesso direto | Funções V2 executáveis | Tabelas V2 sob a barreira | Tabelas V2 em que passaria SE a tabela fosse aberta ao cliente |",
    "|---|---|---|---|---|",
    ...matrix.map(row),
    "",
    `Total: ${f.v2Tables.length} tabelas V2, ${f.v2Functions.length} funções V2.`,
    "",
    "**Leitura:** ninguém do lado do cliente chega a uma tabela ou função V2. Se um dia uma tabela for aberta a `authenticated` (decisão do proprietário, nova versão), a barreira continua a negar anónimos e contas sem papel; tester e admin ficam sujeitos às políticas V2 de cada tabela (linhas próprias; poderes de admin V2 exigem `super_admin`, que ninguém tem).",
    "",
    "## Comparação com a v1.0.0 (leitura aproximada do SQL antigo, mesmo pior caso)",
    "",
    "| Quem | Tabelas V2 com acesso direto | Funções V2 executáveis | Tabelas sob barreira | Se aberta ao cliente |",
    "|---|---|---|---|---|",
    ...matrixV100.map(row),
    "",
    "Na base, estes números confirmam-se só de leitura com `posflight/Q05_matriz_acesso.sql` e `posflight/Q02_seguranca.sql`. O teste comportamental (`tests-db/T01`) está preparado e bloqueado.",
    "",
  ].join("\n") });

  const kinds = (sql: string) => {
    const k: Record<string, number> = {};
    for (const s of splitStatements(sql)) { const x = statementKind(s.text); k[x] = (k[x] ?? 0) + 1; }
    return k;
  };
  const sum = (obj: Record<string, Record<string, number>>, keys: string[]) => Object.values(obj).reduce((a, c) => a + keys.reduce((b, k) => b + (c[k] ?? 0), 0), 0);
  const v101Kinds = Object.fromEntries(out.migrations.map((m) => [m.name, kinds(m.sql)]));
  const dmlCats = out.v100.dml.reduce<Record<string, number>>((a, d) => ((a[d.category] = (a[d.category] ?? 0) + 1), a), {});
  const line = (label: string, a: number | string, b: number | string) => `| ${label} | ${a} | ${b} |`;
  files.push({ path: "DIFF-v1.0.0.md", content: [
    `# Diferenças v1.0.0 → v${V101_VERSION} (gerado)`,
    "",
    `**Abordagem.** A v1.0.0 reproduzia o histórico de 184 migrações (com dados, reparos, DROP, RENAME e DROP NOT NULL). A v${V101_VERSION} parte do **estado final** do esquema (o \`pg_dump --schema-only\` do ensaio descartável autorizado, commit ${SOURCE_DUMP.commit}, sha256 \`${SOURCE_DUMP.sha256}\`) e só cria objetos.`,
    "",
    "| Medida | v1.0.0 | v1.0.1 |",
    "|---|---|---|",
    line("Ficheiros de migração", V100_SQL.length, out.migrations.length),
    line("Instruções no topo", sum(out.v100.perFile, Object.keys(Object.assign({}, ...Object.values(out.v100.perFile)))), Object.values(v101Kinds).reduce((a, c) => a + Object.values(c).reduce((x, y) => x + y, 0), 0)),
    line("INSERT / UPDATE / DELETE no topo", `${sum(out.v100.perFile, ["insert"])} / ${sum(out.v100.perFile, ["update"])} / ${sum(out.v100.perFile, ["delete"])}`, `${sum(v101Kinds, ["insert"])} / ${sum(v101Kinds, ["update"])} / ${sum(v101Kinds, ["delete"])}`),
    line("Blocos DO no topo", sum(out.v100.perFile, ["do"]), sum(v101Kinds, ["do"])),
    line("DROP / ALTER destrutivo (DROP COLUMN, RENAME, DROP NOT NULL, DROP CONSTRAINT…)", out.v100.destructive.length, 0),
    line("CREATE OR REPLACE", sum(out.v100.perFile, ["create_or_replace"]), sum(v101Kinds, ["create_or_replace"])),
    line("Referências a auth.users em chaves estrangeiras", out.v100.authUsersFks, f.keptAuthFks.length),
    line("GRANT a anon", out.v100.anonGrants, 0),
    line("Políticas para PUBLIC", out.v100.publicPolicies, 0),
    line("Tabelas V2 com barreira admin/tester", 0, f.v2Tables.length),
    line("Funções V2 executáveis por anon/authenticated (pior caso)", `${matrixV100[0].executableFunctions}/${matrixV100[1].executableFunctions}`, `${matrix[0].executableFunctions}/${matrix[1].executableFunctions}`),
    line("Gatilho em auth.users", 1, 0),
    line("Políticas em storage.objects", 4, 0),
    line("Publicação Realtime", 1, 0),
    line("Substitui has_role do staging", "sim", "não"),
    line("Políticas V2 acrescentadas a user_roles", 4, 0),
    line("Chave created_by → auth.users em user_roles", "sim", "não"),
    "",
    `## O que foi para a quarentena (não executável)`,
    "",
    ...out.quarantine.map((q) => `- \`quarantine/${q.name}\` — ${q.title}: ${q.items} itens.`),
    "",
    `Itens de dados da v1.0.0 por categoria: ${Object.entries(dmlCats).sort().map(([k, v]) => `${k} ${v}`).join(", ")}.`,
    "",
    "## Operações destrutivas da v1.0.0 que deixam de existir",
    "",
    "Num esquema criado já no estado final não há nada a apagar, renomear ou relaxar. Lista completa:",
    "",
    ...out.v100.destructive.map((d) => `- ${d.file}:${d.line} — \`${d.sql.replace(/`/g, "'")}\``),
    "",
    "## Chaves estrangeiras para auth.users retiradas",
    "",
    `${f.removedAuthFks.length} chaves (texto integral em \`quarantine/QZ-05\`). Fica só \`profiles.profiles_id_fkey\` (ON DELETE CASCADE). Por ação ao apagar a conta: ${Object.entries(f.removedAuthFks.reduce<Record<string, number>>((a, r) => ((a[r.onDelete] = (a[r.onDelete] ?? 0) + 1), a), {})).map(([k, v]) => `${k} ${v}`).join(", ")}.`,
    "",
    "## Valores por omissão alterados no staging (divergência intencional da V1)",
    "",
    ...f.defaultOverrides.map((o) => `- \`${o.table}.${o.column}\`: true → **false** (${o.reason}).`),
    "",
    "## Políticas V2 alteradas",
    "",
    ...f.policies.filter((p) => p.rewritten).map((p) => `- \`${p.table}\` · "${p.name}": papéis ${p.rewritten}.`),
    ...(f.droppedPolicies.length ? f.droppedPolicies.map((p) => `- retirada \`${p.table}\` · "${p.name}" (${p.reason}).`) : []),
    `- ${f.v2Tables.length} políticas novas \`staging_gate_admin_tester\` (RESTRICTIVE), uma por tabela V2.`,
    "",
  ].join("\n") });

  // ---------- manifesto (sem si próprio e sem SHA256SUMS) ----------
  return { files, out };
}

export function buildManifest(out: V101Output, allFiles: { path: string; content: Buffer }[]) {
  const queries = buildQueries(out.facts);
  const matrix = accessMatrix(buildAccessModel(out.migrations));
  const byPath = new Map(allFiles.map((f) => [f.path, f.content]));
  const h = (p: string) => sha(byPath.get(p)!);
  const manifest = {
    package: "afonso-v2-staging-install",
    version: V101_VERSION,
    status: "AUDIT_ONLY — NOT EXECUTED anywhere (no database, disposable or managed)",
    executed: false,
    gates: "G1–G4 NO-GO",
    target_project: { name: "AFONSO Staging", id: STAGING_PROJECT_ID },
    never_apply_to: "V1 / produção (nem a nenhum outro projeto)",
    supersedes: { version: "1.0.0", commit: "cc20a982" },
    source: { dump: SOURCE_DUMP.path, sha256: SOURCE_DUMP.sha256, rehearsal_commit: SOURCE_DUMP.commit, v100_sql: V100_SQL.map((s) => ({ file: `staging-install/migrations/${s.name}`, sha256: s.sha256 })) },
    migrations: out.migrations.map((m, i) => ({ order: i + 1, file: `sql/${m.name}`, sha256: h(`sql/${m.name}`), bytes: Buffer.byteLength(m.sql), statements: m.statements, one_migration_per_file: true })),
    queries: queries.map((q) => ({ file: `${q.dir}/${q.name}`, sha256: h(`${q.dir}/${q.name}`), checks: q.checks.length, read_only: true, fails_with_error: true })),
    quarantine: out.quarantine.map((q) => ({ file: `quarantine/${q.name}`, sha256: h(`quarantine/${q.name}`), items: q.items, executable: false })),
    counts: {
      v2_tables: out.facts.v2Tables.length, v2_functions: out.facts.v2Functions.length, v2_types: out.facts.v2Types.length,
      v2_policies: out.facts.policies.filter((p) => p.origin === "v2").length, gate_policies: out.facts.policies.filter((p) => p.origin === "gate").length,
      triggers: out.facts.triggers.length, indexes: out.facts.indexes.length, constraints: out.facts.constraints.length,
      auth_users_fks_kept: out.facts.keptAuthFks, auth_users_fks_removed: out.facts.removedAuthFks.length,
      default_overrides: out.facts.defaultOverrides.map((o) => `${o.table}.${o.column}`),
    },
    static_audit: { violations: 0, matrix: Object.fromEntries(PRINCIPALS.map((p, i) => [p, matrix[i]])) },
    blockers: BLOCKERS,
    files: allFiles.filter((f) => f.path !== "MANIFEST.json" && f.path !== "SHA256SUMS").map((f) => ({ path: f.path, sha256: sha(f.content), bytes: f.content.length })).sort((a, b) => (a.path < b.path ? -1 : 1)),
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function buildSha256Sums(allFiles: { path: string; content: Buffer }[]): string {
  return allFiles
    .filter((f) => f.path !== "SHA256SUMS")
    .sort((a, b) => (a.path < b.path ? -1 : 1))
    .map((f) => `${sha(f.content)}  ${f.path}`)
    .join("\n") + "\n";
}
