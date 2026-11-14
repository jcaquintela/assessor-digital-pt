import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { readInputs, walk } from "../../../../scripts/staging/build-staging-package-v101";
import { accessMatrix, auditMigrations, buildAccessModel, serverAcl } from "../v101/audit";
import { buildV101 } from "../v101/build";
import { buildQueries as buildQueriesV101 } from "../v101/queries";
import { SEND_DEFAULT_OVERRIDES, STAGING_PROJECT_ID } from "../v101/rules";
import { skeleton, splitStatements, statementKind } from "../v101/sql-split";
import { AUDIT_OPTIONS_V102, BLOCKERS_V102, buildSha256SumsV102, generateDerivedFilesV102, PACKAGE_DIR_V102, tautologicalChecksV101 } from "./package";
import { PLACEHOLDERS, STAGING_BASELINE } from "./queries";
import { V102_MIGRATIONS, V102_PROFILE, V102_QUARANTINED_FUNCTIONS } from "./rules";

// Pacote v1.0.2 (corretiva) para o AFONSO Staging. Só ficheiros: nada aqui liga a uma base.
const PKG = join(process.cwd(), PACKAGE_DIR_V102);
const inputs = readInputs();
const { files: derived, out, queries } = generateDerivedFilesV102(inputs);
const read = (p: string) => readFileSync(join(PKG, p), "utf8");
const onDisk = walk(PKG).map((p) => relative(PKG, p).split("\\").join("/"));
const migrations = out.migrations;
const topLevel = migrations.flatMap((m) => splitStatements(m.sql).map((s) => ({ file: m.name, text: s.text, kind: statementKind(s.text), sk: skeleton(s.text) })));
const codeOnly = (s: string) => s.replace(/--[^\n]*/g, " ").replace(/'(?:[^']|'')*'/g, "''").replace(/"(?:[^"]|"")*"/g, '""');
const qByName = new Map(queries.map((q) => [q.name, q]));
const allSql = migrations.map((m) => m.sql).join("\n");
const mutate = (name: string, f: (sql: string) => string) => migrations.map((m) => (m.name === name ? { ...m, sql: f(m.sql) } : m));
const rules = (ms: { name: string; sql: string }[]) => auditMigrations(ms, AUDIT_OPTIONS_V102).map((v) => v.rule);
const qNames = V102_QUARANTINED_FUNCTIONS.map((q) => q.name);

describe("v1.0.2: integridade e reprodutibilidade", () => {
  it("os ficheiros derivados no disco são byte a byte iguais à montagem", () => {
    for (const f of derived) expect(read(f.path), f.path).toBe(f.content);
  });

  it("SHA256SUMS cobre todos os ficheiros e confere; MANIFEST usa os mesmos hashes", () => {
    const all = onDisk.map((p) => ({ path: p, content: readFileSync(join(PKG, p)) }));
    expect(read("SHA256SUMS")).toBe(buildSha256SumsV102(all));
    const m = JSON.parse(read("MANIFEST.json"));
    const sums = new Map(read("SHA256SUMS").trim().split("\n").map((l) => [l.slice(66), l.slice(0, 64)]));
    for (const f of m.files) expect(sums.get(f.path), f.path).toBe(f.sha256);
    expect(m.files.length).toBe(onDisk.length - 2);
  });

  it("manifesto: v1.0.2, não executado, NO-GO, evidências pendentes declaradas, bloqueios abertos", () => {
    const m = JSON.parse(read("MANIFEST.json"));
    expect(m.version).toBe("1.0.2");
    expect(m.executed).toBe(false);
    expect(m.gates).toMatch(/NO-GO/);
    expect(m.target_project.id).toBe(STAGING_PROJECT_ID);
    expect(m.supersedes).toEqual({ version: "1.0.1", commit: "a444f846" });
    expect(m.evidence_status.executor_effective_role).toMatch(/^PENDENTE/);
    expect(m.evidence_status.functional_security).toMatch(/^NÃO ESTABELECIDA/);
    expect(m.evidence_status.auth_identities_read).toMatch(/NÃO CONFIRMADA/);
    expect(m.evidence_status.rehearsal_target).toMatch(/NÃO executado/);
    expect(m.migrations.map((x: { file: string }) => x.file)).toEqual(V102_MIGRATIONS.map((n) => `sql/${n}`));
    expect(BLOCKERS_V102.every((b) => b.resolved === false)).toBe(true);
    for (const id of ["B2", "B3", "B10", "B11", "B12"]) expect(BLOCKERS_V102.map((b) => b.id)).toContain(id);
  });

  it("a verificação de sintaxe guardada corresponde aos ficheiros atuais e deu 0 falhas", () => {
    const ev = read("evidence/parse-check.txt");
    expect(ev).toMatch(/RESULTADO: 0 falhas/);
    const hashed = derived.filter((f) => /^(sql|preflight|posflight)\//.test(f.path) || f.path.endsWith(".quarantine"));
    for (const f of hashed) expect(ev, f.path).toContain(`[${createHash("sha256").update(f.content).digest("hex").slice(0, 16)}]`);
    expect(ev).toContain(`[${createHash("sha256").update(read("tools/rehearsal_target_check.sh")).digest("hex").slice(0, 16)}]`);
  });

  it("a v1.0.1 continua intacta: o montador sem perfil reproduz os seus SQL", () => {
    const v101 = buildV101(inputs);
    for (const m of v101.migrations) expect(readFileSync(join(process.cwd(), "staging-install/package/v1.0.1/sql", m.name), "utf8")).toBe(m.sql);
  });
});

describe("migrações: só DDL aditivo (regras da v1.0.1 + regras novas)", () => {
  it("auditoria estática com as regras da v1.0.2: 0 violações", () => {
    expect(auditMigrations(migrations, AUDIT_OPTIONS_V102)).toEqual([]);
  });

  it("zero DML, DO, SELECT, SET, DROP, RENAME, TRUNCATE e CREATE OR REPLACE", () => {
    const bad = topLevel.filter((s) => ["insert", "update", "delete", "merge", "truncate", "copy", "select", "do", "set", "drop", "create_or_replace", "alter_table_other", "alter_other", "other"].includes(s.kind));
    expect(bad).toEqual([]);
    for (const s of topLevel) expect(s.sk.replace(/\$BODY\$.*$/, ""), s.file).not.toMatch(/\bDROP\b|\bRENAME\b|\bTRUNCATE\b|\bOWNER TO\b/i);
  });

  it("chaves para auth.users: só profiles_id_fkey; sem gatilho em auth.users, storage, Realtime, cron/rede", () => {
    expect(topLevel.filter((s) => /REFERENCES auth\.users/i.test(s.sk)).map((s) => s.sk)).toEqual(["ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE"]);
    expect(allSql).not.toMatch(/ON auth\.users|storage\.objects|ALTER PUBLICATION|REPLICA IDENTITY|cron\.(un)?schedule|net\.http_|vault\.|dblink/i);
  });
});

describe("A · funções que escrevem ou descobrem tabelas do staging", () => {
  it("merge_accounts_apply, merge_accounts_preview e handle_new_user não são instaladas e estão integrais em QZ-06", () => {
    for (const n of qNames) expect(allSql, n).not.toMatch(new RegExp(`\\b${n}\\b`));
    expect(out.facts.v2Functions.map((f) => f.name)).not.toEqual(expect.arrayContaining(qNames));
    expect(out.facts.v2Functions).toHaveLength(38);
    const qz6 = read("quarantine/QZ-06_funcoes_retiradas.quarantine");
    for (const n of qNames) expect(qz6).toContain(`--Q| CREATE FUNCTION public.${n}(`);
    expect(qz6).toContain("--Q|   FOR t IN");
    expect(qz6).toContain("information_schema.columns");
  });

  it("nenhuma função instalada escreve em user_roles/staging_notes nem faz SQL dinâmico sobre tabelas descobertas", () => {
    for (const s of topLevel.filter((x) => x.kind === "create_function")) {
      expect(s.text, s.sk.slice(0, 60)).not.toMatch(/\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE)\s+(ONLY\s+)?(public\.)?(user_roles|staging_notes)\b/i);
      expect(s.text, s.sk.slice(0, 60)).not.toMatch(/information_schema\./i);
    }
  });

  it("as regras novas apanham a v1.0.1 (prova de que distinguem): 1 escrita + 2 descobertas", () => {
    const v = auditMigrations(buildV101(inputs).migrations, { stagingSafeFunctions: true }).map((x) => x.rule);
    expect(v.filter((r) => r === "função escreve em tabela do staging")).toHaveLength(1);
    expect(v.filter((r) => r.startsWith("função com SQL dinâmico"))).toHaveLength(2);
  });

  it("reintroduzir merge_accounts_apply no S4-03 é apanhado pela auditoria", () => {
    const qz6 = read("quarantine/QZ-06_funcoes_retiradas.quarantine");
    const body = qz6.slice(qz6.indexOf("--Q| CREATE FUNCTION public.merge_accounts_apply("), qz6.indexOf("--Q| -- merge_accounts_preview")).split("\n").map((l) => l.replace(/^--Q\| ?/, "")).join("\n");
    expect(rules(mutate(V102_MIGRATIONS[3], (s) => `${s}\n${body}`)).join(" | ")).toMatch(/SQL dinâmico sobre tabelas descobertas/);
    const writer = "CREATE FUNCTION public.x() RETURNS void LANGUAGE sql AS $$ DELETE FROM public.user_roles WHERE role = 'admin' $$;";
    expect(rules(mutate(V102_MIGRATIONS[3], (s) => `${s}\n${writer}`)).join(" | ")).toMatch(/escreve em tabela do staging/);
  });

  it("a montagem recusa pôr em quarentena uma função de que algo instalado dependa", () => {
    expect(() => buildV101(inputs, { ...V102_PROFILE, quarantinedFunctions: [{ name: "is_admin", reason: "teste" }] })).toThrow(/está em quarentena mas é usada/);
    expect(() => buildV101(inputs, { ...V102_PROFILE, quarantinedFunctions: [{ name: "nao_existe", reason: "teste" }] })).toThrow(/não encontrada 1 vez/);
  });
});

describe("B · só servidor, sem abrir acesso a clientes", () => {
  it("nenhum GRANT a anon/authenticated/PUBLIC; matriz 0/0 para os 4 papéis de cliente", () => {
    for (const s of topLevel.filter((x) => x.kind === "grant")) expect(s.sk).toMatch(/ TO service_role$/);
    const m = Object.fromEntries(accessMatrix(buildAccessModel(migrations)).map((r) => [r.principal, r]));
    for (const p of ["anon", "authenticated_sem_papel", "tester", "admin"] as const) {
      expect(m[p].tablesWithDirectAccess, p).toBe(0);
      expect(m[p].executableFunctions, p).toBe(0);
      expect(m[p].tablesUnderGate, p).toBe(104);
    }
    expect(m.anon.tablesIfGrantedToClient).toBe(0);
    expect(m.authenticated_sem_papel.tablesIfGrantedToClient).toBe(0);
  });

  it("os documentos não afirmam segurança funcional e dizem que as APIs de servidor não existem", () => {
    expect(read("ACCESS-MATRIX.md")).toMatch(/ainda não existem/);
    expect(read("BLOCKERS.md")).toMatch(/SEGURANÇA FUNCIONAL NÃO ESTABELECIDA/);
    expect(qByName.get("Q05_matriz_acesso.sql")!.sql).toMatch(/AINDA NÃO EXISTEM/);
  });
});

describe("C · dono histórico não é executor efetivo", () => {
  it("P01/P02 rotulados como dono histórico, com veredito que o diz", () => {
    for (const n of ["P01_dono_historico.sql", "P02_privilegios_dono_historico.sql"]) {
      const q = qByName.get(n)!;
      expect(q.sql).toMatch(/DONO HISTÓRICO/);
      expect(q.sql).toContain("'APROVADO SÓ COMO DONO HISTÓRICO");
      expect(q.sql).not.toMatch(/THEN 'APROVADO'/);
    }
    expect(read("EXECUTOR-PRIVILEGES.md")).toMatch(/\*\*PENDENTE\*\*/);
  });
});

describe("D · privilégios de service_role normalizados", () => {
  it("cada tabela e função: REVOKE ALL de PUBLIC, anon, authenticated E service_role, depois GRANT exato", () => {
    for (const t of out.facts.v2Tables) {
      expect(allSql, t).toContain(`REVOKE ALL ON TABLE public.${t} FROM PUBLIC, anon, authenticated, service_role;\nGRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${t} TO service_role;`);
    }
    for (const f of out.facts.v2Functions) {
      expect(allSql, f.name).toContain(`REVOKE ALL ON FUNCTION public.${f.signature} FROM PUBLIC, anon, authenticated, service_role;\nGRANT EXECUTE ON FUNCTION public.${f.signature} TO service_role;`);
    }
  });

  it("modelo pior caso: 104 tabelas com exatamente DELETE/INSERT/SELECT/UPDATE e 38 funções executáveis pelo servidor; v1.0.1 ficava com ALL", () => {
    const acl = serverAcl(buildAccessModel(migrations));
    expect(Object.values(acl.tables).filter((p) => p.join(",") === "DELETE,INSERT,SELECT,UPDATE")).toHaveLength(104);
    expect(acl.functionsWithoutExecute).toEqual([]);
    const prev = serverAcl(buildAccessModel(buildV101(inputs).migrations));
    expect(Object.values(prev.tables).filter((p) => p.includes("ALL"))).toHaveLength(104);
  });

  it.each([
    ["REVOKE sem service_role", V102_MIGRATIONS[1], (s: string) => s.replace("REVOKE ALL ON TABLE public.access_invite_attempts FROM PUBLIC, anon, authenticated, service_role;", "REVOKE ALL ON TABLE public.access_invite_attempts FROM PUBLIC, anon, authenticated;"), /REVOKE sem normalizar service_role/],
    ["GRANT ALL ao servidor", V102_MIGRATIONS[1], (s: string) => `${s}\nGRANT ALL ON TABLE public.access_invite_attempts TO service_role;`, /GRANT ao servidor fora do conjunto exato/],
    ["GRANT TRUNCATE ao servidor", V102_MIGRATIONS[2], (s: string) => `${s}\nGRANT TRUNCATE ON TABLE public.profiles TO service_role;`, /GRANT ao servidor fora do conjunto exato/],
    ["GRANT com GRANT OPTION", V102_MIGRATIONS[3], (s: string) => `${s}\nGRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO service_role WITH GRANT OPTION;`, /fora do conjunto exato|GRANT a papel cliente/],
  ])("%s é apanhado", (_l, file, f, re) => {
    expect(rules(mutate(file, f)).join(" | ")).toMatch(re);
  });

  it("retirar service_role de um REVOKE deixa ALL no modelo (a auditoria de ACL distingue)", () => {
    const m = mutate(V102_MIGRATIONS[1], (s) => s.replace("REVOKE ALL ON TABLE public.access_invite_attempts FROM PUBLIC, anon, authenticated, service_role;", "REVOKE ALL ON TABLE public.access_invite_attempts FROM PUBLIC, anon, authenticated;"));
    expect(serverAcl(buildAccessModel(m)).tables.access_invite_attempts).toEqual(["ALL"]);
  });

  it("Q02 audita a ACL final entrada a entrada, colunas, dono e privilégios efetivos", () => {
    const q2 = qByName.get("Q02_seguranca.sql")!.sql;
    expect(q2).toContain("aclexplode(t2.relacl)");
    expect(q2).toContain("aclexplode(f2.proacl)");
    expect(q2).toContain("'service_role:DELETE:false,service_role:INSERT:false,service_role:SELECT:false,service_role:UPDATE:false'");
    expect(q2).toContain("'service_role:EXECUTE:false'");
    expect(q2).toMatch(/a\.attacl IS NOT NULL/);
    expect(q2).toMatch(/has_table_privilege\('service_role', oid, 'TRUNCATE'\)/);
  });
});

describe("E · verificações sem tautologias e com base separada", () => {
  const checks = queries.flatMap((q) => q.checks.map((c) => ({ ...c, file: q.name })));

  it("a deteção de tautologias encontra as 4 da v1.0.1 (prova de que funciona) e 0 na v1.0.2", () => {
    expect(tautologicalChecksV101(buildQueriesV101(buildV101(inputs).facts))).toEqual(["P03-15", "P04-09", "P04-10", "P04-11"]);
    expect(tautologicalChecksV101(queries)).toEqual([]);
  });

  it("nenhuma verificação testa só a forma de um valor calculado; formas de hash só sobre marcadores", () => {
    for (const c of checks) {
      const stripped = c.ok.replace(/'__[A-Z0-9_]+__' ~ '\^\[0-9a-f\]\{64\}\$'/g, "");
      expect(stripped, `${c.file} ${c.id}`).not.toMatch(/~ '\^\[0-9a-f\]/);
      expect(c.ok, `${c.file} ${c.id}`).not.toMatch(/^\((true|1 = 1|NOT false)\)$|^true$/i);
    }
  });

  it("md5 só aparece comparado com as constantes do staging", () => {
    const consts = [STAGING_BASELINE.hasRoleBodyMd5, STAGING_BASELINE.hasStagingAccessBodyMd5, STAGING_BASELINE.stagingNotesMd5];
    for (const c of checks.filter((x) => /md5\(/.test(x.ok))) expect(consts.some((k) => c.ok.includes(`= '${k}'`)), `${c.file} ${c.id}`).toBe(true);
  });

  it("exatamente 1 conta antes e depois; auth.identities lido em P04, P05 e Q03", () => {
    const get = (f: string, id: string) => qByName.get(f)!.checks.find((c) => c.id === id)!;
    expect(get("P04_conta_proprietario.sql", "P04-01").ok).toBe("(SELECT count(*) FROM auth.users) = 1");
    expect(get("Q03_conta_proprietario.sql", "Q03-01").ok).toBe("(SELECT count(*) FROM auth.users) = 1");
    for (const f of ["P04_conta_proprietario.sql", "P05_registo_base.sql", "Q03_conta_proprietario.sql"]) expect(qByName.get(f)!.sql, f).toContain("auth.identities");
    for (const q of queries) expect(q.sql, q.name).not.toMatch(/>= 1\) AND|count\(\*\) FROM auth\.users\) >= 1/);
  });

  it("P05 é um REGISTO separado: 7 impressões sha256, cada uma com cobertura exigida e comparada no Q03/Q04", () => {
    const p5 = qByName.get("P05_registo_base.sql")!;
    expect(p5.kind).toBe("registo");
    expect(p5.checks).toEqual([]);
    expect(p5.baseline.map((b) => b.id)).toEqual(["B01", "B02", "B03", "B04", "B05", "B06", "B07"]);
    expect(p5.sql).toMatch(/NÃO é uma verificação/);
    expect(p5.sql).toMatch(/'REGISTO INVÁLIDO: ' \|\| v\.falhas\)::int::text/);
    const ph = [PLACEHOLDERS.account, PLACEHOLDERS.identities, PLACEHOLDERS.roles, PLACEHOLDERS.policies, PLACEHOLDERS.functions, PLACEHOLDERS.tables, PLACEHOLDERS.type];
    const comparing = [...qByName.get("Q03_conta_proprietario.sql")!.checks, ...qByName.get("Q04_acesso_staging.sql")!.checks];
    p5.baseline.forEach((b, i) => {
      expect(b.value, b.id).toMatch(/^encode\(sha256\(/);
      expect(b.coverageOk, b.id).toMatch(/= [12]\b|>= 1/);
      const c = comparing.find((x) => x.ok.startsWith(`${b.value} = '${ph[i]}'`));
      expect(c, `${b.id} comparado com ${ph[i]}`).toBeTruthy();
    });
    for (const q of queries.filter((x) => x.kind === "verificacao")) expect(q.baseline).toEqual([]);
  });

  it("impressões cobrem predicados e papéis das políticas e atributos das funções do staging", () => {
    const p5 = qByName.get("P05_registo_base.sql")!.sql;
    for (const k of ["coalesce(qual, '~')", "coalesce(with_check, '~')", "array_to_string(roles, '+')", "p.prosecdef", "p.provolatile", "p.proconfig", "p.proacl", "pg_get_function_identity_arguments", "c.relacl", "a.attacl", "c.relforcerowsecurity", "identity_data ->> 'sub'"]) expect(p5, k).toContain(k);
    for (const secret of ["encrypted_password", "_token", "raw_user_meta_data"]) expect(p5, secret).not.toContain(secret);
  });

  it("instantes normalizados para época (não dependem do fuso da sessão)", () => {
    const p5 = qByName.get("P05_registo_base.sql")!.sql;
    expect(p5).toContain("extract(epoch FROM (u.j ->> 'created_at')::timestamptz)");
    expect(p5).toContain("extract(epoch FROM ur.created_at)");
    expect(p5).not.toMatch(/created_at::text/);
  });
});

describe("consultas: só leitura e falham de verdade", () => {
  const forbidden = /\b(insert|update|delete|merge|create|alter|drop|grant|revoke|truncate|copy|call|do|set|reset|lock|vacuum|comment|refresh|notify|listen|prepare|execute|begin|commit|rollback|savepoint)\b|set_config|nextval|setval|pg_advisory|dblink|lo_import|pg_read_file|has_staging_access\s*\(|\bhas_role\s*\(/i;
  it("12 ficheiros, cada um um único SELECT/WITH sem escrita", () => {
    expect(queries.map((q) => `${q.dir}/${q.name}`).sort()).toEqual([
      "posflight/Q00_alvo.sql", "posflight/Q01_estrutura.sql", "posflight/Q02_seguranca.sql", "posflight/Q03_conta_proprietario.sql",
      "posflight/Q04_acesso_staging.sql", "posflight/Q05_matriz_acesso.sql",
      "preflight/P00_alvo.sql", "preflight/P01_dono_historico.sql", "preflight/P02_privilegios_dono_historico.sql",
      "preflight/P03_colisoes.sql", "preflight/P04_conta_proprietario.sql", "preflight/P05_registo_base.sql",
    ]);
    for (const q of queries) {
      const code = codeOnly(q.sql).trim();
      expect(code, q.name).toMatch(/^with\b/i);
      expect(code.replace(/;\s*$/, ""), q.name).not.toContain(";");
      expect(code, q.name).not.toMatch(forbidden);
    }
  });

  it("veredito que dá erro, NULL conta como falha, contagem de linhas fechada", () => {
    for (const q of queries.filter((x) => x.kind === "verificacao")) {
      expect(q.sql, q.name).toContain("FILTER (WHERE ok IS NOT TRUE)");
      expect(q.sql, q.name).toMatch(/ELSE \('REPROVADO: ' \|\| v\.falhas\)::int::text END AS veredito/);
      const n = Number(/WHEN v\.n <> (\d+) THEN/.exec(q.sql)![1]);
      expect(n, q.name).toBe(q.checks.length);
    }
  });

  it("estrutura esperada coerente com a montagem (40 funções em public, 1259 colunas, 297 índices, 72 gatilhos)", () => {
    const q1 = qByName.get("Q01_estrutura.sql")!.sql;
    expect(q1).toMatch(/'1259 \/ [0-9a-f]{64}'/);
    expect(q1).toMatch(/'40 \/ [0-9a-f]{64}'/);
    expect(q1).toMatch(/'297 \/ [0-9a-f]{64}'/);
    expect(q1).toMatch(/'72 \/ [0-9a-f]{64}'/);
  });
});

describe("F · alvo do ensaio verificado fora do SQL", () => {
  const sh = read("tools/rehearsal_target_check.sh");
  it("usa pg_controldata, postgres -C e um nonce; sem cliente SQL, rede ou leitura de valores de variáveis", () => {
    expect(sh).toContain("pg_controldata");
    expect(sh).toContain("postgres -D \"$PGDATA_DIR\" -C listen_addresses");
    expect(sh).toContain("afonso-rehearsal.nonce");
    const code = sh.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
    expect(code).not.toMatch(/\b(psql|curl|wget|nc|ssh|printenv)\b/);
    expect(code).toMatch(/env \| sed 's\/=\.\*\/\/'/);
    expect(sh).toMatch(/NUNCA EXECUTADO/);
  });
  it("P00/Q00 declaram que não provam o alvo", () => {
    expect(qByName.get("P00_alvo.sql")!.sql).toMatch(/não prova sozinho qual é o servidor/);
    expect(qByName.get("Q00_alvo.sql")!.sql).toMatch(/fora do SQL/);
  });
});

describe("G · nada ligado, quarentena e teste bloqueado", () => {
  it("6 valores por omissão de envio a false", () => {
    for (const o of SEND_DEFAULT_OVERRIDES) expect(allSql).toMatch(new RegExp(`CREATE TABLE public\\.${o.table} \\([\\s\\S]*?    ${o.column} boolean DEFAULT false NOT NULL`));
    expect(read("BLOCKERS.md")).toMatch(/NÃO IMPEDEM ATIVAÇÕES FUTURAS/);
  });

  it("quarentena: única instrução ativa é a guarda que aborta", () => {
    for (const q of derived.filter((f) => f.path.endsWith(".quarantine"))) {
      const stmts = splitStatements(q.content);
      expect(stmts, q.path).toHaveLength(1);
      expect(stmts[0].text, q.path).toMatch(/^DO \$quarentena\$ BEGIN RAISE EXCEPTION 'QUARENTENA/);
    }
  });

  it("T01 bloqueado por guarda, termina em ROLLBACK, testa TRUNCATE do servidor e ausência das funções de quarentena", () => {
    const t = read("tests-db/T01_matriz_comportamental.bloqueado.sql");
    expect(splitStatements(t)[0].text).toMatch(/^DO \$bloqueado\$ BEGIN RAISE EXCEPTION 'BLOQUEADO/);
    expect(splitStatements(t).at(-1)!.text).toBe("ROLLBACK");
    expect(t).not.toMatch(/^\s*COMMIT\s*;/im);
    expect(t).toContain("TRUNCATE public.%I");
    expect(t).toContain("'merge_accounts_apply', 'merge_accounts_preview', 'handle_new_user'");
  });
});

describe("sem dados reais", () => {
  it("nenhum email real, telefone, UUID, segredo ou referência de produção em nenhum ficheiro", () => {
    for (const p of onDisk) {
      const text = readFileSync(join(PKG, p), "utf8");
      expect(text, p).not.toMatch(/saguii|meuafonso\.com|ydwthwusdlxlgyreulsd|bf908ebc|sk_live|sk_test|whsec_/i);
      for (const m of text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []) expect(m, p).toMatch(/\.invalid$/);
      expect(text.replace(/00000000-0000-0000-0000-000000000000/g, ""), p).not.toMatch(/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/i);
      // Fronteira hexadecimal: um sha256 pode conter 9 dígitos seguidos sem ser um telefone.
      expect(text, p).not.toMatch(/(?<![0-9a-fA-F])(?:\+?351[\s-]?)?9[1236]\d[\s-]?\d{3}[\s-]?\d{3}(?![0-9a-fA-F])/);
    }
  });
});
