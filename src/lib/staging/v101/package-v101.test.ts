import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { readInputs, walk } from "../../../../scripts/staging/build-staging-package-v101";
import { accessMatrix, auditMigrations, buildAccessModel } from "./audit";
import { buildV101 } from "./build";
import { buildSha256Sums, generateDerivedFiles, PACKAGE_DIR } from "./package";
import { parsePgDump } from "./pgdump";
import { PLACEHOLDERS } from "./queries";
import { GATE_POLICY_NAME, SEND_DEFAULT_OVERRIDES, SOURCE_DUMP, STAGING_PROJECT_ID, V101_MIGRATIONS } from "./rules";
import { skeleton, splitStatements, statementKind } from "./sql-split";

// Pacote v1.0.1 para o AFONSO Staging. Só ficheiros: nada aqui liga a uma base.
const PKG = join(process.cwd(), PACKAGE_DIR);
const inputs = readInputs();
const { files: derived, out } = generateDerivedFiles(inputs);
const read = (p: string) => readFileSync(join(PKG, p), "utf8");
const onDisk = walk(PKG).map((p) => relative(PKG, p).split("\\").join("/"));
const migrations = out.migrations;
const queries = derived.filter((f) => /^(preflight|posflight)\//.test(f.path));
const quarantine = derived.filter((f) => f.path.startsWith("quarantine/") && f.path.endsWith(".quarantine"));
const topLevel = migrations.flatMap((m) => splitStatements(m.sql).map((s) => ({ file: m.name, text: s.text, kind: statementKind(s.text), sk: skeleton(s.text) })));
const codeOnly = (s: string) => s.replace(/--[^\n]*/g, " ").replace(/'(?:[^']|'')*'/g, "''").replace(/"(?:[^"]|"")*"/g, '""');

describe("pacote v1.0.1: integridade e reprodutibilidade", () => {
  it("os ficheiros derivados no disco são byte a byte iguais à montagem", () => {
    for (const f of derived) expect(read(f.path), f.path).toBe(f.content);
  });

  it("SHA256SUMS cobre todos os ficheiros e confere; MANIFEST usa os mesmos hashes", () => {
    const all = onDisk.map((p) => ({ path: p, content: readFileSync(join(PKG, p)) }));
    expect(read("SHA256SUMS")).toBe(buildSha256Sums(all));
    const m = JSON.parse(read("MANIFEST.json"));
    const sums = new Map(read("SHA256SUMS").trim().split("\n").map((l) => [l.slice(66), l.slice(0, 64)]));
    for (const f of m.files) expect(sums.get(f.path), f.path).toBe(f.sha256);
    expect(m.files.length).toBe(onDisk.length - 2);
  });

  it("o manifesto declara destino, estado não executado, gates NO-GO e bloqueios", () => {
    const m = JSON.parse(read("MANIFEST.json"));
    expect(m.version).toBe("1.0.1");
    expect(m.executed).toBe(false);
    expect(m.target_project.id).toBe(STAGING_PROJECT_ID);
    expect(m.gates).toMatch(/NO-GO/);
    expect(m.source.sha256).toBe(SOURCE_DUMP.sha256);
    expect(m.blockers.join(" ")).toMatch(/NÃO ENSAIADO/);
    expect(m.migrations.map((x: { file: string }) => x.file)).toEqual(V101_MIGRATIONS.map((n) => `sql/${n}`));
  });

  it("recusa montar se o estado final de origem mudar", () => {
    expect(() => buildV101({ ...inputs, dump: `${inputs.dump}\n` })).toThrow(/dump de origem mudou/);
    expect(() => buildV101({ ...inputs, v100: inputs.v100.map((f, i) => (i === 1 ? { ...f, sql: `${f.sql} ` } : f)) })).toThrow(/alterado/);
  });

  it("a verificação de sintaxe guardada corresponde aos ficheiros atuais e deu 0 falhas", () => {
    const ev = read("evidence/parse-check.txt");
    expect(ev).toMatch(/RESULTADO: 0 falhas/);
    for (const f of [...migrations.map((m) => ({ path: `sql/${m.name}`, content: m.sql })), ...queries, ...quarantine]) {
      const h = createHash("sha256").update(f.content).digest("hex").slice(0, 16);
      expect(ev, f.path).toContain(`[${h}]`);
    }
  });
});

describe("migrações: só DDL aditivo", () => {
  it("auditoria estática sem violações", () => {
    expect(auditMigrations(migrations)).toEqual([]);
  });

  it("zero DML, DO, SELECT, SET, DROP, RENAME, TRUNCATE, DROP NOT NULL e CREATE OR REPLACE", () => {
    const bad = topLevel.filter((s) => ["insert", "update", "delete", "merge", "truncate", "copy", "select", "do", "set", "drop", "create_or_replace", "alter_table_other", "alter_other", "other"].includes(s.kind));
    expect(bad.map((s) => `${s.file}: ${s.sk.slice(0, 60)}`)).toEqual([]);
    for (const s of topLevel) expect(s.sk.replace(/\$BODY\$.*$/, ""), s.file).not.toMatch(/\bDROP\b|\bRENAME\b|\bTRUNCATE\b|\bOWNER TO\b/i);
  });

  it("só toca em objetos do staging com as 4 instruções aditivas previstas", () => {
    const touching = topLevel.filter((s) => /\b(user_roles|staging_notes|has_role|has_staging_access|app_role)\b/.test(s.sk.replace(/USING \(.*$|WITH CHECK \(.*$|\$BODY\$.*$/, "")) && s.kind !== "create_table" && s.kind !== "create_function");
    expect(touching.map((s) => s.sk)).toEqual([
      "ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS ''",
      "ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS ''",
      "ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS ''",
      "ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS created_by uuid",
    ]);
    expect(topLevel.some((s) => /^CREATE (TABLE|FUNCTION|TYPE) public\.(user_roles|staging_notes|has_role|has_staging_access|app_role)\b/.test(s.sk))).toBe(false);
  });

  it("ADD VALUE fica sozinho na primeira migração (o novo valor só se usa noutra transação)", () => {
    for (const m of migrations.slice(1)) expect(m.sql).not.toMatch(/ADD VALUE/);
    expect(migrations[0].sql).toMatch(/ADD VALUE IF NOT EXISTS 'super_admin'/);
  });

  it("chaves para auth.users: só profiles_id_fkey; as 84 retiradas estão em QZ-05", () => {
    const refs = topLevel.filter((s) => /REFERENCES auth\.users/i.test(s.sk));
    expect(refs.map((s) => s.sk)).toEqual(["ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE"]);
    expect(out.facts.removedAuthFks).toHaveLength(84);
    const qz5 = read("quarantine/QZ-05_chaves_auth_users_retiradas.quarantine");
    for (const r of out.facts.removedAuthFks) expect(qz5).toContain(r.constraint);
  });

  it("sem gatilho em auth.users, sem storage, sem Realtime, sem agendador/rede/segredos", () => {
    const all = migrations.map((m) => m.sql).join("\n");
    expect(all).not.toMatch(/ON auth\.users|storage\.objects|ALTER PUBLICATION|REPLICA IDENTITY/i);
    expect(all).not.toMatch(/cron\.(un)?schedule|net\.http_|vault\.|dblink/i);
  });

  it("cada função SQL só depende de tabelas já criadas e de funções anteriores", () => {
    const order: string[] = [];
    for (const s of topLevel) if (s.kind === "create_function") order.push(/^CREATE FUNCTION public\.(\w+)/.exec(s.sk)![1]);
    const tables = new Set(out.facts.v2Tables);
    for (const s of topLevel.filter((x) => x.kind === "create_function" && /LANGUAGE sql/.test(x.text))) {
      const me = /^CREATE FUNCTION public\.(\w+)/.exec(s.sk)![1];
      for (const m of s.text.matchAll(/public\.(\w+)\s*\(/g)) {
        if (m[1] === me || ["has_role", "has_staging_access"].includes(m[1]) || tables.has(m[1])) continue;
        expect(order.indexOf(m[1]), `${me} usa ${m[1]}`).toBeGreaterThanOrEqual(0);
        expect(order.indexOf(m[1]), `${me} usa ${m[1]} antes de existir`).toBeLessThan(order.indexOf(me));
      }
    }
  });
});

describe("deny-by-default e barreira admin/tester", () => {
  it("cada tabela nasce com RLS, barreira e permissões só do servidor, na mesma migração", () => {
    for (const t of out.facts.v2Tables) {
      const file = migrations.find((m) => m.name === out.facts.tableMigration[t])!;
      const block = file.sql.slice(file.sql.indexOf(`-- ----- tabela public.${t} -----`));
      const next = block.indexOf("-- -----", 10);
      const b = next > 0 ? block.slice(0, next) : block;
      expect(b, t).toContain(`CREATE TABLE public.${t} (`);
      expect(b, t).toContain(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY;`);
      expect(b, t).toContain(`CREATE POLICY ${GATE_POLICY_NAME} ON public.${t} AS RESTRICTIVE FOR ALL TO anon, authenticated USING (public.has_staging_access(auth.uid())) WITH CHECK (public.has_staging_access(auth.uid()));`);
      expect(b, t).toContain(`REVOKE ALL ON TABLE public.${t} FROM PUBLIC, anon, authenticated;`);
      expect(b, t).toContain(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${t} TO service_role;`);
    }
  });

  it("cada função perde EXECUTE para clientes logo a seguir à criação", () => {
    for (const fn of out.facts.v2Functions) {
      const all = migrations.map((m) => m.sql).join("\n");
      const at = all.indexOf(`-- ----- função public.${fn.signature} -----`);
      const b = all.slice(at, all.indexOf("-- -----", at + 10) > 0 ? all.indexOf("-- -----", at + 10) : undefined);
      expect(b, fn.name).toContain(`REVOKE ALL ON FUNCTION public.${fn.signature} FROM PUBLIC, anon, authenticated;`);
      expect(b, fn.name).toContain(`GRANT EXECUTE ON FUNCTION public.${fn.signature} TO service_role;`);
    }
  });

  it("nenhum GRANT a anon, authenticated ou PUBLIC; nenhuma política permissiva para PUBLIC/anon", () => {
    for (const s of topLevel.filter((x) => x.kind === "grant")) expect(s.sk).toMatch(/ TO service_role$/);
    for (const s of topLevel.filter((x) => x.kind === "create_policy" && !x.sk.includes("AS RESTRICTIVE"))) {
      expect(s.sk).toMatch(/ TO (authenticated|service_role)(, service_role)?( USING| WITH CHECK)/);
    }
    const plan = topLevel.find((s) => s.sk.startsWith('CREATE POLICY "Published plans are readable by anyone"'))!;
    expect(plan.sk).toMatch(/FOR SELECT TO authenticated USING/);
  });

  it("matriz (pior caso): anon, sem papel, tester e admin sem acesso direto; servidor com tudo", () => {
    const m = Object.fromEntries(accessMatrix(buildAccessModel(migrations)).map((r) => [r.principal, r]));
    for (const p of ["anon", "authenticated_sem_papel", "tester", "admin"] as const) {
      expect(m[p].tablesWithDirectAccess, p).toBe(0);
      expect(m[p].executableFunctions, p).toBe(0);
      expect(m[p].tablesUnderGate, p).toBe(104);
    }
    expect(m.service_role.tablesWithDirectAccess).toBe(104);
    expect(m.service_role.executableFunctions).toBe(41);
  });

  it("barreira: se uma tabela fosse aberta, anon e sem papel continuam negados; tester e admin iguais", () => {
    const m = Object.fromEntries(accessMatrix(buildAccessModel(migrations)).map((r) => [r.principal, r]));
    expect(m.anon.tablesIfGrantedToClient).toBe(0);
    expect(m.authenticated_sem_papel.tablesIfGrantedToClient).toBe(0);
    expect(m.tester.tablesIfGrantedToClient).toBeGreaterThan(0);
    expect(m.admin.tablesIfGrantedToClient).toBe(m.tester.tablesIfGrantedToClient);
  });

  it("a matriz da v1.0.0 mostra os achados (prova de que o modelo distingue)", () => {
    const m = Object.fromEntries(accessMatrix(buildAccessModel(inputs.v100, false)).map((r) => [r.principal, r]));
    expect(m.anon.tablesWithDirectAccess).toBeGreaterThan(0);
    expect(m.authenticated_sem_papel.tablesWithDirectAccess).toBeGreaterThan(90);
    expect(m.authenticated_sem_papel.tablesUnderGate).toBe(0);
  });
});

describe("testes negativos: as verificações apanham cada regressão", () => {
  const mutate = (name: string, f: (sql: string) => string) => migrations.map((m) => (m.name === name ? { ...m, sql: f(m.sql) } : m));
  const rules = (ms: { name: string; sql: string }[]) => auditMigrations(ms).map((v) => v.rule);
  it.each([
    ["INSERT", V101_MIGRATIONS[1], (s: string) => `${s}\nINSERT INTO public.feature_flags (key) VALUES ('x');`, /instrução não permitida \(insert\)/],
    ["UPDATE", V101_MIGRATIONS[1], (s: string) => `${s}\nUPDATE public.feature_flags SET enabled_globally = true;`, /instrução não permitida \(update\)/],
    ["DROP COLUMN", V101_MIGRATIONS[2], (s: string) => `${s}\nALTER TABLE public.profiles DROP COLUMN plan_tier;`, /operação destrutiva|alter_table_other/],
    ["DROP NOT NULL", V101_MIGRATIONS[2], (s: string) => `${s}\nALTER TABLE public.profiles ALTER COLUMN id DROP NOT NULL;`, /operação destrutiva|alter_table_other/],
    ["RENAME", V101_MIGRATIONS[2], (s: string) => `${s}\nALTER TABLE public.telegram_invites RENAME COLUMN a TO b;`, /operação destrutiva/],
    ["GRANT a anon", V101_MIGRATIONS[1], (s: string) => `${s}\nGRANT SELECT ON TABLE public.plan_configs TO anon;`, /GRANT a papel cliente/],
    ["política PUBLIC", V101_MIGRATIONS[5], (s: string) => `${s}\nCREATE POLICY x ON public.plan_configs FOR SELECT USING (true);`, /permissiva para PUBLIC\/anon/],
    ["FK auth.users", V101_MIGRATIONS[4], (s: string) => `${s}\nALTER TABLE ONLY public.people ADD CONSTRAINT p_fk FOREIGN KEY (user_id) REFERENCES auth.users(id);`, /auth\.users fora de profiles/],
    ["substituir has_role", V101_MIGRATIONS[3], (s: string) => `${s}\nCREATE OR REPLACE FUNCTION public.has_role(uuid, public.app_role) RETURNS boolean LANGUAGE sql AS $$ select true $$;`, /CREATE OR REPLACE/],
    ["gatilho em auth.users", V101_MIGRATIONS[4], (s: string) => `${s}\nCREATE TRIGGER t AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();`, /schema gerido/],
    ["SET de sessão", V101_MIGRATIONS[1], (s: string) => `SET check_function_bodies = false;\n${s}`, /instrução não permitida \(set\)/],
    ["agendador", V101_MIGRATIONS[3], (s: string) => s.replace("BEGIN", "BEGIN PERFORM cron.schedule('x', '* * * * *', 'select 1');"), /agendamento/],
  ])("%s", (_l, file, f, re) => {
    expect(rules(mutate(file, f)).join(" | ")).toMatch(re);
  });

  it("retirar uma barreira ou um REVOKE de função aparece na matriz", () => {
    const noGate = mutate(V101_MIGRATIONS[1], (s) => s.replace(/CREATE POLICY staging_gate_admin_tester ON public\.access_invite_attempts [^\n]*\n/, ""));
    expect(accessMatrix(buildAccessModel(noGate))[1].tablesUnderGate).toBe(103);
    const noRevoke = mutate(V101_MIGRATIONS[3], (s) => s.replace(/REVOKE ALL ON FUNCTION public\.is_admin\(uuid\) FROM PUBLIC, anon, authenticated;\n/, ""));
    expect(accessMatrix(buildAccessModel(noRevoke))[0].executableFunctions).toBe(1);
    const noTableRevoke = mutate(V101_MIGRATIONS[1], (s) => s.replace(/REVOKE ALL ON TABLE public\.access_invite_attempts FROM PUBLIC, anon, authenticated;\n/, ""));
    const m = accessMatrix(buildAccessModel(noTableRevoke));
    expect(m[0].tablesWithDirectAccess).toBe(0); // anon: a barreira ainda nega
    expect(m[2].tablesWithDirectAccess).toBe(1); // tester passa a chegar: o REVOKE é necessário
  });
});

describe("nenhuma configuração de envio ativa", () => {
  it("os 6 valores por omissão de envio passam a false e nada mais muda no texto das tabelas", () => {
    const dumpTables = new Map(parsePgDump(inputs.dump).filter((e) => e.type === "TABLE").map((e) => [e.name, splitStatements(e.sql)[0].text]));
    const created = new Map(topLevel.filter((s) => s.kind === "create_table").map((s) => [/^CREATE TABLE public\.(\w+)/.exec(s.text)![1], s.text]));
    for (const [t, sql] of created) {
      let expected = dumpTables.get(t)!;
      for (const o of SEND_DEFAULT_OVERRIDES.filter((x) => x.table === t)) expected = expected.replace(new RegExp(`(    ${o.column} boolean DEFAULT )true`), "$1false");
      expect(sql, t).toBe(expected);
    }
    for (const o of SEND_DEFAULT_OVERRIDES) expect(created.get(o.table)!).toMatch(new RegExp(`    ${o.column} boolean DEFAULT false NOT NULL`));
  });
});

describe("quarentena não executável", () => {
  it("única instrução ativa é a guarda que aborta; o resto está comentado", () => {
    for (const q of quarantine) {
      const stmts = splitStatements(q.content);
      expect(stmts, q.path).toHaveLength(1);
      expect(stmts[0].text, q.path).toMatch(/^DO \$quarentena\$ BEGIN RAISE EXCEPTION 'QUARENTENA/);
      for (const l of q.content.split("\n")) expect(l === "" || l.startsWith("--") || l.startsWith("DO $quarentena$"), `${q.path}: ${l.slice(0, 40)}`).toBe(true);
    }
  });

  it("contém as 90 instruções de dados da v1.0.0, o gatilho, o Realtime e as 4 políticas de storage", () => {
    expect(out.v100.dml).toHaveLength(90);
    const qz1 = read("quarantine/QZ-01_dml_v1.0.0.quarantine");
    expect((qz1.match(/^--Q\| -- \[/gm) ?? []).length).toBe(90);
    expect(read("quarantine/QZ-02_gatilho_auth_users.quarantine")).toMatch(/--Q\| CREATE TRIGGER on_auth_user_created/);
    expect(read("quarantine/QZ-03_realtime.quarantine")).toMatch(/ALTER PUBLICATION supabase_realtime ADD TABLE public\.assessor_messages/);
    expect((read("quarantine/QZ-04_politicas_storage_v1.0.0.quarantine").match(/--Q\| CREATE POLICY/g) ?? []).length).toBe(4);
  });

  it("o teste comportamental T01 está bloqueado por guarda e termina em ROLLBACK", () => {
    const t = read("tests-db/T01_matriz_comportamental.bloqueado.sql");
    const first = splitStatements(t)[0].text;
    expect(first).toMatch(/^DO \$bloqueado\$ BEGIN RAISE EXCEPTION 'BLOQUEADO/);
    expect(splitStatements(t).at(-1)!.text).toBe("ROLLBACK");
    expect(t).not.toMatch(/^\s*COMMIT\s*;/im);
  });
});

describe("preflight e posflight que falham de verdade", () => {
  const forbidden = /\b(insert|update|delete|merge|create|alter|drop|grant|revoke|truncate|copy|call|do|set|reset|lock|vacuum|comment|refresh|notify|listen|prepare|execute|begin|commit|rollback|savepoint)\b|set_config|nextval|setval|pg_advisory|dblink|lo_import|pg_read_file|has_staging_access\s*\(|\bhas_role\s*\(/i;
  it("11 consultas, cada uma um único SELECT/WITH sem escrita", () => {
    expect(queries.map((q) => q.path).sort()).toEqual([
      "posflight/Q00_alvo.sql", "posflight/Q01_estrutura.sql", "posflight/Q02_seguranca.sql", "posflight/Q03_conta_proprietario.sql",
      "posflight/Q04_acesso_staging.sql", "posflight/Q05_matriz_acesso.sql",
      "preflight/P00_alvo.sql", "preflight/P01_executor_migracoes.sql", "preflight/P02_privilegios_executor.sql",
      "preflight/P03_colisoes.sql", "preflight/P04_conta_proprietario.sql",
    ]);
    for (const q of queries) {
      const code = codeOnly(q.content).trim();
      expect(code, q.path).toMatch(/^with\b/i);
      expect(code.replace(/;\s*$/, ""), q.path).not.toContain(";");
      expect(code, q.path).not.toMatch(forbidden);
    }
  });

  it("veredito que dá erro, NULL conta como falha e nenhuma verificação é sempre verdadeira", () => {
    for (const q of queries) {
      expect(q.content, q.path).toContain("FILTER (WHERE ok IS NOT TRUE)");
      expect(q.content, q.path).toMatch(/ELSE \('REPROVADO: ' \|\| v\.falhas\)::int::text END AS veredito/);
      expect(q.content, q.path).toMatch(/WHEN v\.n <> \d+ THEN/);
      const rows = q.content.match(/^\s+(?:SELECT|UNION ALL SELECT) '[PQ]\d\d-\d\d'::text, '(?:[^']|'')*'::text, \((.*?)\)::boolean, /gm) ?? [];
      const n = Number(/WHEN v\.n <> (\d+) THEN/.exec(q.content)![1]);
      expect(rows.length, q.path).toBe(n);
      for (const r of rows) expect(r, q.path).not.toMatch(/\((true|1 = 1|NOT false)\)::boolean/i);
    }
  });

  it("marcadores: email em P04/Q03; impressões de P04 e P03 comparadas no Q03/Q04", () => {
    const byPath = new Map(queries.map((q) => [q.path, q.content]));
    expect(byPath.get("preflight/P04_conta_proprietario.sql")).toContain(PLACEHOLDERS.email);
    const q3 = byPath.get("posflight/Q03_conta_proprietario.sql")!;
    for (const p of [PLACEHOLDERS.email, PLACEHOLDERS.identity, PLACEHOLDERS.accountRoles, PLACEHOLDERS.allRoles, PLACEHOLDERS.totalAccounts]) expect(q3).toContain(p);
    expect(byPath.get("posflight/Q04_acesso_staging.sql")).toContain(PLACEHOLDERS.stagingAcl);
  });

  it("os valores esperados batem com o ensaio da v1.0.0 onde devem bater", () => {
    const q1 = queries.find((q) => q.path === "posflight/Q01_estrutura.sql")!.content;
    expect(q1).toMatch(/'1259 \/ [0-9a-f]{32}'/); // colunas
    expect(q1).toMatch(/'43 \/ [0-9a-f]{32}'/); // funções
    expect(q1).toMatch(/'297 \/ [0-9a-f]{32}'/); // índices
    expect(q1).toMatch(/'72 \/ [0-9a-f]{32}'/); // gatilhos em public
    expect(q1).toMatch(/'8 \/ [0-9a-f]{32}'/); // enums e FORCE RLS
  });
});

describe("sem dados reais", () => {
  it("nenhum email real, telefone, UUID, segredo ou referência de produção em nenhum ficheiro do pacote", () => {
    for (const p of onDisk) {
      const text = readFileSync(join(PKG, p), "utf8");
      expect(text, p).not.toMatch(/saguii|meuafonso\.com|ydwthwusdlxlgyreulsd|bf908ebc|sk_live|sk_test|whsec_/i);
      for (const m of text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []) expect(m, p).toMatch(/\.invalid$/);
      expect(text.replace(/00000000-0000-0000-0000-000000000000/g, ""), p).not.toMatch(/'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/i);
      expect(text, p).not.toMatch(/(?<!\d)(?:\+?351[\s-]?)?9[1236]\d[\s-]?\d{3}[\s-]?\d{3}(?!\d)/);
    }
  });
});
