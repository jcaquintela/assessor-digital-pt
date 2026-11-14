// Consultas SÓ DE LEITURA do pacote v1.0.1 (preflight P00–P04, posflight Q00–Q05).
// Cada ficheiro é UM único SELECT. Cada linha é uma verificação com ok booleano;
// NULL conta como falha. Se alguma falhar, a própria consulta dá ERRO
// ("REPROVADO: <ids>") — não depende de alguém ler uma coluna.
// Os valores esperados são calculados a partir dos factos da montagem.

import { createHash } from "node:crypto";
import type { V101Facts } from "./build";
import { GATE_POLICY_NAME, SERVER_ROLE, STAGING_OWNED } from "./rules";

export interface Check { id: string; label: string; ok: string; expected: string; actual: string }
export interface QueryFile { dir: "preflight" | "posflight"; name: string; sql: string; checks: Check[] }

const md5 = (s: string) => createHash("md5").update(s, "utf8").digest("hex");
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const arr = (xs: readonly string[]) => `ARRAY[${xs.map(lit).join(", ")}]::text[]`;
const sortC = (xs: readonly string[]) => [...xs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const fp = (xs: readonly string[]) => md5(sortC(xs).join(","));

/** Corpos (md5 de prosrc) e dados do staging, tal como lidos da migração 0000 do staging (v1.0.0, P03/Q04). */
export const STAGING_BASELINE = {
  hasRoleBodyMd5: "6b9bca1cc09de70841cac113efbdd41a",
  hasStagingAccessBodyMd5: "4376edeea92abf14230207df0fbbef11",
  stagingNotesMd5: "9839c85692f965b4f419fb33c6af3404",
  stagingNotesCount: 3,
} as const;

export const PLACEHOLDERS = {
  email: "__EMAIL_AUTORIZADO__",
  identity: "__IMPRESSAO_IDENTIDADE_P04__",
  accountRoles: "__IMPRESSAO_PAPEIS_CONTA_P04__",
  allRoles: "__IMPRESSAO_PAPEIS_TODOS_P04__",
  totalAccounts: "__TOTAL_CONTAS_P04__",
  stagingAcl: "__IMPRESSAO_ACL_STAGING_P03__",
} as const;

function verdictQuery(title: string, intro: string[], ctes: string[], checks: Check[]): string {
  const ids = new Set(checks.map((c) => c.id));
  if (ids.size !== checks.length) throw new Error(`${title}: ids repetidos`);
  const rows = checks.map((c, i) =>
    `  ${i === 0 ? "SELECT" : "UNION ALL SELECT"} ${lit(c.id)}::text, ${lit(c.label)}::text, (${c.ok})::boolean, ${lit(c.expected)}::text, (${c.actual})::text`,
  ).join("\n");
  return [
    `-- ${title}`,
    ...intro.map((l) => `-- ${l}`),
    `-- Só leitura: um único SELECT. Resultado: uma linha por verificação. Se alguma`,
    `-- verificação falhar (ou der NULL), a consulta TERMINA EM ERRO com "REPROVADO: <id> obtido=<valor> | …".`,
    `WITH ${[...ctes, `c(id, verificacao, ok, esperado, obtido) AS (\n${rows}\n)`, `v AS (SELECT count(*) AS n, string_agg(id || ' obtido=' || left(coalesce(obtido, 'NULL'), 160), ' | ' ORDER BY id) FILTER (WHERE ok IS NOT TRUE) AS falhas FROM c)`].join(",\n")}`,
    `SELECT c.id, c.verificacao, CASE WHEN c.ok IS TRUE THEN 'OK' ELSE 'FALHA' END AS estado, c.esperado, c.obtido,`,
    `       CASE WHEN v.n <> ${checks.length} THEN ('VEREDITO INVÁLIDO: ' || v.n::text || ' verificações')::int::text`,
    `            WHEN v.falhas IS NULL THEN 'APROVADO'`,
    `            ELSE ('REPROVADO: ' || v.falhas)::int::text END AS veredito`,
    `  FROM c CROSS JOIN v ORDER BY c.id;`,
    ``,
  ].join("\n");
}

const PUBLIC_TABLES = `pt AS (SELECT c.oid, c.relname::text AS nome FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f'))`;
const PUBLIC_FUNCS = `pf AS (SELECT p.oid, p.proname::text AS nome, p.pronargs, p.prosrc, p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public')`;
const ENUM_APP_ROLE = `(SELECT string_agg(e.enumlabel::text, ',' ORDER BY e.enumsortorder) FROM pg_enum e JOIN pg_type ty ON ty.oid = e.enumtypid JOIN pg_namespace n ON n.oid = ty.typnamespace WHERE n.nspname = 'public' AND ty.typname = 'app_role')`;
const USER_ROLES_COLS = `(SELECT string_agg(a.attname::text, ',' ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid = to_regclass('public.user_roles') AND a.attnum > 0 AND NOT a.attisdropped)`;
const USER_ROLES_CONS = `(SELECT string_agg(x.conname::text, ',' ORDER BY x.conname COLLATE "C") FROM pg_constraint x WHERE x.conrelid = to_regclass('public.user_roles') AND x.contype <> 'n')`;
const STAGING_ACL = `md5(coalesce((SELECT string_agg(c.relname::text || '=' || coalesce(c.relacl::text, 'NULL'), ';' ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname IN ('staging_notes', 'user_roles')), '') || '|' || coalesce((SELECT string_agg(p.proname::text || '=' || coalesce(p.proacl::text, 'NULL'), ';' ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname IN ('has_role', 'has_staging_access')), ''))`;
const NOTES_MD5 = `(SELECT md5(string_agg(title || '|' || body || '|' || synthetic::text, E'\\n' ORDER BY title COLLATE "C")) FROM public.staging_notes)`;

export function buildQueries(f: V101Facts): QueryFile[] {
  const v2T = f.v2Tables;
  const v2F = f.v2Functions.map((x) => x.name);
  const allTables = sortC([...v2T, ...STAGING_OWNED.tables]);
  const allFns = sortC([...f.v2Functions.map((x) => `${x.name}/${x.signature.slice(x.signature.indexOf("(") + 1, -1).split(", ").filter(Boolean).length}`), "has_role/2", "has_staging_access/1"]);
  const colKeys = [
    ...Object.entries(f.columns).flatMap(([t, cs]) => cs.map((c) => `${t}.${c}`)),
    ...Object.entries(f.stagingOwned.tables).flatMap(([t, cs]) => cs.map((c) => `${t}.${c}`)),
    "user_roles.created_by",
  ];
  const polKeys = [
    ...f.policies.map((p) => `${p.table}.${p.name}:${p.cmd}:${p.restrictive ? "RESTRICTIVE" : "PERMISSIVE"}:${sortC(p.roles).join("+")}`),
    "staging_notes.Staging members read notes:SELECT:PERMISSIVE:authenticated",
    "user_roles.Users read own roles:SELECT:PERMISSIVE:authenticated",
  ];
  const trgKeys = f.triggers;
  const idxKeys = [...f.indexes, ...f.stagingOwned.indexes];
  const conKeys = [...f.constraints, ...f.stagingOwned.constraints];
  const enumKeys = [...f.v2Types, "app_role"];
  const v2Cte = `v2 AS (SELECT unnest(${arr(v2T)}) AS nome)`;
  const t2Cte = `t2 AS (SELECT c.oid, c.relname::text AS nome, c.relacl, c.relrowsecurity, c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace JOIN v2 ON v2.nome = c.relname::text WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p'))`;
  const f2Cte = `f2 AS (SELECT p.oid, p.proname::text AS nome, p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname::text = ANY (${arr(v2F)}))`;
  const missing = (expected: string, actualSql: string) => `(SELECT string_agg(x, ',') FROM (SELECT unnest(${expected}) AS x EXCEPT SELECT k FROM (${actualSql}) a(k)) d)`;
  const extra = (expected: string, actualSql: string) => `(SELECT string_agg(x, ',') FROM (SELECT k AS x FROM (${actualSql}) a(k) EXCEPT SELECT unnest(${expected})) d)`;
  const gateQual = `'^\\(?(public\\.)?has_staging_access\\(auth\\.uid\\(\\)\\)\\)?$'`;
  const ownerOid = `(SELECT c.relowner FROM pg_class c WHERE c.oid = to_regclass('public.user_roles'))`;
  const isSuper = `coalesce((SELECT rolsuper FROM pg_roles WHERE oid = ${ownerOid}), false)`;
  const ownsOrMember = (ownerExpr: string) => `(${ownerOid} = ${ownerExpr} OR pg_has_role(${ownerOid}, ${ownerExpr}, 'MEMBER'))`;
  const out: QueryFile[] = [];
  const q = (dir: QueryFile["dir"], name: string, title: string, intro: string[], ctes: string[], checks: Check[]) =>
    out.push({ dir, name, checks, sql: verdictQuery(title, intro, ctes, checks) });

  // ------------------------------------------------------------------ PREFLIGHT
  q("preflight", "P00_alvo.sql", "P00 · Confirmar o alvo ANTES de instalar (AFONSO Staging, nunca a V1).", [
    "Qualquer FALHA => PARAR. Não instalar.",
  ], [PUBLIC_TABLES, PUBLIC_FUNCS], [
    { id: "P00-01", label: "existe public.staging_notes (marca do staging)", ok: "to_regclass('public.staging_notes') IS NOT NULL", expected: "sim", actual: "CASE WHEN to_regclass('public.staging_notes') IS NULL THEN 'não' ELSE 'sim' END || ' (sessão ' || current_user || ', read_only=' || current_setting('transaction_read_only') || ')'" },
    { id: "P00-02", label: "public tem exatamente staging_notes e user_roles", ok: "coalesce((SELECT array_agg(nome ORDER BY nome COLLATE \"C\") FROM pt), '{}') = ARRAY['staging_notes', 'user_roles']", expected: "staging_notes,user_roles", actual: "(SELECT string_agg(nome, ',' ORDER BY nome COLLATE \"C\") FROM pt)" },
    { id: "P00-03", label: "nenhuma tabela V2 existe ainda", ok: `NOT EXISTS (SELECT 1 FROM pt WHERE nome = ANY (${arr(v2T)}))`, expected: "nenhuma", actual: `coalesce((SELECT string_agg(nome, ',') FROM pt WHERE nome = ANY (${arr(v2T)})), 'nenhuma')` },
    { id: "P00-04", label: "nenhuma função V2 existe ainda", ok: `NOT EXISTS (SELECT 1 FROM pf WHERE nome = ANY (${arr(v2F)}))`, expected: "nenhuma", actual: `coalesce((SELECT string_agg(nome, ',') FROM pf WHERE nome = ANY (${arr(v2F)})), 'nenhuma')` },
    { id: "P00-05", label: "nenhum tipo V2 existe ainda", ok: `NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname::text = ANY (${arr(f.v2Types)}))`, expected: "nenhum", actual: `coalesce((SELECT string_agg(t.typname::text, ',') FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname::text = ANY (${arr(f.v2Types)})), 'nenhum')` },
    { id: "P00-06", label: "PostgreSQL 15 ou superior", ok: "current_setting('server_version_num')::int >= 150000", expected: ">= 150000", actual: "current_setting('server_version')" },
  ]);

  q("preflight", "P01_executor_migracoes.sql", "P01 · Identificar, SEM escrever, o papel real que aplica as migrações.", [
    "Método: dono dos objetos criados pela migração 0000 do staging (aplicada pela ferramenta de",
    "migrações). Um só dono visível => executor inferido. Vários ou nenhum => BLOQUEIO.",
    "Isto é prova INFERIDA (catálogo), não prova definitiva — ver EXECUTOR-PRIVILEGES.md.",
  ], [`o(objeto, dono) AS (
    SELECT 'tabela user_roles', c.relowner FROM pg_class c WHERE c.oid = to_regclass('public.user_roles')
    UNION ALL SELECT 'tabela staging_notes', c.relowner FROM pg_class c WHERE c.oid = to_regclass('public.staging_notes')
    UNION ALL SELECT 'tipo app_role', t.typowner FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = 'app_role'
    UNION ALL SELECT 'função has_role', p.proowner FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'has_role'
    UNION ALL SELECT 'função has_staging_access', p.proowner FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'has_staging_access'
    UNION ALL SELECT 'tabela drizzle.__drizzle_migrations', c.relowner FROM pg_class c WHERE c.oid = to_regclass('drizzle.__drizzle_migrations'))`], [
    { id: "P01-01", label: "os 5 objetos da migração 0000 têm dono visível", ok: "(SELECT count(*) FROM o WHERE objeto <> 'tabela drizzle.__drizzle_migrations') = 5", expected: "5", actual: "(SELECT count(*) FROM o WHERE objeto <> 'tabela drizzle.__drizzle_migrations')::text" },
    { id: "P01-02", label: "um único dono em todos os objetos visíveis", ok: "(SELECT count(DISTINCT dono) FROM o) = 1", expected: "1 dono", actual: "(SELECT string_agg(DISTINCT pg_get_userbyid(dono)::text, ',') FROM o)" },
    { id: "P01-03", label: "o dono não é um papel de cliente nem o servidor da API", ok: "NOT EXISTS (SELECT 1 FROM o WHERE pg_get_userbyid(dono) IN ('anon', 'authenticated', 'service_role', 'authenticator'))", expected: "não", actual: "(SELECT string_agg(DISTINCT pg_get_userbyid(dono)::text, ',') FROM o)" },
  ]);

  q("preflight", "P02_privilegios_executor.sql", "P02 · Privilégios do executor inferido em P01 (dono de user_roles), lidos do catálogo.", [
    "Só o que a v1.0.1 precisa. Já NÃO são precisos: TRIGGER em auth.users, dono de storage.objects,",
    "dono da publicação Realtime e dono de has_role (esses passos estão em quarentena ou deixaram de existir).",
  ], [], [
    { id: "P02-01", label: "executor identificado", ok: `${ownerOid} IS NOT NULL`, expected: "papel", actual: `pg_get_userbyid(${ownerOid})::text` },
    { id: "P02-02", label: "CREATE no schema public", ok: `${isSuper} OR has_schema_privilege(${ownerOid}, 'public', 'CREATE')`, expected: "sim", actual: `has_schema_privilege(${ownerOid}, 'public', 'CREATE')::text` },
    { id: "P02-03", label: "USAGE no schema auth e EXECUTE em auth.uid() (barreira e políticas)", ok: `${isSuper} OR (has_schema_privilege(${ownerOid}, 'auth', 'USAGE') AND has_function_privilege(${ownerOid}, 'auth.uid()', 'EXECUTE'))`, expected: "sim", actual: `has_schema_privilege(${ownerOid}, 'auth', 'USAGE')::text || '/' || has_function_privilege(${ownerOid}, 'auth.uid()', 'EXECUTE')::text` },
    { id: "P02-04", label: "REFERENCES em auth.users (só profiles_id_fkey)", ok: `${isSuper} OR has_table_privilege(${ownerOid}, 'auth.users', 'REFERENCES')`, expected: "sim", actual: `has_table_privilege(${ownerOid}, 'auth.users', 'REFERENCES')::text || ' (dono auth.users = ' || coalesce((SELECT pg_get_userbyid(relowner)::text FROM pg_class WHERE oid = 'auth.users'::regclass), '?') || ')'` },
    { id: "P02-05", label: "dono (ou membro do dono) de public.app_role (ADD VALUE)", ok: `${isSuper} OR coalesce((SELECT ${ownsOrMember("t.typowner")} FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = 'app_role'), false)`, expected: "sim", actual: `(SELECT pg_get_userbyid(t.typowner)::text FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typname = 'app_role')` },
    { id: "P02-06", label: "dono de public.user_roles (ADD COLUMN created_by)", ok: `${ownerOid} IS NOT NULL`, expected: "sim", actual: `pg_get_userbyid(${ownerOid})::text` },
    { id: "P02-07", label: "BYPASSRLS ou superutilizador (8 tabelas com FORCE RLS escritas por funções SECURITY DEFINER do dono)", ok: `coalesce((SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE oid = ${ownerOid}), false)`, expected: "sim", actual: `(SELECT 'bypassrls=' || rolbypassrls::text || ', super=' || rolsuper::text FROM pg_roles WHERE oid = ${ownerOid})` },
    { id: "P02-08", label: "unaccent: já em extensions, ou CREATE em extensions para a instalar", ok: `EXISTS (SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'unaccent' AND n.nspname = 'extensions') OR (NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'unaccent') AND EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'unaccent') AND (${isSuper} OR has_schema_privilege(${ownerOid}, 'extensions', 'CREATE')))`, expected: "sim", actual: `coalesce((SELECT n.nspname::text FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'unaccent'), 'não instalada')` },
    { id: "P02-09", label: `${SERVER_ROLE} com USAGE em extensions (colunas geradas usam extensions.unaccent)`, ok: `has_schema_privilege('${SERVER_ROLE}', 'extensions', 'USAGE')`, expected: "sim", actual: `has_schema_privilege('${SERVER_ROLE}', 'extensions', 'USAGE')::text` },
    { id: "P02-10", label: "papéis anon, authenticated e service_role existem", ok: "(SELECT count(*) FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role')) = 3", expected: "3", actual: "(SELECT count(*) FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role'))::text" },
  ]);

  q("preflight", "P03_colisoes.sql", "P03 · Estado do staging que a v1.0.1 tem de encontrar (e preservar).", [
    "Qualquer FALHA => PARAR e rever COLLISIONS.md. GUARDAR o valor obtido de P03-15 para o Q04.",
  ], [PUBLIC_FUNCS], [
    { id: "P03-01", label: "funções em public = has_role, has_staging_access", ok: "coalesce((SELECT array_agg(nome ORDER BY nome COLLATE \"C\") FROM pf), '{}') = ARRAY['has_role', 'has_staging_access']", expected: "has_role,has_staging_access", actual: "(SELECT string_agg(nome, ',' ORDER BY nome COLLATE \"C\") FROM pf)" },
    { id: "P03-02", label: "has_role: corpo da migração 0000 do staging", ok: `(SELECT md5(prosrc) FROM pf WHERE nome = 'has_role') = '${STAGING_BASELINE.hasRoleBodyMd5}'`, expected: STAGING_BASELINE.hasRoleBodyMd5, actual: "(SELECT md5(prosrc) FROM pf WHERE nome = 'has_role')" },
    { id: "P03-03", label: "has_staging_access: corpo da migração 0000 do staging", ok: `(SELECT md5(prosrc) FROM pf WHERE nome = 'has_staging_access') = '${STAGING_BASELINE.hasStagingAccessBodyMd5}'`, expected: STAGING_BASELINE.hasStagingAccessBodyMd5, actual: "(SELECT md5(prosrc) FROM pf WHERE nome = 'has_staging_access')" },
    { id: "P03-04", label: "has_role/has_staging_access: anon sem EXECUTE, authenticated com EXECUTE", ok: "(SELECT bool_and(NOT has_function_privilege('anon', oid, 'EXECUTE') AND has_function_privilege('authenticated', oid, 'EXECUTE')) FROM pf) AND (SELECT count(*) FROM pf) = 2", expected: "sim", actual: "(SELECT string_agg(nome || ':anon=' || has_function_privilege('anon', oid, 'EXECUTE')::text || ',auth=' || has_function_privilege('authenticated', oid, 'EXECUTE')::text, ' ' ORDER BY nome) FROM pf)" },
    { id: "P03-05", label: "tipos enum em public = app_role", ok: "coalesce((SELECT array_agg(t.typname::text ORDER BY t.typname) FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype = 'e'), '{}') = ARRAY['app_role']", expected: "app_role", actual: "(SELECT string_agg(t.typname::text, ',') FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype = 'e')" },
    { id: "P03-06", label: "valores de app_role = admin,tester", ok: `${ENUM_APP_ROLE} = 'admin,tester'`, expected: "admin,tester", actual: ENUM_APP_ROLE },
    { id: "P03-07", label: "colunas de user_roles = id,user_id,role,created_at", ok: `${USER_ROLES_COLS} = 'id,user_id,role,created_at'`, expected: "id,user_id,role,created_at", actual: USER_ROLES_COLS },
    { id: "P03-08", label: "restrições de user_roles", ok: `${USER_ROLES_CONS} = 'user_roles_pkey,user_roles_user_id_fkey,user_roles_user_id_role_key'`, expected: "user_roles_pkey,user_roles_user_id_fkey,user_roles_user_id_role_key", actual: USER_ROLES_CONS },
    { id: "P03-09", label: "políticas em public = as 2 do staging", ok: "coalesce((SELECT array_agg(tablename::text || '.' || policyname::text ORDER BY tablename, policyname) FROM pg_policies WHERE schemaname = 'public'), '{}') = ARRAY['staging_notes.Staging members read notes', 'user_roles.Users read own roles']", expected: "staging_notes.Staging members read notes,user_roles.Users read own roles", actual: "(SELECT string_agg(tablename::text || '.' || policyname::text, ',' ORDER BY tablename, policyname) FROM pg_policies WHERE schemaname = 'public')" },
    { id: "P03-10", label: "nenhum gatilho em auth.users", ok: "NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass AND NOT tgisinternal)", expected: "nenhum", actual: "coalesce((SELECT string_agg(tgname::text, ',') FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass AND NOT tgisinternal), 'nenhum')" },
    { id: "P03-11", label: "nenhum gatilho em public", ok: "NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal)", expected: "nenhum", actual: "(SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal)::text" },
    { id: "P03-12", label: "schema extensions existe", ok: "EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions')", expected: "sim", actual: "CASE WHEN EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN 'sim' ELSE 'não' END" },
    { id: "P03-13", label: "staging_notes: as 3 notas da migração 0000", ok: `${NOTES_MD5} = '${STAGING_BASELINE.stagingNotesMd5}' AND (SELECT count(*) FROM public.staging_notes) = ${STAGING_BASELINE.stagingNotesCount}`, expected: `${STAGING_BASELINE.stagingNotesCount} / ${STAGING_BASELINE.stagingNotesMd5}`, actual: `(SELECT count(*) FROM public.staging_notes)::text || ' / ' || ${NOTES_MD5}` },
    { id: "P03-14", label: "user_roles sem papéis V2 (consultant/support_admin/super_admin)", ok: "NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role::text IN ('consultant', 'support_admin', 'super_admin'))", expected: "nenhum", actual: "(SELECT count(*) FROM public.user_roles WHERE role::text IN ('consultant', 'support_admin', 'super_admin'))::text" },
    { id: "P03-15", label: "impressão das permissões de staging_notes/user_roles/has_role/has_staging_access (GUARDAR para Q04)", ok: `${STAGING_ACL} ~ '^[0-9a-f]{32}$'`, expected: "md5", actual: STAGING_ACL },
  ]);

  const OWNER_CTES = [
    `alvo AS (SELECT lower(${lit(PLACEHOLDERS.email)}) AS email)`,
    `u AS (SELECT au.id, lower(au.email) AS email, au.email_confirmed_at, au.created_at, to_jsonb(au) AS j FROM auth.users au, alvo WHERE lower(au.email) = alvo.email)`,
    `r AS (SELECT ur.id, ur.user_id, ur.role, ur.created_at FROM public.user_roles ur WHERE ur.user_id IN (SELECT id FROM u))`,
  ];
  const ID_FP = `(SELECT md5(id::text || '|' || email || '|' || extract(epoch FROM email_confirmed_at)::text || '|' || extract(epoch FROM created_at)::text) FROM u)`;
  const ROLES_FP = `(SELECT md5(string_agg(id::text || ':' || role::text || ':' || extract(epoch FROM created_at)::text, ',' ORDER BY id)) FROM r)`;
  const ALL_ROLES_FP = `(SELECT md5(string_agg(id::text || ':' || user_id::text || ':' || role::text || ':' || extract(epoch FROM created_at)::text, ',' ORDER BY id)) FROM public.user_roles)`;
  const placeholderOk = `(SELECT email FROM alvo) ~ '^[^_][^@]*@[^@]+\\.[^@]+$'`;
  q("preflight", "P04_conta_proprietario.sql", "P04 · Conta do proprietário IMEDIATAMENTE antes de instalar.", [
    `Substituir ${PLACEHOLDERS.email} pelo email autorizado ao executar (não fica no pacote).`,
    "GUARDAR os valores obtidos de P04-09, P04-10, P04-11 e P04-12: o Q03 compara-os automaticamente.",
  ], OWNER_CTES, [
    { id: "P04-00", label: "marcador do email substituído", ok: placeholderOk, expected: "email", actual: "CASE WHEN (SELECT email FROM alvo) LIKE '\\_\\_%' THEN 'marcador por substituir' ELSE 'substituído' END" },
    { id: "P04-01", label: "uma única conta com o email autorizado", ok: "(SELECT count(*) FROM u) = 1", expected: "1", actual: "(SELECT count(*) FROM u)::text" },
    { id: "P04-02", label: "email confirmado", ok: "(SELECT bool_and(email_confirmed_at IS NOT NULL) FROM u)", expected: "sim", actual: "(SELECT bool_and(email_confirmed_at IS NOT NULL) FROM u)::text" },
    { id: "P04-03", label: "não bloqueada", ok: "(SELECT bool_and(j ->> 'banned_until' IS NULL OR (j ->> 'banned_until')::timestamptz < now()) FROM u)", expected: "sim", actual: "(SELECT coalesce(max(j ->> 'banned_until'), 'sem bloqueio') FROM u)" },
    { id: "P04-04", label: "não apagada", ok: "(SELECT bool_and(j ->> 'deleted_at' IS NULL) FROM u)", expected: "sim", actual: "(SELECT coalesce(max(j ->> 'deleted_at'), 'não apagada') FROM u)" },
    { id: "P04-05", label: "não anónima", ok: "(SELECT bool_and(coalesce(j ->> 'is_anonymous', 'false') = 'false') FROM u)", expected: "sim", actual: "(SELECT coalesce(max(j ->> 'is_anonymous'), 'false') FROM u)" },
    { id: "P04-06", label: "papéis da conta = exatamente {admin}", ok: "coalesce((SELECT array_agg(role::text ORDER BY role::text) FROM r), '{}') = ARRAY['admin']", expected: "admin", actual: "(SELECT string_agg(role::text, ',' ORDER BY role::text) FROM r)" },
    { id: "P04-07", label: "um único admin no staging", ok: "(SELECT count(*) FROM public.user_roles WHERE role::text = 'admin') = 1", expected: "1", actual: "(SELECT count(*) FROM public.user_roles WHERE role::text = 'admin')::text" },
    { id: "P04-08", label: "public.profiles ainda não existe (logo, sem perfil)", ok: "to_regclass('public.profiles') IS NULL", expected: "não existe", actual: "coalesce(to_regclass('public.profiles')::text, 'não existe')" },
    { id: "P04-09", label: "impressão da identidade (GUARDAR)", ok: `${ID_FP} ~ '^[0-9a-f]{32}$'`, expected: "md5", actual: ID_FP },
    { id: "P04-10", label: "impressão dos papéis da conta (GUARDAR)", ok: `${ROLES_FP} ~ '^[0-9a-f]{32}$'`, expected: "md5", actual: ROLES_FP },
    { id: "P04-11", label: "impressão de TODOS os papéis do staging (GUARDAR)", ok: `${ALL_ROLES_FP} ~ '^[0-9a-f]{32}$'`, expected: "md5", actual: ALL_ROLES_FP },
    { id: "P04-12", label: "total de contas (GUARDAR)", ok: "(SELECT count(*) FROM auth.users) >= 1", expected: ">= 1", actual: "(SELECT count(*) FROM auth.users)::text" },
  ]);

  // ------------------------------------------------------------------ POSFLIGHT
  q("posflight", "Q00_alvo.sql", "Q00 · A instalação ficou no staging, com exatamente as tabelas previstas.", [], [PUBLIC_TABLES], [
    { id: "Q00-01", label: "existe public.staging_notes (marca do staging)", ok: "to_regclass('public.staging_notes') IS NOT NULL", expected: "sim", actual: "CASE WHEN to_regclass('public.staging_notes') IS NULL THEN 'não' ELSE 'sim' END" },
    { id: "Q00-02", label: `tabelas em public = ${allTables.length} previstas (104 V2 + 2 do staging)`, ok: `(SELECT count(*) FROM pt) = ${allTables.length} AND (SELECT md5(string_agg(nome, ',' ORDER BY nome COLLATE "C")) FROM pt) = '${fp(allTables)}'`, expected: `${allTables.length} / ${fp(allTables)}`, actual: `(SELECT count(*) FROM pt)::text || ' / em falta: ' || coalesce(${missing(arr(allTables), "SELECT nome FROM pt")}, '-') || ' / a mais: ' || coalesce(${extra(arr(allTables), "SELECT nome FROM pt")}, '-')` },
    { id: "Q00-03", label: "nenhuma vista, vista materializada ou tabela externa em public", ok: "NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm', 'f'))", expected: "nenhuma", actual: "(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm', 'f'))::text" },
  ]);

  const parts: [string, string, string[], string][] = [
    ["colunas", "Q01-01", colKeys, `SELECT c.relname::text || '.' || a.attname::text FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND a.attnum > 0 AND NOT a.attisdropped`],
    ["funções (nome/nº argumentos)", "Q01-02", allFns, `SELECT p.proname::text || '/' || p.pronargs::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'`],
    ["políticas (tabela.nome:comando:tipo:papéis)", "Q01-03", polKeys, `SELECT tablename::text || '.' || policyname::text || ':' || cmd::text || ':' || permissive::text || ':' || array_to_string(roles, '+') FROM pg_policies WHERE schemaname = 'public'`],
    ["gatilhos", "Q01-04", trgKeys, `SELECT c.relname::text || '.' || t.tgname::text FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal`],
    ["índices", "Q01-05", idxKeys, `SELECT ic.relname::text FROM pg_index i JOIN pg_class ic ON ic.oid = i.indexrelid JOIN pg_namespace n ON n.oid = ic.relnamespace WHERE n.nspname = 'public'`],
    ["restrições (sem NOT NULL)", "Q01-06", conKeys, `SELECT cl.relname::text || '.' || x.conname::text FROM pg_constraint x JOIN pg_class cl ON cl.oid = x.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace WHERE n.nspname = 'public' AND x.contype <> 'n'`],
    ["tipos enum", "Q01-07", enumKeys, `SELECT t.typname::text FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype = 'e'`],
    ["tabelas com FORCE RLS", "Q01-08", f.forceRls, `SELECT c.relname::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relforcerowsecurity`],
  ];
  q("posflight", "Q01_estrutura.sql", "Q01 · Estrutura instalada = estrutura calculada a partir dos 6 ficheiros S3 (nomes, contagens, impressões).", [
    "Os valores esperados saem da montagem (não de uma base): qualquer diferença é FALHA.",
  ], [], parts.map(([label, id, keys, sql]) => ({
    id, label, ok: `(SELECT count(*) || '/' || md5(string_agg(k, ',' ORDER BY k COLLATE "C")) FROM (${sql}) a(k)) = '${keys.length}/${fp(keys)}'`,
    expected: `${keys.length} / ${fp(keys)}`,
    actual: `(SELECT count(*) || ' / ' || md5(string_agg(k, ',' ORDER BY k COLLATE "C")) FROM (${sql}) a(k))`,
  })));

  const sendDefaults = f.defaultOverrides.map((o) => `${o.table}.${o.column}`);
  const boolTrueSql = `SELECT c.nome || '.' || a.attname::text FROM pg_attribute a JOIN t2 c ON c.oid = a.attrelid JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum WHERE a.atttypid = 'boolean'::regtype AND pg_get_expr(d.adbin, d.adrelid) = 'true'`;
  const rowCount = `(xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', nome), false, true, '')))[1]::text::bigint`;
  const cronRe = v2F.join("|");
  q("posflight", "Q02_seguranca.sql", "Q02 · Segurança depois de instalar: deny-by-default, barreira admin/tester, só servidor, nada ligado, nada escrito.", [], [v2Cte, t2Cte, f2Cte], [
    { id: "Q02-01", label: "as 104 tabelas V2 existem", ok: `(SELECT count(*) FROM t2) = ${v2T.length}`, expected: String(v2T.length), actual: "(SELECT count(*) FROM t2)::text" },
    { id: "Q02-02", label: "RLS ligado em todas as tabelas de public", ok: "NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity)", expected: "todas", actual: "coalesce((SELECT string_agg(c.relname::text, ',') FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity), 'todas com RLS')" },
    { id: "Q02-03", label: `barreira ${GATE_POLICY_NAME} em cada tabela V2 (RESTRICTIVE, ALL, anon+authenticated, has_staging_access(auth.uid()))`, ok: `(SELECT count(DISTINCT p.tablename) FROM pg_policies p JOIN v2 ON v2.nome = p.tablename::text WHERE p.schemaname = 'public' AND p.policyname = '${GATE_POLICY_NAME}' AND p.permissive = 'RESTRICTIVE' AND p.cmd = 'ALL' AND p.roles = ARRAY['anon', 'authenticated']::name[] AND p.qual ~ ${gateQual} AND p.with_check ~ ${gateQual}) = ${v2T.length}`, expected: String(v2T.length), actual: `(SELECT count(DISTINCT p.tablename) FROM pg_policies p JOIN v2 ON v2.nome = p.tablename::text WHERE p.schemaname = 'public' AND p.policyname = '${GATE_POLICY_NAME}' AND p.permissive = 'RESTRICTIVE' AND p.cmd = 'ALL' AND p.roles = ARRAY['anon', 'authenticated']::name[] AND p.qual ~ ${gateQual} AND p.with_check ~ ${gateQual})::text` },
    { id: "Q02-04", label: "nenhuma outra política restritiva em public", ok: `(SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND permissive = 'RESTRICTIVE') = ${v2T.length}`, expected: String(v2T.length), actual: "(SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND permissive = 'RESTRICTIVE')::text" },
    { id: "Q02-05", label: "anon sem nenhum privilégio (tabela ou coluna) nas tabelas V2", ok: "NOT EXISTS (SELECT 1 FROM t2 WHERE has_table_privilege('anon', oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege('anon', oid, 'SELECT,INSERT,UPDATE,REFERENCES'))", expected: "nenhum", actual: "coalesce((SELECT string_agg(nome, ',') FROM t2 WHERE has_table_privilege('anon', oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege('anon', oid, 'SELECT,INSERT,UPDATE,REFERENCES')), 'nenhum')" },
    { id: "Q02-06", label: "authenticated (sem papel, tester e admin) sem nenhum privilégio nas tabelas V2", ok: "NOT EXISTS (SELECT 1 FROM t2 WHERE has_table_privilege('authenticated', oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege('authenticated', oid, 'SELECT,INSERT,UPDATE,REFERENCES'))", expected: "nenhum", actual: "coalesce((SELECT string_agg(nome, ',') FROM t2 WHERE has_table_privilege('authenticated', oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege('authenticated', oid, 'SELECT,INSERT,UPDATE,REFERENCES')), 'nenhum')" },
    { id: "Q02-07", label: "nenhuma permissão para PUBLIC nas tabelas V2 (e ACL explícita em todas)", ok: "NOT EXISTS (SELECT 1 FROM t2 WHERE relacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(relacl) e WHERE e.grantee = 0))", expected: "nenhuma", actual: "coalesce((SELECT string_agg(nome, ',') FROM t2 WHERE relacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(relacl) e WHERE e.grantee = 0)), 'nenhuma')" },
    { id: "Q02-08", label: `${SERVER_ROLE} com SELECT/INSERT/UPDATE/DELETE e sem TRUNCATE em todas as tabelas V2`, ok: `NOT EXISTS (SELECT 1 FROM t2 WHERE NOT (has_table_privilege('${SERVER_ROLE}', oid, 'SELECT') AND has_table_privilege('${SERVER_ROLE}', oid, 'INSERT') AND has_table_privilege('${SERVER_ROLE}', oid, 'UPDATE') AND has_table_privilege('${SERVER_ROLE}', oid, 'DELETE')) OR has_table_privilege('${SERVER_ROLE}', oid, 'TRUNCATE'))`, expected: "todas", actual: `coalesce((SELECT string_agg(nome, ',') FROM t2 WHERE NOT (has_table_privilege('${SERVER_ROLE}', oid, 'SELECT') AND has_table_privilege('${SERVER_ROLE}', oid, 'INSERT') AND has_table_privilege('${SERVER_ROLE}', oid, 'UPDATE') AND has_table_privilege('${SERVER_ROLE}', oid, 'DELETE')) OR has_table_privilege('${SERVER_ROLE}', oid, 'TRUNCATE')), 'todas')` },
    { id: "Q02-09", label: "as 41 funções V2 existem", ok: `(SELECT count(*) FROM f2) = ${v2F.length}`, expected: String(v2F.length), actual: "(SELECT count(*) FROM f2)::text" },
    { id: "Q02-10", label: "nenhuma função V2 executável por anon ou authenticated", ok: "NOT EXISTS (SELECT 1 FROM f2 WHERE has_function_privilege('anon', oid, 'EXECUTE') OR has_function_privilege('authenticated', oid, 'EXECUTE'))", expected: "nenhuma", actual: "coalesce((SELECT string_agg(nome, ',') FROM f2 WHERE has_function_privilege('anon', oid, 'EXECUTE') OR has_function_privilege('authenticated', oid, 'EXECUTE')), 'nenhuma')" },
    { id: "Q02-11", label: "nenhuma função V2 com EXECUTE para PUBLIC (ACL nula conta como PUBLIC)", ok: "NOT EXISTS (SELECT 1 FROM f2 WHERE proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(proacl) e WHERE e.grantee = 0))", expected: "nenhuma", actual: "coalesce((SELECT string_agg(nome, ',') FROM f2 WHERE proacl IS NULL OR EXISTS (SELECT 1 FROM aclexplode(proacl) e WHERE e.grantee = 0)), 'nenhuma')" },
    { id: "Q02-12", label: `${SERVER_ROLE} executa todas as funções V2`, ok: `NOT EXISTS (SELECT 1 FROM f2 WHERE NOT has_function_privilege('${SERVER_ROLE}', oid, 'EXECUTE'))`, expected: "todas", actual: `coalesce((SELECT string_agg(nome, ',') FROM f2 WHERE NOT has_function_privilege('${SERVER_ROLE}', oid, 'EXECUTE')), 'todas')` },
    { id: "Q02-13", label: "nenhuma política permissiva em public para PUBLIC ou anon", ok: "NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND permissive = 'PERMISSIVE' AND (roles @> ARRAY['public']::name[] OR roles @> ARRAY['anon']::name[]))", expected: "nenhuma", actual: "coalesce((SELECT string_agg(tablename || '.' || policyname, ',') FROM pg_policies WHERE schemaname = 'public' AND permissive = 'PERMISSIVE' AND (roles @> ARRAY['public']::name[] OR roles @> ARRAY['anon']::name[])), 'nenhuma')" },
    { id: "Q02-14", label: "storage: nenhuma política para assessor-files e o bucket não existe", ok: "NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND (coalesce(qual, '') ILIKE '%assessor-files%' OR coalesce(with_check, '') ILIKE '%assessor-files%' OR policyname ILIKE 'assessor_files%')) AND NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'assessor-files')", expected: "nada", actual: "(SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND (coalesce(qual, '') ILIKE '%assessor-files%' OR coalesce(with_check, '') ILIKE '%assessor-files%' OR policyname ILIKE 'assessor_files%'))::text || ' políticas / ' || (SELECT count(*) FROM storage.buckets WHERE id = 'assessor-files')::text || ' bucket'" },
    { id: "Q02-15", label: "Realtime: nenhuma tabela V2 publicada", ok: "NOT EXISTS (SELECT 1 FROM pg_publication_tables pt JOIN v2 ON v2.nome = pt.tablename::text WHERE pt.schemaname = 'public')", expected: "nenhuma", actual: "coalesce((SELECT string_agg(pt.pubname || ':' || pt.tablename, ',') FROM pg_publication_tables pt JOIN v2 ON v2.nome = pt.tablename::text WHERE pt.schemaname = 'public'), 'nenhuma')" },
    { id: "Q02-16", label: "nenhum gatilho em auth.users (perfil automático em quarentena)", ok: "NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass AND NOT tgisinternal)", expected: "nenhum", actual: "coalesce((SELECT string_agg(tgname::text, ',') FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass AND NOT tgisinternal), 'nenhum')" },
    { id: "Q02-17", label: "chaves para auth.users em public: só profiles_id_fkey (V2) e user_roles_user_id_fkey (staging)", ok: "coalesce((SELECT string_agg(cl.relname::text || '.' || x.conname::text, ',' ORDER BY cl.relname, x.conname) FROM pg_constraint x JOIN pg_class cl ON cl.oid = x.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace WHERE n.nspname = 'public' AND x.contype = 'f' AND x.confrelid = 'auth.users'::regclass), '') = 'profiles.profiles_id_fkey,user_roles.user_roles_user_id_fkey'", expected: "profiles.profiles_id_fkey,user_roles.user_roles_user_id_fkey", actual: "(SELECT string_agg(cl.relname::text || '.' || x.conname::text, ',' ORDER BY cl.relname, x.conname) FROM pg_constraint x JOIN pg_class cl ON cl.oid = x.conrelid JOIN pg_namespace n ON n.oid = cl.relnamespace WHERE n.nspname = 'public' AND x.contype = 'f' AND x.confrelid = 'auth.users'::regclass)" },
    { id: "Q02-18", label: "zero linhas em TODAS as 104 tabelas V2 (sem seeds, sem interruptores, sem perfis, sem envios)", ok: `(SELECT sum(${rowCount}) FROM t2) = 0`, expected: "0", actual: `(SELECT sum(${rowCount})::text || ' linhas; não vazias: ' || coalesce(string_agg(nome, ',') FILTER (WHERE ${rowCount} > 0), '-') FROM t2)` },
    { id: "Q02-19", label: "valores por omissão de envio/sincronização = false", ok: `(SELECT count(*) FROM pg_attribute a JOIN t2 c ON c.oid = a.attrelid JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum WHERE (c.nome || '.' || a.attname::text) = ANY (${arr(sendDefaults)}) AND pg_get_expr(d.adbin, d.adrelid) = 'false') = ${sendDefaults.length}`, expected: String(sendDefaults.length), actual: `(SELECT count(*) FROM pg_attribute a JOIN t2 c ON c.oid = a.attrelid JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum WHERE (c.nome || '.' || a.attname::text) = ANY (${arr(sendDefaults)}) AND pg_get_expr(d.adbin, d.adrelid) = 'false')::text` },
    { id: "Q02-20", label: "colunas boolean com DEFAULT true = exatamente as previstas (nenhuma de envio)", ok: `coalesce((SELECT array_agg(k ORDER BY k COLLATE "C") FROM (${boolTrueSql}) a(k)), '{}') = ${arr(sortC(f.boolDefaultTrue))}`, expected: sortC(f.boolDefaultTrue).join(","), actual: `(SELECT string_agg(k, ',' ORDER BY k COLLATE "C") FROM (${boolTrueSql}) a(k))` },
    { id: "Q02-21", label: "nenhum papel V2 atribuído (consultant/support_admin/super_admin)", ok: "NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role::text IN ('consultant', 'support_admin', 'super_admin'))", expected: "nenhum", actual: "(SELECT count(*) FROM public.user_roles WHERE role::text IN ('consultant', 'support_admin', 'super_admin'))::text" },
    { id: "Q02-22", label: "unaccent instalada em extensions", ok: "EXISTS (SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'unaccent' AND n.nspname = 'extensions')", expected: "extensions", actual: "coalesce((SELECT n.nspname::text FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'unaccent'), 'não instalada')" },
    { id: "Q02-23", label: "agendador: nenhuma tarefa chama funções V2", ok: `CASE WHEN to_regclass('cron.job') IS NULL THEN true ELSE (xpath('/row/c/text()', query_to_xml('select count(*) as c from cron.job where command ~* ' || quote_literal(${lit(cronRe)}), false, true, '')))[1]::text::int = 0 END`, expected: "0", actual: `CASE WHEN to_regclass('cron.job') IS NULL THEN 'sem agendador' ELSE (xpath('/row/c/text()', query_to_xml('select count(*) as c from cron.job where command ~* ' || quote_literal(${lit(cronRe)}), false, true, '')))[1]::text END` },
  ]);

  q("posflight", "Q03_conta_proprietario.sql", "Q03 · Conta do proprietário DEPOIS de instalar = P04, sem perfil nem conta nova.", [
    `Substituir ${PLACEHOLDERS.email} como em P04 e os 4 marcadores __…_P04__ pelos valores GUARDADOS de P04-09..P04-12.`,
    "A comparação é feita pela própria consulta: qualquer diferença => REPROVADO. Não corrigir à mão.",
  ], OWNER_CTES, [
    { id: "Q03-00", label: "marcadores substituídos", ok: `${placeholderOk} AND ${lit(PLACEHOLDERS.identity)} ~ '^[0-9a-f]{32}$' AND ${lit(PLACEHOLDERS.accountRoles)} ~ '^[0-9a-f]{32}$' AND ${lit(PLACEHOLDERS.allRoles)} ~ '^[0-9a-f]{32}$' AND ${lit(PLACEHOLDERS.totalAccounts)} ~ '^[0-9]+$'`, expected: "todos", actual: "'ver comentário do ficheiro'" },
    { id: "Q03-01", label: "uma única conta com o email autorizado", ok: "(SELECT count(*) FROM u) = 1", expected: "1", actual: "(SELECT count(*) FROM u)::text" },
    { id: "Q03-02", label: "email continua confirmado", ok: "(SELECT bool_and(email_confirmed_at IS NOT NULL) FROM u)", expected: "sim", actual: "(SELECT bool_and(email_confirmed_at IS NOT NULL) FROM u)::text" },
    { id: "Q03-03", label: "identidade igual a P04", ok: `${ID_FP} = ${lit(PLACEHOLDERS.identity)}`, expected: "= P04-09", actual: ID_FP },
    { id: "Q03-04", label: "papéis da conta = exatamente {admin}", ok: "coalesce((SELECT array_agg(role::text ORDER BY role::text) FROM r), '{}') = ARRAY['admin']", expected: "admin", actual: "(SELECT string_agg(role::text, ',' ORDER BY role::text) FROM r)" },
    { id: "Q03-05", label: "papéis da conta iguais a P04", ok: `${ROLES_FP} = ${lit(PLACEHOLDERS.accountRoles)}`, expected: "= P04-10", actual: ROLES_FP },
    { id: "Q03-06", label: "todos os papéis do staging iguais a P04 (nenhum papel novo ou alterado)", ok: `${ALL_ROLES_FP} = ${lit(PLACEHOLDERS.allRoles)}`, expected: "= P04-11", actual: ALL_ROLES_FP },
    { id: "Q03-07", label: "linha do papel admin sem created_by", ok: "(SELECT bool_and(ur.created_by IS NULL) FROM public.user_roles ur WHERE ur.user_id IN (SELECT id FROM u))", expected: "null", actual: "(SELECT string_agg(coalesce(ur.created_by::text, 'null'), ',') FROM public.user_roles ur WHERE ur.user_id IN (SELECT id FROM u))" },
    { id: "Q03-08", label: "total de contas igual a P04 (nenhuma conta criada)", ok: `(SELECT count(*) FROM auth.users)::text = ${lit(PLACEHOLDERS.totalAccounts)}`, expected: "= P04-12", actual: "(SELECT count(*) FROM auth.users)::text" },
    { id: "Q03-09", label: "nenhum perfil V2 (nem para o proprietário, nem para ninguém)", ok: "NOT EXISTS (SELECT 1 FROM public.profiles)", expected: "0", actual: "(SELECT count(*) FROM public.profiles)::text" },
    { id: "Q03-10", label: "sem estado de acesso nem categorias para a conta", ok: "NOT EXISTS (SELECT 1 FROM public.account_access WHERE user_id IN (SELECT id FROM u)) AND NOT EXISTS (SELECT 1 FROM public.property_categories WHERE user_id IN (SELECT id FROM u))", expected: "0/0", actual: "(SELECT count(*) FROM public.account_access WHERE user_id IN (SELECT id FROM u))::text || '/' || (SELECT count(*) FROM public.property_categories WHERE user_id IN (SELECT id FROM u))::text" },
  ]);

  q("posflight", "Q04_acesso_staging.sql", "Q04 · O controlo de acesso do staging ficou exatamente igual.", [
    `Substituir ${PLACEHOLDERS.stagingAcl} pelo valor GUARDADO de P03-15.`,
  ], [PUBLIC_FUNCS], [
    { id: "Q04-00", label: "marcador substituído", ok: `${lit(PLACEHOLDERS.stagingAcl)} ~ '^[0-9a-f]{32}$'`, expected: "md5", actual: "'ver comentário do ficheiro'" },
    { id: "Q04-01", label: "has_staging_access: corpo igual ao da migração 0000", ok: `(SELECT md5(prosrc) FROM pf WHERE nome = 'has_staging_access') = '${STAGING_BASELINE.hasStagingAccessBodyMd5}'`, expected: STAGING_BASELINE.hasStagingAccessBodyMd5, actual: "(SELECT md5(prosrc) FROM pf WHERE nome = 'has_staging_access')" },
    { id: "Q04-02", label: "has_role: NÃO substituída (corpo da migração 0000)", ok: `(SELECT md5(prosrc) FROM pf WHERE nome = 'has_role') = '${STAGING_BASELINE.hasRoleBodyMd5}'`, expected: STAGING_BASELINE.hasRoleBodyMd5, actual: "(SELECT md5(prosrc) FROM pf WHERE nome = 'has_role')" },
    { id: "Q04-03", label: "permissões de staging_notes/user_roles/has_role/has_staging_access iguais a P03", ok: `${STAGING_ACL} = ${lit(PLACEHOLDERS.stagingAcl)}`, expected: "= P03-15", actual: STAGING_ACL },
    { id: "Q04-04", label: "staging_notes: mesmas 3 notas", ok: `${NOTES_MD5} = '${STAGING_BASELINE.stagingNotesMd5}' AND (SELECT count(*) FROM public.staging_notes) = ${STAGING_BASELINE.stagingNotesCount}`, expected: `${STAGING_BASELINE.stagingNotesCount} / ${STAGING_BASELINE.stagingNotesMd5}`, actual: `(SELECT count(*) FROM public.staging_notes)::text || ' / ' || ${NOTES_MD5}` },
    { id: "Q04-05", label: "políticas de staging_notes e user_roles = só as originais (sem barreira V2 nem políticas de admin V2)", ok: "coalesce((SELECT array_agg(tablename::text || '.' || policyname::text ORDER BY tablename, policyname) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('staging_notes', 'user_roles')), '{}') = ARRAY['staging_notes.Staging members read notes', 'user_roles.Users read own roles']", expected: "staging_notes.Staging members read notes,user_roles.Users read own roles", actual: "(SELECT string_agg(tablename::text || '.' || policyname::text, ',' ORDER BY tablename, policyname) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('staging_notes', 'user_roles'))" },
    { id: "Q04-06", label: "user_roles: colunas id,user_id,role,created_at,created_by", ok: `${USER_ROLES_COLS} = 'id,user_id,role,created_at,created_by'`, expected: "id,user_id,role,created_at,created_by", actual: USER_ROLES_COLS },
    { id: "Q04-07", label: "user_roles.created_by: uuid, nulo, sem valor por omissão", ok: "EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = to_regclass('public.user_roles') AND a.attname = 'created_by' AND a.atttypid = 'uuid'::regtype AND NOT a.attnotnull AND NOT a.atthasdef)", expected: "sim", actual: "(SELECT format_type(a.atttypid, a.atttypmod) || ' notnull=' || a.attnotnull::text || ' default=' || a.atthasdef::text FROM pg_attribute a WHERE a.attrelid = to_regclass('public.user_roles') AND a.attname = 'created_by')" },
    { id: "Q04-08", label: "user_roles: restrições inalteradas (sem chave nova)", ok: `${USER_ROLES_CONS} = 'user_roles_pkey,user_roles_user_id_fkey,user_roles_user_id_role_key'`, expected: "user_roles_pkey,user_roles_user_id_fkey,user_roles_user_id_role_key", actual: USER_ROLES_CONS },
    { id: "Q04-09", label: "app_role = admin,tester,consultant,support_admin,super_admin", ok: `${ENUM_APP_ROLE} = 'admin,tester,consultant,support_admin,super_admin'`, expected: "admin,tester,consultant,support_admin,super_admin", actual: ENUM_APP_ROLE },
  ]);

  q("posflight", "Q05_matriz_acesso.sql", "Q05 · Matriz de acesso direto: anon / autenticado sem papel / tester / admin / servidor.", [
    "Na base de dados, 'sem papel', 'tester' e 'admin' são todos o papel authenticated; só a barreira",
    "(has_staging_access) os distingue. Sem permissões diretas, nenhum dos três chega às tabelas/funções V2.",
  ], [v2Cte, t2Cte, f2Cte], [
    { id: "Q05-01", label: "anon · tabelas V2 com algum acesso direto", ok: "(SELECT count(*) FROM t2 WHERE has_table_privilege('anon', oid, 'SELECT,INSERT,UPDATE,DELETE')) = 0", expected: "0", actual: "(SELECT count(*) FROM t2 WHERE has_table_privilege('anon', oid, 'SELECT,INSERT,UPDATE,DELETE'))::text" },
    { id: "Q05-02", label: "anon · funções V2 executáveis", ok: "(SELECT count(*) FROM f2 WHERE has_function_privilege('anon', oid, 'EXECUTE')) = 0", expected: "0", actual: "(SELECT count(*) FROM f2 WHERE has_function_privilege('anon', oid, 'EXECUTE'))::text" },
    { id: "Q05-03", label: "authenticated sem papel / tester / admin · tabelas V2 com algum acesso direto", ok: "(SELECT count(*) FROM t2 WHERE has_table_privilege('authenticated', oid, 'SELECT,INSERT,UPDATE,DELETE')) = 0", expected: "0", actual: "(SELECT count(*) FROM t2 WHERE has_table_privilege('authenticated', oid, 'SELECT,INSERT,UPDATE,DELETE'))::text" },
    { id: "Q05-04", label: "authenticated sem papel / tester / admin · funções V2 executáveis", ok: "(SELECT count(*) FROM f2 WHERE has_function_privilege('authenticated', oid, 'EXECUTE')) = 0", expected: "0", actual: "(SELECT count(*) FROM f2 WHERE has_function_privilege('authenticated', oid, 'EXECUTE'))::text" },
    { id: "Q05-05", label: "barreira: tabelas V2 em que anon/authenticated sem admin/tester são negados mesmo que um dia recebam permissão", ok: `(SELECT count(DISTINCT p.tablename) FROM pg_policies p JOIN v2 ON v2.nome = p.tablename::text WHERE p.schemaname = 'public' AND p.policyname = '${GATE_POLICY_NAME}' AND p.permissive = 'RESTRICTIVE' AND p.roles = ARRAY['anon', 'authenticated']::name[]) = ${v2T.length}`, expected: String(v2T.length), actual: `(SELECT count(DISTINCT p.tablename) FROM pg_policies p JOIN v2 ON v2.nome = p.tablename::text WHERE p.schemaname = 'public' AND p.policyname = '${GATE_POLICY_NAME}' AND p.permissive = 'RESTRICTIVE' AND p.roles = ARRAY['anon', 'authenticated']::name[])::text` },
    { id: "Q05-06", label: "tester/admin: a barreira usa a função do staging, inalterada e executável por authenticated", ok: `(SELECT md5(p.prosrc) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'has_staging_access') = '${STAGING_BASELINE.hasStagingAccessBodyMd5}' AND has_function_privilege('authenticated', 'public.has_staging_access(uuid)', 'EXECUTE')`, expected: "sim", actual: "has_function_privilege('authenticated', 'public.has_staging_access(uuid)', 'EXECUTE')::text" },
    { id: "Q05-07", label: "admin do staging NÃO é admin V2 (nenhum super_admin/support_admin)", ok: "NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role::text IN ('super_admin', 'support_admin'))", expected: "0", actual: "(SELECT count(*) FROM public.user_roles WHERE role::text IN ('super_admin', 'support_admin'))::text" },
    { id: "Q05-08", label: `${SERVER_ROLE} · tabelas V2 com SELECT/INSERT/UPDATE/DELETE`, ok: `(SELECT count(*) FROM t2 WHERE has_table_privilege('${SERVER_ROLE}', oid, 'SELECT') AND has_table_privilege('${SERVER_ROLE}', oid, 'INSERT') AND has_table_privilege('${SERVER_ROLE}', oid, 'UPDATE') AND has_table_privilege('${SERVER_ROLE}', oid, 'DELETE')) = ${v2T.length}`, expected: String(v2T.length), actual: `(SELECT count(*) FROM t2 WHERE has_table_privilege('${SERVER_ROLE}', oid, 'SELECT') AND has_table_privilege('${SERVER_ROLE}', oid, 'INSERT') AND has_table_privilege('${SERVER_ROLE}', oid, 'UPDATE') AND has_table_privilege('${SERVER_ROLE}', oid, 'DELETE'))::text` },
    { id: "Q05-09", label: `${SERVER_ROLE} · funções V2 executáveis`, ok: `(SELECT count(*) FROM f2 WHERE has_function_privilege('${SERVER_ROLE}', oid, 'EXECUTE')) = ${v2F.length}`, expected: String(v2F.length), actual: `(SELECT count(*) FROM f2 WHERE has_function_privilege('${SERVER_ROLE}', oid, 'EXECUTE'))::text` },
    { id: "Q05-10", label: "storage e Realtime · superfícies V2 abertas a clientes", ok: "NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND (coalesce(qual, '') ILIKE '%assessor-files%' OR coalesce(with_check, '') ILIKE '%assessor-files%')) AND NOT EXISTS (SELECT 1 FROM pg_publication_tables pt JOIN v2 ON v2.nome = pt.tablename::text WHERE pt.schemaname = 'public')", expected: "nenhuma", actual: "'storage=' || (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND (coalesce(qual, '') ILIKE '%assessor-files%' OR coalesce(with_check, '') ILIKE '%assessor-files%'))::text || ', realtime=' || (SELECT count(*) FROM pg_publication_tables pt JOIN v2 ON v2.nome = pt.tablename::text WHERE pt.schemaname = 'public')::text" },
  ]);
  return out;
}
