// Montagem PURA do pacote v1.0.1 (só texto). Recebe o dump do estado final e os
// 4 SQL da v1.0.0 já lidos; devolve migrações só-DDL, quarentena e factos para
// documentação, testes e consultas de verificação. Não executa SQL.

import { createHash } from "node:crypto";
import { functionOf, objectName, parsePgDump, tableOf, type DumpEntry } from "./pgdump";
import {
  APP_ROLE_VALUES_ADDED, AUTH_USERS_FK_ALLOWED_TABLES, CLIENT_ROLES, CLIENT_TABLE_ALLOWLIST, GATE_EXPR,
  GATE_POLICY_NAME, QUARANTINED_FROM_DUMP, SEND_DEFAULT_OVERRIDES, SERVER_ROLE, SERVER_TABLE_PRIVILEGES,
  SOURCE_DUMP, STAGING_OWNED, USER_ROLES_ADDED_COLUMN, V100_SQL, V101_MIGRATIONS, V101_VERSION,
} from "./rules";
import { doBlockWritesData, skeleton, splitStatements, statementKind } from "./sql-split";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * Perfil de montagem. O perfil v1.0.1 reproduz byte a byte o pacote v1.0.1 (congelado);
 * versões seguintes mudam só o que o perfil declara.
 */
export interface BuildProfile {
  version: string;
  generator: string;
  migrations: readonly string[];
  /** Funções do estado final que NÃO entram na instalação (vão, comentadas, para a quarentena). */
  quarantinedFunctions: readonly { name: string; reason: string }[];
  /** true: REVOKE ALL também de service_role antes do GRANT exato (normaliza privilégios por omissão). */
  revokeFromServer: boolean;
}

export const V101_PROFILE: BuildProfile = {
  version: V101_VERSION,
  generator: "scripts/staging/build-staging-package-v101.ts",
  migrations: V101_MIGRATIONS,
  quarantinedFunctions: [],
  revokeFromServer: false,
};

export interface V101Input {
  dump: string;
  v100: { name: string; sql: string }[];
}

export interface PolicyFact {
  table: string;
  name: string;
  cmd: "ALL" | "SELECT" | "INSERT" | "UPDATE" | "DELETE";
  roles: string[];
  restrictive: boolean;
  /** Origem: "v2" (política do esquema V2, papéis estreitados) ou "gate". */
  origin: "v2" | "gate";
  rewritten?: string;
}

export interface V101Facts {
  v2Tables: string[];
  v2Functions: { name: string; signature: string; language: string; securityDefiner: boolean; preTable: boolean }[];
  v2Types: string[];
  columns: Record<string, string[]>;
  forceRls: string[];
  policies: PolicyFact[];
  droppedPolicies: { table: string; name: string; reason: string }[];
  triggers: string[];
  indexes: string[];
  constraints: string[];
  keptAuthFks: string[];
  removedAuthFks: { table: string; constraint: string; column: string; onDelete: string; statement: string }[];
  defaultOverrides: { table: string; column: string; reason: string }[];
  /** Funções do estado final retiradas da instalação (perfil). */
  quarantinedFunctions: { name: string; signature: string; reason: string }[];
  /** Colunas boolean que, depois dos ajustes, continuam com DEFAULT true (verificado no posflight). */
  boolDefaultTrue: string[];
  /** Ficheiros de migração da v1.0.1 onde nasce cada tabela V2. */
  tableMigration: Record<string, string>;
  /** Objetos do staging, tal como o staging os tem (para as verificações). */
  stagingOwned: { tables: Record<string, string[]>; constraints: string[]; indexes: string[]; policies: string[] };
}

export interface V100Item {
  file: string;
  line: number;
  kind: string;
  category: "seed" | "reparo" | "backfill" | "bloco_do" | "papel_preenchimento" | "interruptor" | "verificacao";
  sql: string;
}

export interface V101Output {
  migrations: { name: string; sql: string; statements: number }[];
  quarantine: { name: string; content: string; items: number; title: string }[];
  facts: V101Facts;
  v100: {
    perFile: Record<string, Record<string, number>>;
    dml: V100Item[];
    destructive: { file: string; line: number; kind: string; sql: string }[];
    authUsersFks: number;
    anonGrants: number;
    publicPolicies: number;
  };
}

const unquote = (s: string) => (s.startsWith('"') ? s.slice(1, -1).replace(/""/g, '"') : s);

const header = (profile: BuildProfile, title: string, purpose: string) =>
  `-- ${title}\n` +
  `-- AFONSO V2 · pacote de instalação v${profile.version} · destino ÚNICO: AFONSO Staging.\n` +
  `-- Gerado por ${profile.generator} a partir do estado final do esquema\n` +
  `-- (${SOURCE_DUMP.path}, sha256 ${SOURCE_DUMP.sha256.slice(0, 16)}…).\n` +
  `-- Só DDL aditivo: sem INSERT/UPDATE/DELETE, sem DROP, sem RENAME, sem DROP NOT NULL, sem instruções SET de sessão.\n` +
  `-- NÃO EXECUTAR na V1 (produção). Aplicar só com autorização, por ordem, um ficheiro por migração.\n` +
  `-- ${purpose}\n\n`;

function parsePolicy(sql: string) {
  const m = /^CREATE POLICY ("(?:[^"]|"")+"|\w+) ON public\.(\w+)(?: AS (PERMISSIVE|RESTRICTIVE))?(?: FOR (ALL|SELECT|INSERT|UPDATE|DELETE))?(?: TO ((?:"?[\w]+"?)(?:, "?[\w]+"?)*))?((?: USING | WITH CHECK )[\s\S]*)?;$/.exec(sql.trim());
  if (!m) throw new Error(`v1.0.1: política com formato inesperado: ${sql.slice(0, 120)}`);
  return {
    rawName: m[1],
    name: unquote(m[1]),
    table: m[2],
    restrictive: m[3] === "RESTRICTIVE",
    cmd: (m[4] ?? "ALL") as PolicyFact["cmd"],
    roles: m[5] ? m[5].split(", ").map(unquote) : ["public"],
    rest: m[6] ?? "",
  };
}

function tableColumns(createTable: string): string[] {
  const body = createTable.slice(createTable.indexOf("(") + 1, createTable.lastIndexOf(")"));
  return body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^CONSTRAINT\b/.test(l))
    .map((l) => unquote(/^("(?:[^"]|"")+"|[\w]+)/.exec(l)![1]));
}

function inlineConstraints(table: string, createTable: string): string[] {
  return [...createTable.matchAll(/^\s+CONSTRAINT ("(?:[^"]|"")+"|\w+) /gm)].map((m) => `${table}.${unquote(m[1])}`);
}

function topoSortFunctions(fns: DumpEntry[]): DumpEntry[] {
  const names = new Set(fns.map((f) => functionOf(f)!));
  const deps = new Map<string, Set<string>>();
  for (const f of fns) {
    const me = functionOf(f)!;
    const d = new Set<string>();
    for (const n of names) if (n !== me && new RegExp(`\\b${n}\\s*\\(`).test(f.sql)) d.add(n);
    deps.set(me, d);
  }
  const out: DumpEntry[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();
  const byName = new Map(fns.map((f) => [functionOf(f)!, f]));
  const visit = (n: string) => {
    if (done.has(n)) return;
    if (visiting.has(n)) return; // ciclo: plpgsql não valida o corpo na criação; mantém-se a ordem do dump
    visiting.add(n);
    for (const d of deps.get(n)!) visit(d);
    visiting.delete(n);
    done.add(n);
    out.push(byName.get(n)!);
  };
  for (const f of fns) visit(functionOf(f)!);
  return out;
}

const stmts = (sql: string) => splitStatements(sql).map((s) => s.text);

export function buildV101(input: V101Input, profile: BuildProfile = V101_PROFILE): V101Output {
  const MIG = profile.migrations;
  if (MIG.length !== 6) throw new Error(`v${profile.version}: são precisos 6 ficheiros de migração`);
  const clientRevoke = profile.revokeFromServer ? [...CLIENT_ROLES, SERVER_ROLE].join(", ") : CLIENT_ROLES.join(", ");
  if (sha256(input.dump) !== SOURCE_DUMP.sha256) throw new Error("v1.0.1: o dump de origem mudou (sha256). Rever antes de montar.");
  for (const r of V100_SQL) {
    const f = input.v100.find((x) => x.name === r.name);
    if (!f || sha256(f.sql) !== r.sha256) throw new Error(`v1.0.1: ${r.name} da v1.0.0 em falta ou alterado (sha256).`);
  }

  const entries = parsePgDump(input.dump);
  const ownedTables = new Set<string>(STAGING_OWNED.tables);
  const ownedFns = new Set<string>(STAGING_OWNED.functions);
  const ownedTypes = new Set<string>(STAGING_OWNED.types);
  const isOwned = (e: DumpEntry) =>
    ownedTables.has(tableOf(e) ?? "") || ownedFns.has(functionOf(e) ?? "") || (e.type === "TYPE" && ownedTypes.has(e.name));

  const kept = entries.filter((e) => !isOwned(e) && e.type !== "SCHEMA" && e.type !== "ACL" && !(e.type === "COMMENT" && e.name === "SCHEMA public"));
  const of = (t: string) => kept.filter((e) => e.type === t);
  const known = new Set(["TYPE", "FUNCTION", "TABLE", "COMMENT", "CONSTRAINT", "FK CONSTRAINT", "INDEX", "TRIGGER", "POLICY", "ROW SECURITY"]);
  for (const e of kept) if (!known.has(e.type)) throw new Error(`v1.0.1: tipo de entrada não previsto: ${e.type} ${e.name}`);

  // ---------- objetos do staging, tal como estão hoje (excluindo o que a V2 lhes acrescentou) ----------
  const stagingOwned: V101Facts["stagingOwned"] = { tables: {}, constraints: [], indexes: [], policies: [] };
  for (const e of entries.filter(isOwned)) {
    const t = tableOf(e);
    if (e.type === "TABLE") stagingOwned.tables[e.name] = tableColumns(stmts(e.sql)[0]).filter((c) => !(e.name === "user_roles" && c === USER_ROLES_ADDED_COLUMN.column));
    if ((e.type === "CONSTRAINT" || e.type === "FK CONSTRAINT") && !objectName(e).endsWith("_created_by_fkey")) {
      stagingOwned.constraints.push(`${t}.${objectName(e)}`);
      if (/PRIMARY KEY|UNIQUE|EXCLUDE/.test(e.sql)) stagingOwned.indexes.push(objectName(e));
    }
    if (e.type === "TABLE") for (const c of inlineConstraints(e.name, e.sql)) stagingOwned.constraints.push(c);
    if (e.type === "INDEX") stagingOwned.indexes.push(e.name);
    if (e.type === "POLICY" && !/is_admin\(/.test(e.sql)) stagingOwned.policies.push(`${t}.${objectName(e)}`);
  }

  // ---------- tipos ----------
  const types = of("TYPE");

  // ---------- tabelas ----------
  const tables = of("TABLE");
  const v2Tables = tables.map((t) => t.name);
  const rls = new Map(of("ROW SECURITY").map((e) => [e.name, e.sql]));
  const comments = of("COMMENT");
  const columns: Record<string, string[]> = {};
  const forceRls: string[] = [];
  const constraints: string[] = [];
  const quarantinedDump: string[] = [];
  const overridesApplied = new Set<string>();
  const boolDefaultTrue: string[] = [];
  const tableBlocks: string[] = [];
  for (const t of tables) {
    if (!rls.has(t.name)) throw new Error(`v1.0.1: tabela sem RLS no estado final: ${t.name}`);
    const parts = stmts(t.sql);
    let create = parts.find((p) => statementKind(p) === "create_table")!;
    for (const o of SEND_DEFAULT_OVERRIDES.filter((x) => x.table === t.name)) {
      const re = new RegExp(`^(    ${o.column} boolean DEFAULT )true( NOT NULL,?)$`, "m");
      if ((create.match(new RegExp(re.source, "gm")) ?? []).length !== 1) throw new Error(`v1.0.1: valor por omissão ${o.table}.${o.column} não encontrado 1 vez.`);
      create = create.replace(re, "$1false$2");
      overridesApplied.add(`${o.table}.${o.column}`);
    }
    columns[t.name] = tableColumns(create);
    for (const m of create.matchAll(/^    ("?[\w]+"?) boolean DEFAULT true\b/gm)) boolDefaultTrue.push(`${t.name}.${unquote(m[1])}`);
    constraints.push(...inlineConstraints(t.name, create));
    const extra: string[] = [];
    for (const p of parts) {
      const k = statementKind(p);
      if (k === "create_table" || k === "set") continue;
      if (k === "alter_table_force_rls") { forceRls.push(t.name); extra.push(`${p};`); continue; }
      const q = QUARANTINED_FROM_DUMP.find((x) => x.table === t.name && x.statement === `${p};`);
      if (q) { quarantinedDump.push(`${p};`); continue; }
      throw new Error(`v1.0.1: instrução inesperada na tabela ${t.name}: ${p.slice(0, 80)}`);
    }
    const tComments = comments.filter((c) => tableOf(c) === t.name).map((c) => c.sql);
    const allow = CLIENT_TABLE_ALLOWLIST.includes(t.name);
    tableBlocks.push([
      `-- ----- tabela public.${t.name} -----`,
      `${create};`,
      rls.get(t.name)!,
      ...extra,
      `CREATE POLICY ${GATE_POLICY_NAME} ON public.${t.name} AS RESTRICTIVE FOR ALL TO ${CLIENT_ROLES.join(", ")} USING (${GATE_EXPR}) WITH CHECK (${GATE_EXPR});`,
      `REVOKE ALL ON TABLE public.${t.name} FROM PUBLIC, ${clientRevoke};`,
      `GRANT ${SERVER_TABLE_PRIVILEGES.join(", ")} ON TABLE public.${t.name} TO ${SERVER_ROLE};`,
      ...(allow ? [`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${t.name} TO authenticated;`] : []),
      ...tComments,
    ].join("\n"));
  }
  for (const o of SEND_DEFAULT_OVERRIDES) if (!overridesApplied.has(`${o.table}.${o.column}`)) throw new Error(`v1.0.1: override não aplicado ${o.table}.${o.column}`);
  for (const q of QUARANTINED_FROM_DUMP) if (!quarantinedDump.includes(q.statement)) throw new Error(`v1.0.1: quarentena do dump não encontrada: ${q.statement}`);
  const orphanComments = comments.filter((c) => !v2Tables.includes(tableOf(c) ?? "") && !/^FUNCTION /.test(c.name));
  if (orphanComments.length) throw new Error(`v1.0.1: comentários sem tabela: ${orphanComments.map((c) => c.name).join(", ")}`);

  const pkUnique = of("CONSTRAINT");
  for (const c of pkUnique) constraints.push(`${tableOf(c)}.${objectName(c)}`);

  // ---------- funções ----------
  const allFns = of("FUNCTION").map((f) => ({ ...f, sql: stmts(f.sql).filter((s) => statementKind(s) !== "set").map((s) => `${s};`).join("\n") }));
  for (const f of allFns) if (!/^CREATE FUNCTION public\./.test(f.sql)) throw new Error(`v1.0.1: função sem CREATE FUNCTION public.: ${f.name}`);
  const qNames = new Set(profile.quarantinedFunctions.map((q) => q.name));
  for (const q of qNames) if (allFns.filter((f) => functionOf(f) === q).length !== 1) throw new Error(`v${profile.version}: função a pôr em quarentena não encontrada 1 vez: ${q}`);
  const quarantinedFns = allFns.filter((f) => qNames.has(functionOf(f)!));
  const fns = allFns.filter((f) => !qNames.has(functionOf(f)!));
  // Nada do que fica instalado pode depender de uma função em quarentena.
  for (const q of qNames) {
    const re = new RegExp(`\\b${q}\\s*\\(`);
    const users = [...fns, ...tables, ...of("CONSTRAINT"), ...of("TRIGGER"), ...of("POLICY"), ...of("INDEX"), ...of("FK CONSTRAINT")].filter((e) => re.test(e.sql));
    if (users.length) throw new Error(`v${profile.version}: ${q} está em quarentena mas é usada por ${users.map((u) => u.name).join(", ")}`);
  }
  const fnNames = new Set(fns.map((f) => functionOf(f)!));
  const referencedByTables = new Set<string>();
  for (const e of [...tables, ...pkUnique]) for (const m of e.sql.matchAll(/public\.(\w+)\(/g)) if (fnNames.has(m[1])) referencedByTables.add(m[1]);
  const preTable = new Set<string>();
  const addPre = (n: string) => {
    if (preTable.has(n)) return;
    preTable.add(n);
    const f = fns.find((x) => functionOf(x) === n)!;
    for (const o of fnNames) if (o !== n && new RegExp(`\\b${o}\\s*\\(`).test(f.sql)) addPre(o);
  };
  for (const n of referencedByTables) addPre(n);
  for (const n of preTable) {
    const f = fns.find((x) => functionOf(x) === n)!;
    for (const t of v2Tables) if (new RegExp(`\\bpublic\\.${t}\\b`).test(f.sql)) throw new Error(`v1.0.1: função ${n} usada por tabelas lê a tabela ${t}`);
  }
  const fnAcl = (f: DumpEntry) => [
    `REVOKE ALL ON FUNCTION public.${f.name} FROM PUBLIC, ${CLIENT_ROLES.join(", ")};`,
    `GRANT EXECUTE ON FUNCTION public.${f.name} TO ${SERVER_ROLE};`,
  ].join("\n");
  const fnComments = (f: DumpEntry) => comments.filter((c) => functionOf(c) === functionOf(f)).map((c) => c.sql);
  const fnAclSql = (f: DumpEntry) => [
    `REVOKE ALL ON FUNCTION public.${f.name} FROM PUBLIC, ${clientRevoke};`,
    `GRANT EXECUTE ON FUNCTION public.${f.name} TO ${SERVER_ROLE};`,
  ].join("\n");
  const fnBlock = (f: DumpEntry) => [`-- ----- função public.${f.name} -----`, f.sql, profile.revokeFromServer ? fnAclSql(f) : fnAcl(f), ...fnComments(f)].join("\n");
  const preFns = topoSortFunctions(fns.filter((f) => preTable.has(functionOf(f)!)));
  const postFns = topoSortFunctions(fns.filter((f) => !preTable.has(functionOf(f)!)));

  // ---------- índices, chaves, gatilhos ----------
  const indexes = of("INDEX");
  const fks = of("FK CONSTRAINT");
  const keptFks: DumpEntry[] = [];
  const removedAuthFks: V101Facts["removedAuthFks"] = [];
  const keptAuthFks: string[] = [];
  for (const fk of fks) {
    if (/REFERENCES auth\./.test(fk.sql)) {
      const t = tableOf(fk)!;
      if ((AUTH_USERS_FK_ALLOWED_TABLES as readonly string[]).includes(t) && /REFERENCES auth\.users\(id\)/.test(fk.sql)) { keptFks.push(fk); keptAuthFks.push(`${t}.${objectName(fk)}`); continue; }
      const m = /FOREIGN KEY \(([^)]+)\) REFERENCES auth\.users\(id\)(?: ON DELETE (CASCADE|SET NULL|RESTRICT|NO ACTION|SET DEFAULT))?/.exec(fk.sql);
      if (!m) throw new Error(`v1.0.1: FK para auth com formato inesperado: ${fk.name}`);
      removedAuthFks.push({ table: t, constraint: objectName(fk), column: m[1], onDelete: m[2] ?? "NO ACTION", statement: fk.sql });
      continue;
    }
    for (const o of ownedTables) if (new RegExp(`REFERENCES public\\.${o}\\b`).test(fk.sql)) throw new Error(`v1.0.1: FK V2 para tabela do staging: ${fk.name}`);
    keptFks.push(fk);
  }
  for (const fk of keptFks) constraints.push(`${tableOf(fk)}.${objectName(fk)}`);
  const triggers = of("TRIGGER");

  // ---------- políticas ----------
  const policies: PolicyFact[] = [];
  const droppedPolicies: V101Facts["droppedPolicies"] = [];
  const policySql: string[] = [];
  for (const p of of("POLICY")) {
    const pp = parsePolicy(p.sql);
    if (pp.restrictive) throw new Error(`v1.0.1: política restritiva inesperada no estado final: ${pp.name}`);
    const narrowed = [...new Set(pp.roles.map((r) => (r === "public" ? "authenticated" : r)).filter((r) => r !== "anon"))];
    if (narrowed.length === 0) { droppedPolicies.push({ table: pp.table, name: pp.name, reason: "só para anónimos" }); continue; }
    for (const r of narrowed) if (!["authenticated", SERVER_ROLE].includes(r)) throw new Error(`v1.0.1: papel inesperado em política: ${r}`);
    const sql = `CREATE POLICY ${pp.rawName} ON public.${pp.table} FOR ${pp.cmd} TO ${narrowed.join(", ")}${pp.rest};`;
    policySql.push(sql);
    policies.push({ table: pp.table, name: pp.name, cmd: pp.cmd, roles: narrowed, restrictive: false, origin: "v2", rewritten: narrowed.join(",") !== pp.roles.join(",") ? `${pp.roles.join(",")} → ${narrowed.join(",")}` : undefined });
  }
  for (const t of v2Tables) policies.push({ table: t, name: GATE_POLICY_NAME, cmd: "ALL", roles: [...CLIENT_ROLES], restrictive: true, origin: "gate" });

  // ---------- migrações ----------
  const prelude = [
    ...APP_ROLE_VALUES_ADDED.map((v) => `ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS '${v}';`),
    `CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;`,
    `ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS ${USER_ROLES_ADDED_COLUMN.column} ${USER_ROLES_ADDED_COLUMN.type};`,
  ].join("\n");
  const half = Math.ceil(tableBlocks.length / 2);
  const bodies: [string, string, string][] = [
    [MIG[0], `${MIG[0].slice(0, 5)} · prelúdio aditivo`, "Novos valores de app_role (transação própria), extensão unaccent e user_roles.created_by (nulo, sem chave para auth.users). Não muda linhas, políticas nem permissões do staging.\n" + prelude],
    [MIG[1], `${MIG[1].slice(0, 5)} · tipos e tabelas (parte A)`, "Cada tabela nasce com RLS, barreira admin/tester (RESTRICTIVE) e permissões só para o servidor, na mesma migração.\n" +
      [...types.map((t) => t.sql), ...preFns.map(fnBlock), ...tableBlocks.slice(0, half)].join("\n\n")],
    [MIG[2], `${MIG[2].slice(0, 5)} · tabelas (parte B), chaves primárias, unicidade e verificações`, "Mesmas regras da parte A: RLS, barreira e permissões só para o servidor nascem com cada tabela.\n" +
      [...tableBlocks.slice(half), "-- ----- chaves primárias, unicidade e verificações -----", ...pkUnique.map((c) => c.sql)].join("\n\n")],
    [MIG[3], `${MIG[3].slice(0, 5)} · funções`, (profile.revokeFromServer
      ? "Cada função perde TODOS os privilégios (PUBLIC/anon/authenticated/service_role) logo a seguir à criação; depois só service_role recebe EXECUTE."
      : "Cada função perde EXECUTE para PUBLIC/anon/authenticated logo a seguir à criação; só service_role a executa.") + "\n" + postFns.map(fnBlock).join("\n\n")],
    [MIG[4], `${MIG[4].slice(0, 5)} · índices, chaves estrangeiras e gatilhos`, `Sem chaves para auth.users fora de ${AUTH_USERS_FK_ALLOWED_TABLES.join(", ")}.\n` +
      [...indexes.map((i) => i.sql), ...keptFks.map((f) => f.sql), ...triggers.map((t) => t.sql)].join("\n\n")],
    [MIG[5], `${MIG[5].slice(0, 5)} · políticas V2 (papéis estreitados a authenticated/service_role)`, "Ficam sempre debaixo da barreira RESTRICTIVE criada com cada tabela. Nenhuma política para PUBLIC ou anon.\n" + policySql.join("\n")],
  ];
  const migrations = bodies.map(([name, title, rest]) => {
    const [purpose, ...sqlLines] = rest.split("\n");
    const sql = header(profile, title, purpose) + sqlLines.join("\n").trim() + "\n";
    return { name, sql, statements: splitStatements(sql).length };
  });

  // ---------- v1.0.0: o que tinha e o que vai para a quarentena ----------
  const perFile: V101Output["v100"]["perFile"] = {};
  const dml: V100Item[] = [];
  const destructive: V101Output["v100"]["destructive"] = [];
  const authTrigger: string[] = [];
  const realtime: string[] = [...quarantinedDump];
  const storagePolicies: string[] = [];
  let authUsersFks = 0;
  let anonGrants = 0;
  let publicPolicies = 0;
  for (const f of input.v100) {
    const counts: Record<string, number> = {};
    for (const s of splitStatements(f.sql)) {
      const k = statementKind(s.text);
      counts[k] = (counts[k] ?? 0) + 1;
      const sk = skeleton(s.text);
      authUsersFks += (s.text.match(/REFERENCES auth\.users/gi) ?? []).length;
      if (k === "grant" && /\bTO\b[^;]*\banon\b/i.test(sk)) anonGrants++;
      if (k === "create_policy" && !/\bTO\b/i.test(sk.replace(/\b(USING|WITH CHECK)\b[\s\S]*$/i, ""))) publicPolicies++;
      if (k === "create_trigger" && /\bON auth\.users\b/i.test(sk)) { authTrigger.push(`${s.text};`); continue; }
      if (k === "create_policy" && /\bON storage\.objects\b/i.test(sk)) { storagePolicies.push(`${s.text};`); continue; }
      if (k === "alter_other" && /^ALTER PUBLICATION\b/i.test(sk)) { realtime.push(`${s.text};`); continue; }
      if (k === "drop" || (k === "alter_table_other" && /\b(DROP|RENAME)\b/i.test(sk))) destructive.push({ file: f.name, line: s.line, kind: k, sql: sk.slice(0, 160) });
      if (["insert", "update", "delete", "merge", "truncate", "copy", "select", "do"].includes(k)) {
        const category: V100Item["category"] =
          k === "do" ? (doBlockWritesData(s.text) ? "backfill" : "verificacao")
          : /public\.feature_flags\b/i.test(sk) || /enabled_globally/i.test(sk) ? "interruptor"
          : /public\.user_roles\b/i.test(sk) && k === "insert" ? "papel_preenchimento"
          : k === "insert" ? "seed"
          : k === "select" ? "verificacao"
          : "reparo";
        dml.push({ file: f.name, line: s.line, kind: k, category, sql: `${s.text};` });
      }
    }
    perFile[f.name] = counts;
  }

  const removedFkSql = removedAuthFks.map((r) => r.statement);
  const quarantine = [
    { name: "QZ-01_dml_v1.0.0.quarantine", title: "Dados, reparos, preenchimentos e blocos DO da v1.0.0", items: dml.length,
      body: dml.map((d) => `-- [${d.category}] ${d.file}:${d.line} (${d.kind})\n${d.sql}`) },
    { name: "QZ-02_gatilho_auth_users.quarantine", title: "Gatilho em auth.users que cria perfil/papel/categorias em cada conta nova", items: authTrigger.length, body: authTrigger },
    { name: "QZ-03_realtime.quarantine", title: "Publicação Realtime de assessor_messages", items: realtime.length, body: realtime },
    { name: "QZ-04_politicas_storage_v1.0.0.quarantine", title: "Políticas de storage.objects para assessor-files (v1.0.0, SEM barreira admin/tester — não usar tal como estão)", items: storagePolicies.length, body: storagePolicies },
    { name: "QZ-05_chaves_auth_users_retiradas.quarantine", title: "Chaves estrangeiras para auth.users retiradas da instalação (só para rastreio)", items: removedFkSql.length, body: removedFkSql },
    ...(quarantinedFns.length ? [{
      name: "QZ-06_funcoes_retiradas.quarantine",
      title: "Funções do estado final retiradas da instalação (escrevem ou descobrem tabelas do staging, incluindo user_roles)",
      items: quarantinedFns.length,
      body: quarantinedFns.map((f) => [`-- ${f.name}: ${profile.quarantinedFunctions.find((q) => q.name === functionOf(f))!.reason}`, f.sql, ...fnComments(f)].join("\n")),
    }] : []),
  ].map((q) => ({
    name: q.name, title: q.title, items: q.items,
    content:
      `-- QUARENTENA · ${q.title}\n` +
      `-- NÃO EXECUTÁVEL. Nenhuma instrução abaixo está ativa: todas as linhas começam por "--Q| ".\n` +
      `-- Reativar qualquer item exige autorização SEPARADA do proprietário e uma nova versão do pacote.\n` +
      `-- Se este ficheiro for executado por engano, a primeira instrução aborta a transação.\n` +
      `DO $quarentena$ BEGIN RAISE EXCEPTION 'QUARENTENA %: não executar sem autorização separada', '${q.name}'; END $quarentena$;\n\n` +
      q.body.map((b) => b.split("\n").map((l) => `--Q| ${l}`).join("\n")).join("\n--Q|\n") + "\n",
  }));

  const indexNames = [
    ...indexes.map((i) => i.name),
    ...pkUnique.filter((c) => /PRIMARY KEY|UNIQUE|EXCLUDE/.test(c.sql)).map((c) => objectName(c)),
  ];

  return {
    migrations,
    quarantine,
    facts: {
      v2Tables,
      v2Functions: fns.map((f) => ({
        name: functionOf(f)!, signature: f.name,
        language: /LANGUAGE (\w+)/.exec(f.sql)?.[1] ?? "?",
        securityDefiner: /\bSECURITY DEFINER\b/.test(f.sql),
        preTable: preTable.has(functionOf(f)!),
      })),
      v2Types: types.map((t) => t.name),
      columns,
      forceRls,
      policies,
      droppedPolicies,
      triggers: triggers.map((t) => `${tableOf(t)}.${objectName(t)}`),
      indexes: indexNames,
      constraints,
      keptAuthFks,
      removedAuthFks,
      defaultOverrides: SEND_DEFAULT_OVERRIDES.map((o) => ({ table: o.table, column: o.column, reason: o.reason })),
      boolDefaultTrue,
      tableMigration: Object.fromEntries(v2Tables.map((t, i) => [t, i < half ? MIG[1] : MIG[2]])),
      quarantinedFunctions: quarantinedFns.map((f) => ({ name: functionOf(f)!, signature: f.name, reason: profile.quarantinedFunctions.find((q) => q.name === functionOf(f))!.reason })),
      stagingOwned,
    },
    v100: { perFile, dml, destructive, authUsersFks, anonGrants, publicPolicies },
  };
}
