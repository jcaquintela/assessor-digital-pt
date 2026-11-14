// Divisor de instruções SQL (só texto; não executa nada).
// Respeita comentários (-- e /* */), literais '…' e E'…', identificadores "…"
// e corpos $tag$…$tag$, para que um ';' dentro de uma função não parta a instrução.

export interface SqlStatement {
  /** Texto da instrução, sem o ';' final e sem comentários à volta. */
  text: string;
  /** Linha (1-based) onde a instrução começa no ficheiro de origem. */
  line: number;
}

export function splitStatements(sql: string): SqlStatement[] {
  const out: SqlStatement[] = [];
  let i = 0;
  let start = -1;
  let line = 1;
  let startLine = 1;
  const n = sql.length;
  const push = (end: number) => {
    if (start < 0) return;
    const text = stripComments(sql.slice(start, end)).trim();
    if (text) out.push({ text, line: startLine });
    start = -1;
  };
  while (i < n) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === "\n") { line++; i++; continue; }
    if (c === "-" && next === "-") {
      while (i < n && sql[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && next === "*") {
      let depth = 1; i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === "\n") line++;
        if (sql[i] === "/" && sql[i + 1] === "*") { depth++; i += 2; continue; }
        if (sql[i] === "*" && sql[i + 1] === "/") { depth--; i += 2; continue; }
        i++;
      }
      continue;
    }
    if (/\s/.test(c)) { i++; continue; }
    if (start < 0) { start = i; startLine = line; }
    if (c === ";") { push(i); i++; continue; }
    if (c === "'") {
      const escaped = i > 0 && /[eE]/.test(sql[i - 1]) && (i < 2 || !/[A-Za-z0-9_]/.test(sql[i - 2]));
      i++;
      while (i < n) {
        if (sql[i] === "\n") line++;
        if (escaped && sql[i] === "\\") { i += 2; continue; }
        if (sql[i] === "'") { if (sql[i + 1] === "'") { i += 2; continue; } i++; break; }
        i++;
      }
      continue;
    }
    if (c === '"') {
      i++;
      while (i < n) { if (sql[i] === '"') { if (sql[i + 1] === '"') { i += 2; continue; } i++; break; } i++; }
      continue;
    }
    if (c === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i, i + 64));
      if (m && !(i > 0 && /[A-Za-z0-9_]/.test(sql[i - 1]))) {
        const tag = m[0];
        const close = sql.indexOf(tag, i + tag.length);
        const end = close < 0 ? n : close + tag.length;
        for (let k = i; k < end; k++) if (sql[k] === "\n") line++;
        i = end;
        continue;
      }
    }
    i++;
  }
  push(n);
  return out;
}

/** Retira comentários fora de literais/corpos. Mantém o resto byte a byte. */
export function stripComments(sql: string): string {
  let out = "";
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const c = sql[i];
    if (c === "-" && sql[i + 1] === "-") { while (i < n && sql[i] !== "\n") i++; continue; }
    if (c === "/" && sql[i + 1] === "*") {
      let depth = 1; i += 2;
      while (i < n && depth > 0) {
        if (sql[i] === "/" && sql[i + 1] === "*") { depth++; i += 2; continue; }
        if (sql[i] === "*" && sql[i + 1] === "/") { depth--; i += 2; continue; }
        i++;
      }
      out += " ";
      continue;
    }
    if (c === "'" || c === '"') {
      const q = c; let j = i + 1;
      while (j < n) { if (sql[j] === q) { if (sql[j + 1] === q) { j += 2; continue; } j++; break; } j++; }
      out += sql.slice(i, j); i = j; continue;
    }
    if (c === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i, i + 64));
      if (m && !(i > 0 && /[A-Za-z0-9_]/.test(sql[i - 1]))) {
        const close = sql.indexOf(m[0], i + m[0].length);
        const end = close < 0 ? n : close + m[0].length;
        out += sql.slice(i, end); i = end; continue;
      }
    }
    out += c; i++;
  }
  return out;
}

/** Substitui literais e corpos $…$ por marcadores, para analisar só o "esqueleto" da instrução. */
export function skeleton(stmt: string): string {
  return stmt
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1\$/g, " $BODY$ ")
    .replace(/[eE]?'(?:[^'\\]|''|\\.)*'/g, "''")
    .replace(/\s+/g, " ")
    .trim();
}

export type StatementKind =
  | "create_type" | "create_function" | "create_or_replace" | "create_table" | "create_index"
  | "create_trigger" | "create_policy" | "create_extension" | "create_other"
  | "alter_type_add_value" | "alter_table_add_constraint" | "alter_table_add_column"
  | "alter_table_enable_rls" | "alter_table_force_rls" | "alter_table_other" | "alter_other"
  | "comment" | "grant" | "revoke"
  | "insert" | "update" | "delete" | "merge" | "truncate" | "copy" | "select" | "do" | "set"
  | "drop" | "other";

export function statementKind(stmt: string): StatementKind {
  const s = skeleton(stmt).toUpperCase();
  if (/^CREATE OR REPLACE\b/.test(s)) return "create_or_replace";
  if (/^CREATE TYPE\b/.test(s)) return "create_type";
  if (/^CREATE FUNCTION\b/.test(s)) return "create_function";
  if (/^CREATE (UNLOGGED )?TABLE\b/.test(s)) return "create_table";
  if (/^CREATE (UNIQUE )?INDEX\b/.test(s)) return "create_index";
  if (/^CREATE (CONSTRAINT )?TRIGGER\b/.test(s)) return "create_trigger";
  if (/^CREATE POLICY\b/.test(s)) return "create_policy";
  if (/^CREATE EXTENSION\b/.test(s)) return "create_extension";
  if (/^CREATE\b/.test(s)) return "create_other";
  if (/^ALTER TYPE\b.*\bADD VALUE\b/.test(s)) return "alter_type_add_value";
  if (/^ALTER TABLE\b/.test(s)) {
    if (/\bENABLE ROW LEVEL SECURITY$/.test(s)) return "alter_table_enable_rls";
    if (/\bFORCE ROW LEVEL SECURITY$/.test(s)) return "alter_table_force_rls";
    if (/^ALTER TABLE (ONLY )?[\w."]+ ADD CONSTRAINT\b/.test(s) && !/\bDROP\b|\bRENAME\b/.test(s)) return "alter_table_add_constraint";
    if (/^ALTER TABLE (ONLY )?[\w."]+ ADD COLUMN\b/.test(s) && !/,/.test(s)) return "alter_table_add_column";
    return "alter_table_other";
  }
  if (/^ALTER\b/.test(s)) return "alter_other";
  if (/^COMMENT ON\b/.test(s)) return "comment";
  if (/^GRANT\b/.test(s)) return "grant";
  if (/^REVOKE\b/.test(s)) return "revoke";
  if (/^WITH\b/.test(s)) {
    if (/\bINSERT INTO\b/.test(s)) return "insert";
    if (/\bUPDATE [\w."]+( (AS )?\w+)? SET\b/.test(s)) return "update";
    if (/\bDELETE FROM\b/.test(s)) return "delete";
    if (/\bMERGE INTO\b/.test(s)) return "merge";
    return "select";
  }
  if (/^INSERT\b/.test(s)) return "insert";
  if (/^UPDATE\b/.test(s)) return "update";
  if (/^DELETE\b/.test(s)) return "delete";
  if (/^MERGE\b/.test(s)) return "merge";
  if (/^TRUNCATE\b/.test(s)) return "truncate";
  if (/^COPY\b/.test(s)) return "copy";
  if (/^(SELECT|WITH|VALUES|TABLE)\b/.test(s)) return "select";
  if (/^DO\b/.test(s)) return "do";
  if (/^(SET|RESET)\b/.test(s)) return "set";
  if (/^DROP\b/.test(s)) return "drop";
  return "other";
}

/** Um bloco DO que escreve dados (INSERT/UPDATE/DELETE/MERGE/TRUNCATE no corpo). */
export function doBlockWritesData(stmt: string): boolean {
  return /\b(insert\s+into|update\s+[\w."]+\s+set|delete\s+from|merge\s+into|truncate)\b/i.test(stmt);
}
