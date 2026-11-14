// Verificação ESTÁTICA das migrações v1.0.1 (só texto; não executa SQL).
// 1) Cada instrução de topo tem de ser DDL aditivo de uma lista fechada.
// 2) Modelo de permissões/RLS: parte do PIOR caso (PUBLIC, anon e authenticated com
//    tudo em cada objeto novo, como se o staging tivesse privilégios por omissão
//    abertos) e aplica os GRANT/REVOKE e políticas pela ordem em que aparecem.
//    Daí sai a matriz anon / autenticado sem papel / tester / admin / servidor.

import { scanSql } from "../schema-builder";
import { CLIENT_ROLES, GATE_EXPR, GATE_POLICY_NAME, SERVER_ROLE, STAGING_OWNED } from "./rules";
import { skeleton, splitStatements, statementKind, type StatementKind } from "./sql-split";

export interface Violation { file: string; line: number; rule: string; excerpt: string }

const ALLOWED: ReadonlySet<StatementKind> = new Set([
  "create_type", "create_function", "create_table", "create_index", "create_trigger", "create_policy",
  "create_extension", "alter_type_add_value", "alter_table_add_constraint", "alter_table_add_column",
  "alter_table_enable_rls", "alter_table_force_rls", "comment", "grant", "revoke",
]);

const OWNED_RE = new RegExp(`\\bpublic\\.(${[...STAGING_OWNED.tables, ...STAGING_OWNED.functions].join("|")})\\b`, "i");

/**
 * Regras adicionais (v1.0.2+). Sem opções, a auditoria é exatamente a da v1.0.1.
 * - serverAclExact: cada REVOKE de tabela/função inclui service_role (normaliza privilégios por
 *   omissão da plataforma) e cada GRANT dá só SELECT/INSERT/UPDATE/DELETE (tabela) ou EXECUTE (função).
 * - stagingSafeFunctions: nenhuma função instalada escreve em tabelas do staging (user_roles,
 *   staging_notes) nem usa SQL dinâmico sobre tabelas descobertas no catálogo.
 */
export interface AuditOptions { serverAclExact?: boolean; stagingSafeFunctions?: boolean }

const WRITES_STAGING_RE = new RegExp(`\\b(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM|TRUNCATE(?:\\s+TABLE)?|MERGE\\s+INTO)\\s+(?:ONLY\\s+)?(?:public\\.)?"?(?:${STAGING_OWNED.tables.join("|")})\\b`, "i");
const DISCOVERS_TABLES_RE = /\binformation_schema\.(?:columns|tables)\b|\bpg_catalog\.pg_(?:class|attribute|tables)\b|\bFROM\s+pg_(?:class|attribute|tables)\b/i;
const DYNAMIC_IDENT_RE = /\bEXECUTE\s+format\s*\([^;]*%I/i;

export function auditMigrations(files: { name: string; sql: string }[], opts: AuditOptions = {}): Violation[] {
  const v: Violation[] = [];
  const add = (file: string, line: number, rule: string, s: string) => v.push({ file, line, rule, excerpt: skeleton(s).slice(0, 140) });
  for (const f of files) {
    for (const s of splitStatements(f.sql)) {
      const k = statementKind(s.text);
      const sk = skeleton(s.text);
      const head = sk.replace(/\$BODY\$[\s\S]*$/, "");
      if (!ALLOWED.has(k)) add(f.name, s.line, `instrução não permitida (${k})`, s.text);
      if (/\bDROP\b|\bRENAME\b|\bTRUNCATE\b/i.test(head)) add(f.name, s.line, "operação destrutiva", s.text);
      if (/\bOWNER TO\b|\bALTER DEFAULT PRIVILEGES\b|\bSECURITY LABEL\b/i.test(head)) add(f.name, s.line, "dono/privilégios globais", s.text);
      const isAllowedAuthFk = /^ALTER TABLE ONLY public\.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY \(id\) REFERENCES auth\.users\(id\) ON DELETE CASCADE$/.test(sk);
      if (!isAllowedAuthFk && (/\bON (auth|storage|realtime|vault|cron|net|supabase_functions)\./i.test(head) || /\b(ALTER|CREATE) (TABLE|TRIGGER)\b[^;]*\b(auth|storage)\./i.test(head)))
        add(f.name, s.line, "toca em schema gerido da plataforma", s.text);
      if (/REFERENCES auth\.users/i.test(sk) && !isAllowedAuthFk)
        add(f.name, s.line, "chave estrangeira para auth.users fora de profiles", s.text);
      if (k === "create_or_replace") add(f.name, s.line, "CREATE OR REPLACE (substituiria um objeto existente)", s.text);
      if (k === "alter_table_add_column" && !/^ALTER TABLE public\.user_roles ADD COLUMN IF NOT EXISTS created_by uuid$/.test(sk))
        add(f.name, s.line, "ADD COLUMN fora do previsto", s.text);
      if (k === "alter_type_add_value" && !/^ALTER TYPE public\.app_role ADD VALUE IF NOT EXISTS ''$/.test(sk))
        add(f.name, s.line, "ADD VALUE fora do previsto", s.text);
      if (k === "create_extension" && sk !== "CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions")
        add(f.name, s.line, "extensão fora do previsto", s.text);
      if ((k === "create_table" || k === "create_function" || k === "create_type" || k === "create_index" || k === "create_trigger" || k === "create_policy" || k === "alter_table_add_constraint" || k === "alter_table_enable_rls" || k === "alter_table_force_rls" || k === "comment") && OWNED_RE.test(head.replace(/USING \(.*$|WITH CHECK \(.*$/, "")) && !new RegExp(`^CREATE POLICY ${GATE_POLICY_NAME} `).test(sk))
        add(f.name, s.line, "altera objeto do staging", s.text);
      if (k === "grant") {
        const m = /\bTO ([\w, ]+)$/i.exec(sk);
        const to = (m?.[1] ?? "").split(",").map((x) => x.trim().toLowerCase());
        if (to.some((r) => r !== SERVER_ROLE)) add(f.name, s.line, "GRANT a papel cliente/PUBLIC", s.text);
        if (opts.serverAclExact) {
          const g = /^GRANT (.+?) ON (TABLE|FUNCTION) public\./.exec(sk);
          const ok = g && ((g[2] === "TABLE" && g[1] === "SELECT, INSERT, UPDATE, DELETE") || (g[2] === "FUNCTION" && g[1] === "EXECUTE"));
          if (!ok || /WITH GRANT OPTION/i.test(sk)) add(f.name, s.line, "GRANT ao servidor fora do conjunto exato", s.text);
        }
      }
      if (k === "revoke" && opts.serverAclExact && !/^REVOKE ALL ON (TABLE|FUNCTION) public\.\S+(?: [^)]*\))? FROM PUBLIC, anon, authenticated, service_role$/.test(sk))
        add(f.name, s.line, "REVOKE sem normalizar service_role", s.text);
      if (k === "create_function" && opts.stagingSafeFunctions) {
        if (WRITES_STAGING_RE.test(s.text)) add(f.name, s.line, "função escreve em tabela do staging", s.text);
        if (DISCOVERS_TABLES_RE.test(s.text) && DYNAMIC_IDENT_RE.test(s.text)) add(f.name, s.line, "função com SQL dinâmico sobre tabelas descobertas no catálogo", s.text);
      }
      if (k === "create_policy") {
        const m = /^CREATE POLICY ("(?:[^"]|"")+"|\w+) ON public\.(\w+)(?: AS (RESTRICTIVE|PERMISSIVE))?(?: FOR (\w+))?(?: TO ([\w", ]+?))?(?: USING | WITH CHECK |$)/.exec(sk);
        if (!m) add(f.name, s.line, "política ilegível", s.text);
        else {
          const roles = (m[5] ?? "public").split(",").map((x) => x.trim().replace(/"/g, ""));
          if (roles.some((r) => r === "public" || r === "anon") && m[3] !== "RESTRICTIVE") add(f.name, s.line, "política permissiva para PUBLIC/anon", s.text);
          if (m[3] === "RESTRICTIVE" && (m[1] !== GATE_POLICY_NAME || !s.text.includes(`USING (${GATE_EXPR}) WITH CHECK (${GATE_EXPR})`)))
            add(f.name, s.line, "política restritiva diferente da barreira", s.text);
        }
      }
      if (/\b(cron\.(un)?schedule|net\.http_(post|get)|vault\.|http_(get|post)\(|dblink|pg_notify)\b/i.test(s.text)) add(f.name, s.line, "agendamento/rede/segredos", s.text);
      if (/\bset_config\s*\(\s*'(app|request)\./i.test(head)) add(f.name, s.line, "configuração de sessão no topo", s.text);
    }
    for (const x of scanSql(f.name, f.sql)) v.push({ file: f.name, line: x.line, rule: `dado real/produção (${x.kind})`, excerpt: x.excerpt });
  }
  return v;
}

// ------------------------------------------------------------------ matriz

export type Principal = "anon" | "authenticated_sem_papel" | "tester" | "admin" | "service_role";
export const PRINCIPALS: Principal[] = ["anon", "authenticated_sem_papel", "tester", "admin", "service_role"];
const DB_ROLE: Record<Principal, string> = { anon: "anon", authenticated_sem_papel: "authenticated", tester: "authenticated", admin: "authenticated", service_role: "service_role" };
/** has_staging_access(auth.uid()) é verdadeiro só para admin/tester do staging. */
const GATE_PASSES: Record<Principal, boolean> = { anon: false, authenticated_sem_papel: false, tester: true, admin: true, service_role: true };
const CMDS = ["SELECT", "INSERT", "UPDATE", "DELETE"] as const;
type Cmd = (typeof CMDS)[number];

interface TableModel { privs: Map<string, Set<string>>; rls: boolean; gate: boolean; permissive: { name: string; cmd: string; roles: string[] }[] }

export interface MatrixRow {
  principal: Principal;
  /** Tabelas V2 onde o papel consegue pelo menos um SELECT/INSERT/UPDATE/DELETE direto. */
  tablesWithDirectAccess: number;
  /** Funções V2 que o papel pode executar diretamente. */
  executableFunctions: number;
  /** Se um dia a tabela fosse aberta ao cliente: em quantas a barreira + políticas deixariam passar. */
  tablesIfGrantedToClient: number;
  /** Tabelas V2 em que a barreira (RESTRICTIVE, admin/tester) se aplica a este papel. */
  tablesUnderGate: number;
}

export interface AccessModel { tables: Map<string, TableModel>; functions: Map<string, Set<string>> }

/**
 * strict = true: só aceita as formas que a v1.0.1 emite (qualquer outra => erro).
 * strict = false: leitura aproximada de SQL antigo (v1.0.0), para comparação.
 */
export function buildAccessModel(files: { name: string; sql: string }[], strict = true): AccessModel {
  const tables = new Map<string, TableModel>();
  const functions = new Map<string, Set<string>>();
  const worst = () => new Set(["ALL"]);
  for (const f of files) {
    for (const s of splitStatements(f.sql)) {
      const k = statementKind(s.text);
      const sk = skeleton(s.text);
      if (k === "create_table") {
        const t = /^CREATE TABLE (?:IF NOT EXISTS )?public\.(\w+)/.exec(sk)?.[1];
        if (!t) { if (strict) throw new Error(`modelo: CREATE TABLE ilegível: ${sk.slice(0, 80)}`); continue; }
        if (!tables.has(t)) tables.set(t, { privs: new Map([["public", worst()], ["anon", worst()], ["authenticated", worst()], ["service_role", worst()]]), rls: false, gate: false, permissive: [] });
      } else if (k === "create_function" || (!strict && k === "create_or_replace" && /^CREATE OR REPLACE FUNCTION public\./.test(sk))) {
        const name = /FUNCTION public\.(\w+)/.exec(sk)![1];
        if (!functions.has(name)) functions.set(name, new Set(["public", "anon", "authenticated", "service_role"]));
      } else if (k === "alter_table_enable_rls") {
        const t = tables.get(/public\.(\w+)/.exec(sk)![1]);
        if (t) t.rls = true;
      } else if (k === "drop" && !strict) {
        const m = /^DROP POLICY IF EXISTS ("(?:[^"]|"")+"|\w+) ON public\.(\w+)/.exec(sk);
        const t = m && tables.get(m[2]);
        if (t) t.permissive = t.permissive.filter((x) => x.name !== m![1].replace(/"/g, ""));
      } else if (k === "create_policy") {
        const m = /^CREATE POLICY ("(?:[^"]|"")+"|\w+) ON public\.(\w+)(?: AS (RESTRICTIVE|PERMISSIVE))?(?: FOR (\w+))?(?: TO ([\w", ]+?))?(?: USING | WITH CHECK |$)/.exec(sk);
        if (!m) { if (strict) throw new Error(`modelo: política ilegível: ${sk.slice(0, 80)}`); continue; }
        const t = tables.get(m[2]);
        if (!t) continue;
        const roles = (m[5] ?? "public").split(",").map((x) => x.trim().replace(/"/g, ""));
        if (m[3] === "RESTRICTIVE") t.gate = m[1] === GATE_POLICY_NAME && CLIENT_ROLES.every((r) => roles.includes(r)) && (m[4] ?? "ALL") === "ALL";
        else t.permissive.push({ name: m[1].replace(/"/g, ""), cmd: m[4] ?? "ALL", roles });
      } else if (k === "grant" || k === "revoke") {
        const m = /^(?:GRANT|REVOKE) (.+?) ON (?:(TABLE|FUNCTION) )?(public\.\w+(?:\([^)]*\))?(?:, public\.\w+(?:\([^)]*\))?)*) (?:TO|FROM) ([\w, ]+)$/.exec(sk);
        if (!m) { if (strict) throw new Error(`modelo: GRANT/REVOKE ilegível: ${sk.slice(0, 100)}`); continue; }
        const roles = m[4].split(",").map((x) => x.trim().toLowerCase());
        const privs = m[1].replace(/ALL PRIVILEGES/i, "ALL").split(",").map((x) => x.trim().toUpperCase());
        const objs = m[3].split(/,\s*(?=public\.)/).map((o) => /^public\.(\w+)/.exec(o)![1]);
        for (const o of objs) {
          if (m[2] === "FUNCTION" || privs.includes("EXECUTE")) {
            const fs = functions.get(o);
            if (!fs) continue;
            for (const r of roles) k === "grant" ? fs.add(r) : fs.delete(r);
            continue;
          }
          const t = tables.get(o);
          if (!t) continue;
          for (const r of roles) {
            const cur = t.privs.get(r) ?? new Set<string>();
            if (k === "grant") for (const p of privs) cur.add(p);
            else if (privs.includes("ALL")) cur.clear();
            else for (const p of privs) { if (cur.has("ALL")) { cur.delete("ALL"); for (const c of CMDS) cur.add(c); } cur.delete(p); }
            t.privs.set(r, cur);
          }
        }
      }
    }
  }
  return { tables, functions };
}

const hasPriv = (t: TableModel, role: string, cmd: Cmd) =>
  [role, "public"].some((r) => { const p = t.privs.get(r); return !!p && (p.has("ALL") || p.has(cmd)); });

function rlsAllows(t: TableModel, p: Principal, cmd: Cmd): boolean {
  if (p === "service_role") return true; // BYPASSRLS
  if (!t.rls) return true;
  const role = DB_ROLE[p];
  if (t.gate && !GATE_PASSES[p]) return false;
  return t.permissive.some((x) => (x.cmd === "ALL" || x.cmd === cmd) && (x.roles.includes(role) || x.roles.includes("public")));
}

export function accessMatrix(model: AccessModel): MatrixRow[] {
  return PRINCIPALS.map((p) => {
    const role = DB_ROLE[p];
    let direct = 0, ifGranted = 0, underGate = 0;
    for (const t of model.tables.values()) {
      if (CMDS.some((c) => hasPriv(t, role, c) && rlsAllows(t, p, c))) direct++;
      if (CMDS.some((c) => rlsAllows(t, p, c))) ifGranted++;
      if (t.gate && p !== "service_role") underGate++;
    }
    let exec = 0;
    for (const fs of model.functions.values()) if (fs.has(role) || fs.has("public")) exec++;
    return { principal: p, tablesWithDirectAccess: direct, executableFunctions: exec, tablesIfGrantedToClient: ifGranted, tablesUnderGate: underGate };
  });
}

// ------------------------------------------------------------------ ACL do servidor

/**
 * Privilégios FINAIS de service_role em cada tabela/função V2, no modelo de pior caso
 * (antes dos REVOKE, service_role tem tudo, como com privilégios por omissão da plataforma).
 */
export function serverAcl(model: AccessModel): { tables: Record<string, string[]>; functionsWithoutExecute: string[] } {
  const tables: Record<string, string[]> = {};
  for (const [name, t] of model.tables) {
    const p = t.privs.get(SERVER_ROLE) ?? new Set<string>();
    tables[name] = p.has("ALL") ? ["ALL"] : [...p].sort();
  }
  const functionsWithoutExecute = [...model.functions].filter(([, r]) => !r.has(SERVER_ROLE)).map(([n]) => n);
  return { tables, functionsWithoutExecute };
}
