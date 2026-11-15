// v1.0.4 · Verificação de SINTAXE com o parser oficial do PostgreSQL 17 (libpg-query), SEM base de dados.
// Igual à v1.0.3 para sql/, preflight/, posflight/ e quarantine/; ensaio/R30, R31, R32 (1 SELECT cada) e os
// ficheiros *.bloqueado.sql (1.ª instrução = guarda que aborta; 2.ª = guarda só-descartável).
// Não liga a nada e não executa SQL: só transforma texto em árvore sintática.
// Uso (numa pasta com `libpg-query@17` instalado):  bun parse_check.mjs <pasta-do-pacote>
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadModule, parse } from "libpg-query";

await loadModule();
const pkg = process.argv[2];
const ALLOWED_DDL = new Set(["CreateEnumStmt", "CreateFunctionStmt", "CreateStmt", "IndexStmt", "CreateTrigStmt", "CreatePolicyStmt", "CreateExtensionStmt", "AlterEnumStmt", "AlterTableStmt", "CommentStmt", "GrantStmt"]);
const ALLOWED_AT = new Set(["AT_AddConstraint", "AT_EnableRowSecurity", "AT_ForceRowSecurity", "AT_AddColumn"]);
let failures = 0;
const out = [];
const log = (s) => { out.push(s); console.log(s); };
const h = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const kinds = (stmts) => stmts.map((s) => Object.keys(s.stmt)[0]);

for (const f of readdirSync(join(pkg, "sql")).sort()) {
  const sql = readFileSync(join(pkg, "sql", f), "utf8");
  let tree;
  try { tree = await parse(sql); } catch (e) { failures++; log(`FALHA sintaxe ${f}: ${e.message}`); continue; }
  const counts = {};
  for (const s of tree.stmts) {
    const k = Object.keys(s.stmt)[0];
    counts[k] = (counts[k] ?? 0) + 1;
    if (!ALLOWED_DDL.has(k)) { failures++; log(`FALHA ${f}: instrução não permitida ${k}`); }
    if (k === "AlterTableStmt") for (const c of s.stmt.AlterTableStmt.cmds) {
      const sub = c.AlterTableCmd.subtype;
      if (!ALLOWED_AT.has(sub)) { failures++; log(`FALHA ${f}: ALTER TABLE ${sub}`); }
      if (sub === "AT_AddColumn" && !c.AlterTableCmd.missing_ok) { failures++; log(`FALHA ${f}: ADD COLUMN sem IF NOT EXISTS`); }
    }
    if (k === "CreateFunctionStmt" && s.stmt.CreateFunctionStmt.replace) { failures++; log(`FALHA ${f}: CREATE OR REPLACE`); }
    if (k === "GrantStmt") {
      const g = s.stmt.GrantStmt;
      const grantees = (g.grantees ?? []).map((r) => r.RoleSpec.rolename ?? r.RoleSpec.roletype);
      if (g.is_grant && grantees.some((r) => r !== "service_role")) { failures++; log(`FALHA ${f}: GRANT a ${grantees.join(",")}`); }
    }
    if (k === "CreatePolicyStmt") {
      const p = s.stmt.CreatePolicyStmt;
      const roles = (p.roles ?? []).map((r) => r.RoleSpec.rolename ?? r.RoleSpec.roletype);
      // JSON do parser omite booleanos false: RESTRICTIVE => permissive ausente.
      if (p.permissive === true && roles.some((r) => r === "anon" || r === "ROLESPEC_PUBLIC")) { failures++; log(`FALHA ${f}: política permissiva para ${roles.join(",")}`); }
    }
  }
  log(`OK sintaxe ${f} [${h(sql)}]: ${tree.stmts.length} instruções ${JSON.stringify(counts)}`);
}
for (const d of ["preflight", "posflight"]) for (const f of readdirSync(join(pkg, d)).sort()) {
  const sql = readFileSync(join(pkg, d, f), "utf8");
  try {
    const tree = await parse(sql);
    const k = kinds(tree.stmts);
    if (k.length !== 1 || k[0] !== "SelectStmt") { failures++; log(`FALHA ${d}/${f}: esperado 1 SELECT, obtido ${k.join(",")}`); }
    else log(`OK sintaxe ${d}/${f} [${h(sql)}]: 1 SELECT`);
  } catch (e) { failures++; log(`FALHA sintaxe ${d}/${f}: ${e.message}`); }
}
for (const f of readdirSync(join(pkg, "quarantine")).filter((n) => n.endsWith(".quarantine")).sort()) {
  const sql = readFileSync(join(pkg, "quarantine", f), "utf8");
  try {
    const tree = await parse(sql);
    const k = kinds(tree.stmts);
    if (k.length !== 1 || k[0] !== "DoStmt") { failures++; log(`FALHA quarantine/${f}: esperado só o bloco de guarda, obtido ${k.join(",")}`); }
    else log(`OK quarantine/${f} [${h(sql)}]: única instrução ativa = guarda que aborta`);
  } catch (e) { failures++; log(`FALHA sintaxe quarantine/${f}: ${e.message}`); }
}
for (const f of readdirSync(join(pkg, "ensaio")).filter((n) => n.endsWith(".sql")).sort()) {
  const sql = readFileSync(join(pkg, "ensaio", f), "utf8");
  try {
    const tree = await parse(sql);
    const k = kinds(tree.stmts);
    if (f.endsWith(".bloqueado.sql")) continue;
    if (k.length !== 1 || k[0] !== "SelectStmt") { failures++; log(`FALHA ensaio/${f}: esperado 1 SELECT, obtido ${k.join(",")}`); }
    else log(`OK sintaxe ensaio/${f} [${h(sql)}]: 1 SELECT (só ensaio)`);
  } catch (e) { failures++; log(`FALHA sintaxe ensaio/${f}: ${e.message}`); }
}
for (const [d, f] of [...readdirSync(join(pkg, "ensaio")).map((n) => ["ensaio", n]), ...readdirSync(join(pkg, "tests-db")).map((n) => ["tests-db", n])].filter(([, n]) => n.endsWith(".bloqueado.sql")).sort()) {
  const sql = readFileSync(join(pkg, d, f), "utf8");
  try {
    const tree = await parse(sql);
    const [a, b] = tree.stmts.map((s) => s.stmt);
    const src = (s) => JSON.stringify(s);
    if (!a?.DoStmt || !src(a).includes("BLOQUEADO")) { failures++; log(`FALHA ${d}/${f}: 1.ª instrução não é a guarda BLOQUEADO`); }
    else if (!b?.DoStmt || !src(b).includes("SÓ DESCARTÁVEL") || !src(b).includes("__R_NONCE_SHA256__")) { failures++; log(`FALHA ${d}/${f}: 2.ª instrução não é a guarda só-descartável`); }
    else log(`OK ${d}/${f} [${h(sql)}]: ${tree.stmts.length} instruções; 1.ª = guarda que aborta, 2.ª = guarda só-descartável`);
  } catch (e) { failures++; log(`FALHA sintaxe ${d}/${f}: ${e.message}`); }
}
log(failures ? `RESULTADO: ${failures} falhas` : "RESULTADO: 0 falhas");
process.exit(failures ? 1 : 0);
