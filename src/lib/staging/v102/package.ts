// Gera (em memória) os ficheiros DERIVADOS do pacote v1.0.2. Determinístico: sem datas nem
// nada do ambiente. Os documentos escritos à mão vivem na pasta do pacote e entram no
// MANIFEST/SHA256SUMS. Não executa SQL.

import { createHash } from "node:crypto";
import { accessMatrix, auditMigrations, buildAccessModel, PRINCIPALS, serverAcl, type AuditOptions } from "../v101/audit";
import { buildV101, type V101Output } from "../v101/build";
import { buildQueries as buildQueriesV101 } from "../v101/queries";
import { SOURCE_DUMP, STAGING_PROJECT_ID, V100_SQL } from "../v101/rules";
import { statementKind, splitStatements } from "../v101/sql-split";
import { buildQueriesV102, PLACEHOLDERS, type QueryFile } from "./queries";
import { SERVER_FUNCTION_PRIVS_EXACT, SERVER_TABLE_PRIVS_EXACT, V102_PREVIOUS, V102_PROFILE, V102_VERSION } from "./rules";

export const PACKAGE_DIR_V102 = `staging-install/package/v${V102_VERSION}`;
export const AUDIT_OPTIONS_V102: AuditOptions = { serverAclExact: true, stagingSafeFunctions: true };
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

export interface Blocker { id: string; title: string; impact: string; missing: string; resolved: false }

/** Nenhum destes pontos está resolvido; cada um diz o que falta. */
export const BLOCKERS_V102: readonly Blocker[] = [
  { id: "B1", title: "NÃO ENSAIADO: a v1.0.2 não foi aplicada em nenhuma base (nem descartável), por instrução", impact: "Ordem e validade provadas só por análise estática e pelo parser oficial (sintaxe). Erros que só uma base deteta não estão excluídos", missing: "Autorização separada para um ensaio descartável (S4-00…S4-05 + P00–P05 + Q00–Q05 + T01), com o alvo verificado fora do SQL (B12)", resolved: false },
  { id: "B2", title: "EXECUTOR EFETIVO NÃO PROVADO: P01/P02 só mostram o DONO HISTÓRICO dos objetos da migração 0000", impact: "O papel que a ferramenta de migrações do staging vai usar pode ser outro; os privilégios lidos em P02 podem não ser os dele", missing: "Evidência INDEPENDENTE do papel efetivo (declaração/registo da plataforma ou ensaio com a mesma ferramenta e o mesmo papel). Nenhum resultado foi inventado: estado PENDENTE (EXECUTOR-PRIVILEGES.md)", resolved: false },
  { id: "B3", title: "SEGURANÇA FUNCIONAL NÃO ESTABELECIDA: acesso V2 só pelo servidor, mas as APIs de servidor com verificação de sessão + has_staging_access AINDA NÃO EXISTEM", impact: "Os REVOKE mantêm-se (nenhum acesso direto de cliente). A app V2 ainda usa a sessão do utilizador em várias tabelas: no staging essas chamadas são recusadas. service_role ignora a barreira (BYPASSRLS), logo qualquer código de servidor que use service_role tem de verificar sessão + has_staging_access ele próprio", missing: "Escrever e auditar essas APIs de servidor (decisão do proprietário). Até lá, o pacote prova só privilégios da base, não segurança funcional", resolved: false },
  { id: "B4", title: "ADMIN DO STAGING ≠ ADMIN V2: nenhuma elevação automática", impact: "A consola de administração V2 não funciona no staging", missing: "Decisão de privilégios do proprietário (quem recebe super_admin/support_admin, e como)", resolved: false },
  { id: "B5", title: "PERFIL AUTOMÁTICO EM QUARENTENA: gatilho em auth.users (QZ-02) e a função handle_new_user (QZ-06)", impact: "Contas de teste novas não recebem perfil, papel consultant nem categorias V2", missing: "Autorização separada + TRIGGER em auth.users + versão que não escreva em user_roles do staging", resolved: false },
  { id: "B6", title: "SEM APAGAMENTO EM CASCATA (84 chaves para auth.users retiradas)", impact: "Apagar uma conta não apaga as linhas V2 dela", missing: "Definir o caminho de apagamento antes de haver dados de teste", resolved: false },
  { id: "B7", title: "SEM FICHEIROS NEM TEMPO REAL (QZ-03, QZ-04)", impact: "Essas funções não existem no staging", missing: "Reescrever com a barreira / só servidor e autorizar", resolved: false },
  { id: "B8", title: "TESTE COMPORTAMENTAL BLOQUEADO (tests-db/T01)", impact: "A matriz está provada estaticamente e confirmável só de leitura (Q02/Q05), não com sessões reais", missing: "Autorização separada (escreve dados sintéticos numa transação com ROLLBACK)", resolved: false },
  { id: "B9", title: "VALORES POR OMISSÃO DESLIGADOS NÃO IMPEDEM ATIVAÇÕES FUTURAS", impact: "6 valores por omissão de envio/sincronização são false e nenhuma linha é escrita, mas o esquema não proíbe que o servidor (service_role) ou o dono insira/atualize linhas a true, ligue interruptores ou configure envios depois. Diverge da V1 de propósito", missing: "Controlo de processo: qualquer ativação é uma decisão separada do proprietário; ensaio só com dados sintéticos (@afonso-staging.invalid), nunca reais", resolved: false },
  { id: "B10", title: "FUSÃO DE CONTAS INDISPONÍVEL: merge_accounts_apply e merge_accounts_preview em quarentena (QZ-06)", impact: "A fusão de contas da consola V2 falha no staging. Era a função que descobria todas as tabelas com user_id (incluindo user_roles) e podia mover ou apagar o papel admin", missing: "Se um dia for precisa: reescrita com allowlist explícita que exclua user_roles, staging_notes e perfis/papéis protegidos, com verificação de autorização dentro da função, autorização separada e nova versão", resolved: false },
  { id: "B11", title: "LEITURA DE auth.identities NÃO CONFIRMADA no staging", impact: "P04, P05 e Q03 leem auth.identities. Se a sessão de leitura do staging não tiver permissão, dão ERRO: a comparação de identidades fica por fazer e a conta NÃO conta como verificada", missing: "Confirmar a permissão de leitura no staging (só leitura). Se não existir: BLOQUEIO; não retirar a verificação", resolved: false },
  { id: "B12", title: "ALVO DO ENSAIO VERIFICADO FORA DO SQL: procedimento preparado, NÃO executado", impact: "P00/Q00 só leem marcas dentro da base e não provam qual é o servidor", missing: "No ensaio: correr tools/rehearsal_target_check.sh (sem credenciais, sem rede, sem integrações) antes de qualquer SQL, com autorização separada", resolved: false },
];

export interface GeneratedFile { path: string; content: string }

function v101Reference(input: { dump: string; v100: { name: string; sql: string }[] }) {
  const out = buildV101(input);
  return { out, queries: buildQueriesV101(out.facts) };
}

/** Linhas da v1.0.1 cujo "ok" só testa se um hash calculado tem forma de hash (sempre verdadeiro se não for NULL). */
export function tautologicalChecksV101(queries: { name: string; checks: { id: string; ok: string }[] }[]): string[] {
  return queries.flatMap((q) => q.checks.filter((c) => /^\(?(SELECT )?md5\(/.test(c.ok) && /~ '\^\[0-9a-f\]\{32\}\$'$/.test(c.ok)).map((c) => c.id));
}

export function generateDerivedFilesV102(input: { dump: string; v100: { name: string; sql: string }[] }): { files: GeneratedFile[]; out: V101Output; queries: QueryFile[] } {
  const out = buildV101(input, V102_PROFILE);
  const violations = auditMigrations(out.migrations, AUDIT_OPTIONS_V102);
  if (violations.length) throw new Error(`v1.0.2: auditoria estática com ${violations.length} violações: ${violations.slice(0, 3).map((v) => `${v.file}:${v.line} ${v.rule}`).join("; ")}`);
  const queries = buildQueriesV102(out.facts);
  const model = buildAccessModel(out.migrations);
  const matrix = accessMatrix(model);
  const acl = serverAcl(model);
  const prev = v101Reference(input);
  const prevModel = buildAccessModel(prev.out.migrations);
  const prevAcl = serverAcl(prevModel);
  const files: GeneratedFile[] = [];
  for (const m of out.migrations) files.push({ path: `sql/${m.name}`, content: m.sql });
  for (const q of queries) files.push({ path: `${q.dir}/${q.name}`, content: q.sql });
  for (const q of out.quarantine) files.push({ path: `quarantine/${q.name}`, content: q.content });

  const f = out.facts;
  const exactT = Object.values(acl.tables).filter((p) => p.join(",") === SERVER_TABLE_PRIVS_EXACT.join(",")).length;
  const prevExactT = Object.values(prevAcl.tables).filter((p) => p.join(",") === SERVER_TABLE_PRIVS_EXACT.join(",")).length;
  const prevAllT = Object.values(prevAcl.tables).filter((p) => p.includes("ALL")).length;
  const row = (r: (typeof matrix)[number]) => `| ${r.principal} | ${r.tablesWithDirectAccess} | ${r.executableFunctions} | ${r.tablesUnderGate} | ${r.tablesIfGrantedToClient} |`;
  files.push({ path: "ACCESS-MATRIX.md", content: [
    `# Matriz de acesso — v${V102_VERSION} (gerada por análise estática; nada executado)`,
    "",
    "Modelo: parte do **pior caso** — PUBLIC, anon, authenticated **e service_role** com todas as permissões em cada objeto novo (como se o staging tivesse privilégios por omissão abertos, incluindo TRUNCATE/REFERENCES/TRIGGER) — e aplica, pela ordem dos ficheiros, os GRANT/REVOKE, o RLS, a barreira RESTRICTIVE e as políticas V2.",
    "",
    "- `sem papel`, `tester` e `admin` são o mesmo papel de base de dados (`authenticated`). Só `has_staging_access(auth.uid())` os distingue, e só atua através da barreira.",
    "- `service_role` ignora RLS (BYPASSRLS) e é o único com permissões diretas.",
    "",
    "| Quem | Tabelas V2 com acesso direto | Funções V2 executáveis | Tabelas V2 sob a barreira | Tabelas V2 em que passaria SE a tabela fosse aberta ao cliente |",
    "|---|---|---|---|---|",
    ...matrix.map(row),
    "",
    `Total: ${f.v2Tables.length} tabelas V2, ${f.v2Functions.length} funções V2 instaladas (${f.quarantinedFunctions.length} em quarentena: ${f.quarantinedFunctions.map((x) => `\`${x.name}\``).join(", ")}).`,
    "",
    "## Privilégios finais de service_role (achado D)",
    "",
    "| | v1.0.1 | v1.0.2 |",
    "|---|---|---|",
    `| Tabelas V2 com exatamente ${SERVER_TABLE_PRIVS_EXACT.join("/")} | ${prevExactT} | ${exactT} |`,
    `| Tabelas V2 que mantinham ALL (TRUNCATE, REFERENCES, TRIGGER incluídos) no pior caso | ${prevAllT} | ${Object.values(acl.tables).filter((p) => p.includes("ALL")).length} |`,
    `| Funções V2 sem EXECUTE para service_role | ${prevAcl.functionsWithoutExecute.length} | ${acl.functionsWithoutExecute.length} |`,
    "",
    `Cada tabela: \`REVOKE ALL … FROM PUBLIC, anon, authenticated, service_role\` e depois \`GRANT ${SERVER_TABLE_PRIVS_EXACT.join(", ")} … TO service_role\`. Cada função: o mesmo REVOKE e depois \`GRANT ${SERVER_FUNCTION_PRIVS_EXACT.join(", ")}\`. Na base, a ACL final confere-se entrada a entrada com \`posflight/Q02\` (Q02-07, Q02-08, Q02-09, Q02-16) e \`Q05-08\`. Tipos enum mantêm o USAGE por omissão do PostgreSQL (não dá acesso a dados).`,
    "",
    "## O que esta matriz NÃO prova (achado B)",
    "",
    "- Prova **privilégios da base**, não segurança funcional da aplicação.",
    "- O acesso V2 é \"só pelo servidor\": os REVOKE a clientes mantêm-se e **nenhum acesso de cliente foi aberto**.",
    "- As **APIs de servidor** que verificariam a sessão do utilizador **e** `has_staging_access` antes de usar `service_role` **ainda não existem**. Como `service_role` ignora a barreira, sem essas APIs não há afirmação de segurança funcional (BLOCKERS B3).",
    "",
    "Na base, estes números confirmam-se só de leitura com `posflight/Q02_seguranca.sql` e `posflight/Q05_matriz_acesso.sql`. O teste comportamental (`tests-db/T01`) está preparado e bloqueado.",
    "",
  ].join("\n") });

  const kinds = (sql: string) => {
    const k: Record<string, number> = {};
    for (const s of splitStatements(sql)) { const x = statementKind(s.text); k[x] = (k[x] ?? 0) + 1; }
    return k;
  };
  const tot = (ms: { sql: string }[]) => ms.reduce((a, m) => a + splitStatements(m.sql).length, 0);
  const count = (ms: { sql: string }[], re: RegExp) => ms.reduce((a, m) => a + splitStatements(m.sql).filter((s) => re.test(s.text)).length, 0);
  const prevTaut = tautologicalChecksV101(prev.queries);
  const ncheck = (qs: { checks: unknown[] }[]) => qs.reduce((a, q) => a + q.checks.length, 0);
  const line = (label: string, a: number | string, b: number | string) => `| ${label} | ${a} | ${b} |`;
  const prevByName = new Map(prev.queries.map((q) => [q.name, q.checks.length]));
  files.push({ path: `DIFF-v${V102_PREVIOUS.version}.md`, content: [
    `# Diferenças v${V102_PREVIOUS.version} → v${V102_VERSION} (gerado)`,
    "",
    `Mesmas fontes presas por sha256 (estado final \`${SOURCE_DUMP.path}\`, sha256 \`${SOURCE_DUMP.sha256}\`) e mesmo montador; a v${V102_VERSION} muda só o que o perfil declara. Números medidos sobre as duas montagens, nada executado.`,
    "",
    `| Medida | v${V102_PREVIOUS.version} | v${V102_VERSION} |`,
    "|---|---|---|",
    line("Ficheiros de migração", prev.out.migrations.map((m) => m.name.slice(0, 5)).join(", "), out.migrations.map((m) => m.name.slice(0, 5)).join(", ")),
    line("Instruções no topo", tot(prev.out.migrations), tot(out.migrations)),
    line("Funções V2 instaladas", prev.out.facts.v2Functions.length, f.v2Functions.length),
    line("Funções em quarentena", 0, f.quarantinedFunctions.length),
    line("Funções instaladas que escrevem em user_roles/staging_notes", auditMigrations(prev.out.migrations, { stagingSafeFunctions: true }).filter((v) => v.rule === "função escreve em tabela do staging").length, auditMigrations(out.migrations, AUDIT_OPTIONS_V102).filter((v) => v.rule === "função escreve em tabela do staging").length),
    line("Funções instaladas com SQL dinâmico sobre tabelas descobertas", auditMigrations(prev.out.migrations, { stagingSafeFunctions: true }).filter((v) => v.rule.startsWith("função com SQL dinâmico")).length, auditMigrations(out.migrations, AUDIT_OPTIONS_V102).filter((v) => v.rule.startsWith("função com SQL dinâmico")).length),
    line("REVOKE que incluem service_role", count(prev.out.migrations, /^REVOKE .* service_role$/), count(out.migrations, /^REVOKE .* service_role$/)),
    line(`Tabelas V2 com service_role exatamente ${SERVER_TABLE_PRIVS_EXACT.join("/")} (pior caso)`, prevExactT, exactT),
    line("Ficheiros de verificação (preflight + posflight)", prev.queries.length, queries.filter((q) => q.kind === "verificacao").length),
    line("Ficheiros de registo de base (não verificação)", 0, queries.filter((q) => q.kind === "registo").length),
    line("Verificações substantivas", ncheck(prev.queries), ncheck(queries)),
    line("Linhas 'é um hash, logo passa' (tautologias)", `${prevTaut.length} (${prevTaut.join(", ")})`, 0),
    line("Exigência de exatamente 1 conta no staging", "não (>= 1)", "sim (P04-01, P05-B01, Q03-01)"),
    line("auth.identities comparado", "não", "sim (P04-10, P05-B02, Q03-05)"),
    line("Políticas do staging: USING/WITH CHECK/papéis comparados", "só nomes", "sim (P05-B04, Q04-03)"),
    line("Funções do staging: atributos comparados", "só md5 do corpo", "sim (P05-B05, Q04-04)"),
    line("Impressões de base", "md5", "sha256 com cobertura exigida"),
    "",
    "## Verificações por ficheiro",
    "",
    `| Ficheiro | v${V102_PREVIOUS.version} | v${V102_VERSION} |`,
    "|---|---|---|",
    ...queries.map((q) => `| ${q.dir}/${q.name} | ${prevByName.get(q.name) ?? prev.queries.find((p) => p.name.slice(0, 3) === q.name.slice(0, 3))?.checks.length ?? "—"} | ${q.kind === "registo" ? `${q.baseline.length} registos (não verificações)` : q.checks.length} |`),
    "",
    "## Funções retiradas da instalação (quarentena QZ-06)",
    "",
    ...f.quarantinedFunctions.map((x) => `- \`${x.signature}\` — ${x.reason}.`),
    "",
    "## Marcadores do Q03/Q04 (substituídos pelo operador com o resultado do P05)",
    "",
    ...Object.values(PLACEHOLDERS).map((p) => `- \`${p}\``),
    "",
    `Tipos de instrução por ficheiro (v${V102_VERSION}): ${out.migrations.map((m) => `${m.name.slice(0, 5)} ${JSON.stringify(kinds(m.sql))}`).join("; ")}.`,
    "",
  ].join("\n") });

  files.push({ path: "BLOCKERS.md", content: [
    `# Bloqueios e ambiguidades — v${V102_VERSION} (gerado de BLOCKERS_V102)`,
    "",
    "Nenhum destes pontos foi \"resolvido\" por simulação. Cada um diz o que falta e quem decide. G1–G4 continuam NO-GO.",
    "",
    "| # | Bloqueio | Impacto | O que falta | Estado |",
    "|---|---|---|---|---|",
    ...BLOCKERS_V102.map((b) => `| ${b.id} | **${b.title}** | ${b.impact} | ${b.missing} | ABERTO |`),
    "",
  ].join("\n") });
  return { files, out, queries };
}

export function buildManifestV102(out: V101Output, queries: QueryFile[], allFiles: { path: string; content: Buffer }[]) {
  const model = buildAccessModel(out.migrations);
  const matrix = accessMatrix(model);
  const byPath = new Map(allFiles.map((f) => [f.path, f.content]));
  const h = (p: string) => sha(byPath.get(p)!);
  const manifest = {
    package: "afonso-v2-staging-install",
    version: V102_VERSION,
    status: "AUDIT_ONLY — NOT EXECUTED anywhere (no database, disposable or managed)",
    executed: false,
    gates: "G1–G4 NO-GO",
    target_project: { name: "AFONSO Staging", id: STAGING_PROJECT_ID },
    never_apply_to: "V1 / produção (nem a nenhum outro projeto)",
    supersedes: V102_PREVIOUS,
    source: { dump: SOURCE_DUMP.path, sha256: SOURCE_DUMP.sha256, rehearsal_commit: SOURCE_DUMP.commit, v100_sql: V100_SQL.map((s) => ({ file: `staging-install/migrations/${s.name}`, sha256: s.sha256 })) },
    evidence_status: {
      executor_effective_role: "PENDENTE — P01/P02 só mostram o dono histórico; exige evidência independente",
      functional_security: "NÃO ESTABELECIDA — APIs de servidor com verificação de sessão + has_staging_access não existem",
      auth_identities_read: "NÃO CONFIRMADA no staging — sem permissão, P04/P05/Q03 dão erro (bloqueio)",
      rehearsal_target: "procedimento fora do SQL preparado (tools/rehearsal_target_check.sh), NÃO executado",
    },
    migrations: out.migrations.map((m, i) => ({ order: i + 1, file: `sql/${m.name}`, sha256: h(`sql/${m.name}`), bytes: Buffer.byteLength(m.sql), statements: m.statements, one_migration_per_file: true })),
    queries: queries.map((q) => ({ file: `${q.dir}/${q.name}`, sha256: h(`${q.dir}/${q.name}`), kind: q.kind, checks: q.checks.length, baseline_items: q.baseline.length, read_only: true, fails_with_error: true })),
    quarantine: out.quarantine.map((q) => ({ file: `quarantine/${q.name}`, sha256: h(`quarantine/${q.name}`), items: q.items, executable: false })),
    counts: {
      v2_tables: out.facts.v2Tables.length, v2_functions_installed: out.facts.v2Functions.length, v2_functions_quarantined: out.facts.quarantinedFunctions.map((x) => x.signature),
      v2_types: out.facts.v2Types.length,
      v2_policies: out.facts.policies.filter((p) => p.origin === "v2").length, gate_policies: out.facts.policies.filter((p) => p.origin === "gate").length,
      triggers: out.facts.triggers.length, indexes: out.facts.indexes.length, constraints: out.facts.constraints.length,
      auth_users_fks_kept: out.facts.keptAuthFks, auth_users_fks_removed: out.facts.removedAuthFks.length,
      default_overrides: out.facts.defaultOverrides.map((o) => `${o.table}.${o.column}`),
    },
    static_audit: { options: AUDIT_OPTIONS_V102, violations: 0, matrix: Object.fromEntries(PRINCIPALS.map((p, i) => [p, matrix[i]])), server_acl: { table_privileges: [...SERVER_TABLE_PRIVS_EXACT], function_privileges: [...SERVER_FUNCTION_PRIVS_EXACT] } },
    blockers: BLOCKERS_V102.map((b) => `${b.id} ${b.title}`),
    files: allFiles.filter((f) => f.path !== "MANIFEST.json" && f.path !== "SHA256SUMS").map((f) => ({ path: f.path, sha256: sha(f.content), bytes: f.content.length })).sort((a, b) => (a.path < b.path ? -1 : 1)),
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function buildSha256SumsV102(allFiles: { path: string; content: Buffer }[]): string {
  return allFiles
    .filter((f) => f.path !== "SHA256SUMS")
    .sort((a, b) => (a.path < b.path ? -1 : 1))
    .map((f) => `${sha(f.content)}  ${f.path}`)
    .join("\n") + "\n";
}
