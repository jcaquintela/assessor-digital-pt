import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { readInputs, walk } from "../../../../scripts/staging/build-staging-package-v101";
import { STAGING_PROJECT_ID } from "../v101/rules";
import { buildDiffV103, buildSha256SumsV103, generateDerivedFilesV103, PACKAGE_DIR_V103 } from "./package";
import { P02_NEW_IDS, P02_REPLACED_ID } from "./queries";
import { BLOCKERS_V103, V103_CHANGED_QUERY, V103_COPIED_HANDWRITTEN, V103_PRESERVED_SQL_SHA256, V103_PREVIOUS_DIR } from "./rules";

// Pacote v1.0.3 para o AFONSO Staging. Testes SÓ ESTÁTICOS: nada aqui liga a uma base nem corre um script do ensaio.
const ROOT = process.cwd();
const PKG = join(ROOT, PACKAGE_DIR_V103);
const PREV = join(ROOT, V103_PREVIOUS_DIR);
const { files: derived, queries, prevQueries, r30 } = generateDerivedFilesV103(readInputs());
const read = (p: string) => readFileSync(join(PKG, p), "utf8");
const readPrev = (p: string) => readFileSync(join(PREV, p), "utf8");
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const onDisk = walk(PKG).map((p) => relative(PKG, p).split("\\").join("/"));
const prevOnDisk = walk(PREV).map((p) => relative(PREV, p).split("\\").join("/"));
const shellCode = (s: string) => s.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
const scripts = onDisk.filter((p) => /^tools\/.*\.sh$/.test(p));
const blocked = onDisk.filter((p) => p.endsWith(".bloqueado.sql"));
const newFiles = onDisk.filter((p) => !prevOnDisk.includes(p) || read(p) !== readPrev(p));

describe("v1.0.3: integridade e reprodutibilidade", () => {
  it("ficheiros derivados no disco = montagem; DIFF reproduzível", () => {
    for (const f of derived) expect(read(f.path), f.path).toBe(f.content);
    const all = onDisk.map((p) => ({ path: p, content: readFileSync(join(PKG, p)) }));
    expect(read("DIFF-v1.0.2.md")).toBe(buildDiffV103(readPrev("SHA256SUMS"), all, prevQueries, queries));
  });

  it("SHA256SUMS cobre todos os ficheiros e confere; MANIFEST usa os mesmos hashes", () => {
    const all = onDisk.map((p) => ({ path: p, content: readFileSync(join(PKG, p)) }));
    expect(read("SHA256SUMS")).toBe(buildSha256SumsV103(all));
    const m = JSON.parse(read("MANIFEST.json"));
    const sums = new Map(read("SHA256SUMS").trim().split("\n").map((l) => [l.slice(66), l.slice(0, 64)]));
    for (const f of m.files) expect(sums.get(f.path), f.path).toBe(f.sha256);
    expect(m.files.length).toBe(onDisk.length - 2);
  });

  it("manifesto: não executado, ensaio não autorizado, NO-GO, pendentes declarados", () => {
    const m = JSON.parse(read("MANIFEST.json"));
    expect(m.version).toBe("1.0.3");
    expect(m.executed).toBe(false);
    expect(m.rehearsal_authorized).toBe(false);
    expect(m.gates).toMatch(/NO-GO/);
    expect(m.target_project.id).toBe(STAGING_PROJECT_ID);
    expect(m.supersedes).toEqual({ version: "1.0.2", commit: "09f7e48b" });
    expect(m.evidence_status.executor_effective_role).toMatch(/^PENDENTE/);
    expect(m.evidence_status.rehearsal_target).toMatch(/NÃO provam isolamento/);
    expect(m.evidence_status.operator_preconditions).toMatch(/POR VERIFICAR/);
    expect(m.rehearsal_plan.status).toMatch(/NÃO AUTORIZADO/);
    expect(m.scripts.every((s: { executed: boolean }) => s.executed === false)).toBe(true);
    expect(BLOCKERS_V103.every((b) => b.resolved === false)).toBe(true);
  });

  it("a verificação de sintaxe guardada corresponde aos ficheiros atuais e deu 0 falhas", () => {
    const ev = read("evidence/parse-check.txt");
    expect(ev).toMatch(/RESULTADO: 0 falhas/);
    const sqlFiles = onDisk.filter((p) => /^(sql|preflight|posflight|ensaio|tests-db)\/.*\.sql$/.test(p));
    for (const p of sqlFiles) expect(ev, p).toContain(`[${sha(read(p)).slice(0, 16)}]`);
    for (const p of scripts) expect(ev, p).toContain(`${p} [${sha(read(p)).slice(0, 16)}]`);
  });

  it("as versões anteriores continuam byte a byte iguais aos seus SHA256SUMS", () => {
    for (const v of ["v1.0.1", "v1.0.2"]) {
      const dir = join(ROOT, "staging-install/package", v);
      for (const l of readFileSync(join(dir, "SHA256SUMS"), "utf8").trim().split("\n")) {
        expect(sha(readFileSync(join(dir, l.slice(66)))), `${v}/${l.slice(66)}`).toBe(l.slice(0, 64));
      }
    }
  });
});

describe("v1.0.3: o que NÃO muda", () => {
  it("S4-00…S4-05 com os 6 sha256 auditados e iguais byte a byte à v1.0.2", () => {
    const sqlFiles = onDisk.filter((p) => p.startsWith("sql/")).sort();
    expect(sqlFiles).toEqual(Object.keys(V103_PRESERVED_SQL_SHA256).map((n) => `sql/${n}`).sort());
    for (const [n, h] of Object.entries(V103_PRESERVED_SQL_SHA256)) {
      expect(sha(readFileSync(join(PKG, "sql", n))), n).toBe(h);
      expect(read(`sql/${n}`)).toBe(readPrev(`sql/${n}`));
    }
  });

  it("só o P02 muda entre as P/Q; quarentena, ACCESS-MATRIX e documentos copiados iguais", () => {
    for (const p of onDisk.filter((x) => /^(preflight|posflight|quarantine)\//.test(x) || x === "ACCESS-MATRIX.md" || (V103_COPIED_HANDWRITTEN as readonly string[]).includes(x))) {
      if (p === V103_CHANGED_QUERY) expect(read(p)).not.toBe(readPrev(p));
      else expect(read(p), p).toBe(readPrev(p));
    }
  });

  it("F1: pg_get_userbyid(oid) mantém-se onde estava (P01, P05, Q02 iguais)", () => {
    for (const p of ["preflight/P01_dono_historico.sql", "preflight/P05_registo_base.sql", "posflight/Q02_seguranca.sql"]) expect(read(p)).toBe(readPrev(p));
    expect(readPrev("preflight/P01_dono_historico.sql")).toMatch(/pg_get_userbyid/);
  });

  it("revokes/só servidor: nenhuma migração dá acesso a cliente", () => {
    for (const n of Object.keys(V103_PRESERVED_SQL_SHA256)) expect(read(`sql/${n}`)).not.toMatch(/GRANT[^;]*\bTO\s+(anon|authenticated|PUBLIC)\b/i);
  });
});

describe("v1.0.3: R4 unaccent INSTALADA vs NOVA", () => {
  const p2 = queries.find((q) => `${q.dir}/${q.name}` === V103_CHANGED_QUERY)!;
  const prev2 = prevQueries.find((q) => `${q.dir}/${q.name}` === V103_CHANGED_QUERY)!;
  const byId = new Map(p2.checks.map((c) => [c.id, c]));

  it("P02-07 substituída, P02-10…15 novas, as restantes iguais", () => {
    expect(p2.checks.map((c) => c.id)).toEqual([...prev2.checks.map((c) => c.id), ...P02_NEW_IDS].sort());
    for (const c of prev2.checks.filter((c) => c.id !== P02_REPLACED_ID)) expect(byId.get(c.id)).toEqual(c);
    expect(byId.get("P02-07")!.ok).toMatch(/IN \('INSTALADA', 'NOVA'\)/);
  });

  it("condicionais: INSTALADA ignora os de NOVA e vice-versa; nenhum outro estado passa", () => {
    for (const id of ["P02-10", "P02-11"]) expect(byId.get(id)!.ok.startsWith(`(SELECT estado FROM est) = 'NOVA' OR`)).toBe(true);
    for (const id of ["P02-12", "P02-13", "P02-14"]) expect(byId.get(id)!.ok.startsWith(`(SELECT estado FROM est) = 'INSTALADA' OR`)).toBe(true);
    expect(byId.get("P02-13")!.ok).toContain("current_database(), 'CREATE')");
    expect(byId.get("P02-13")!.ok).toContain("'extensions', 'CREATE')");
    expect(byId.get("P02-11")!.ok).toMatch(/has_function_privilege\('service_role'/);
  });

  it("veredito continua só como dono histórico (executor real pendente)", () => {
    expect(read(V103_CHANGED_QUERY)).toMatch(/APROVADO SÓ COMO DONO HISTÓRICO/);
    expect(read("EXECUTOR-PRIVILEGES.md")).toMatch(/\*\*PENDENTE\*\*/);
  });
});

describe("v1.0.3: R1–R3 alvo do ensaio (preparado, não executado)", () => {
  it("R30: um SELECT que falha com erro; marcadores só por substituir", () => {
    const s = read("ensaio/R30_sessao_alvo.sql");
    expect(s).toBe(r30.sql);
    expect(s).toMatch(/RAISE|REPROVADO/);
    expect(s.match(/__R_[A-Z0-9_]+__/g)!.length).toBeGreaterThan(0);
    for (const id of ["R30-02", "R30-03", "R30-04", "R30-05", "R30-06", "R30-10", "R30-11"]) expect(r30.checks.map((c) => c.id)).toContain(id);
  });

  it("scripts R*: exigem AUTORIZADO, não imprimem valores de ambiente, sem rede nem palavras-passe nem pg_ctl", () => {
    expect(scripts.sort()).toEqual(["tools/R10_arranque_controlado.sh", "tools/R20_verificar_processo.sh", "tools/R40_ligar_cliente.sh", "tools/R41_processo_cliente.sh", "tools/R90_descartar.sh", "tools/lib_ensaio.sh"]);
    for (const p of scripts) {
      const code = shellCode(read(p));
      if (p !== "tools/lib_ensaio.sh") expect(code, p).toMatch(/exige_autorizacao "\$\{1:-\}"/);
      expect(code.replace(/"[^"\n]*"/g, '""'), p).not.toMatch(/(?<![./*\w-])(curl|wget|nc|ncat|ssh|scp|pg_ctl|printenv)\b|PGPASSWORD|\.pgpass|\benv\s*$|\benv\s*\|/m);
      expect(code, p).not.toMatch(/\bset\s+-x/);
    }
    const lib = shellCode(read("tools/lib_ensaio.sh"));
    expect(lib).toMatch(/sed 's\/=\.\*\/\/'/);
    // Só o R40 liga a uma base, e só por socket na pasta do ensaio.
    for (const p of scripts) if (p !== "tools/R40_ligar_cliente.sh") expect(shellCode(read(p)), p).not.toMatch(/\/psql"\s+-/);
    expect(read("tools/R40_ligar_cliente.sh")).toMatch(/host=\$ROOT\/sock/);
  });

  it("R2: rede verificada para servidor E cliente; R1: processo, executável e socket", () => {
    expect(read("tools/R20_verificar_processo.sh")).toMatch(/rede_isolada_ou_falha "\$PID"/);
    expect(read("tools/R40_ligar_cliente.sh")).toMatch(/rede_isolada_ou_falha "\$\$"/);
    expect(read("tools/R41_processo_cliente.sh")).toMatch(/rede_isolada_ou_falha "\$CLI"/);
    const r20 = read("tools/R20_verificar_processo.sh");
    for (const s of ["postmaster.pid", "/proc/$PID/exe", "/proc/$PID/cwd", "argumentos.esperados", "socket:[$INODE]", "include_dir", "postgresql.auto.conf", "pg_ident.conf", "dentro de PGDATA"]) expect(r20).toContain(s);
  });

  it("os documentos dizem que os scripts sozinhos não provam isolamento e listam E1–E9", () => {
    const t = read("REHEARSAL-TARGET.md");
    expect(t).toMatch(/os scripts sozinhos não provam isolamento/);
    for (let i = 1; i <= 9; i++) expect(t).toContain(`| E${i} |`);
    for (const d of ["README.md", "REHEARSAL-PLAN.md", "TEST-CRITERIA.md"]) expect(read(d)).not.toMatch(/isolamento (garantido|total|absoluto)/i);
  });
});

describe("v1.0.3: R5 bootstrap sintético e T01 só descartável", () => {
  it("cada ficheiro bloqueado começa pela guarda BLOQUEADO e depois a guarda SÓ DESCARTÁVEL", () => {
    expect(blocked.sort()).toEqual(["ensaio/B00_papeis_e_base.bloqueado.sql", "ensaio/B01_plataforma_sintetica.bloqueado.sql", "ensaio/B01b_unaccent_instalada.bloqueado.sql", "ensaio/B02_papel_admin_sintetico.bloqueado.sql", "tests-db/T01_matriz_comportamental.bloqueado.sql"]);
    for (const p of blocked) {
      const active = read(p).split("\n").filter((l) => l.trim() && !l.startsWith("--"));
      expect(active[0], p).toMatch(/^DO \$bloqueado\$ BEGIN RAISE EXCEPTION 'BLOQUEADO/);
      expect(active[1], p).toBe("DO $so_descartavel$ BEGIN");
      expect(read(p)).toContain("'__R_NONCE_SHA256__'");
    }
  });

  it("T01: corpo M1–M7 igual à v1.0.2", () => {
    const body = (s: string) => s.slice(s.indexOf("\nBEGIN;"));
    expect(body(read("tests-db/T01_matriz_comportamental.bloqueado.sql"))).toBe(body(readPrev("tests-db/T01_matriz_comportamental.bloqueado.sql")));
  });

  it("só dados sintéticos: emails .invalid, sem palavras-passe, tokens, telefones nem UUIDs fixos", () => {
    for (const p of [...blocked, ...newFiles.filter((x) => /\.(sql|psql|sh|md)$/.test(x))]) {
      const s = read(p);
      for (const e of s.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]+/g) ?? []) expect(e, p).toMatch(/@afonso-staging\.invalid$/);
      for (const u of s.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi) ?? []) expect(u, p).toBe(STAGING_PROJECT_ID);
      expect(s, p).not.toMatch(/\+351|\b9[1236]\d{7}\b|meuafonso\.com|ydwthwusdlxlgyreulsd/);
    }
    for (const p of blocked.filter((x) => x.startsWith("ensaio/"))) expect(read(p), p).not.toMatch(/encrypted_password\s*[,)]\s*(VALUES|SELECT)|PASSWORD\s+'/i);
  });

  it("plano: ordem com T01 separado no fim e descarte em qualquer erro", () => {
    const m = JSON.parse(read("MANIFEST.json"));
    const o: string[] = m.rehearsal_plan.order;
    expect(o.indexOf("P00–P04")).toBeLessThan(o.indexOf("S4-00…S4-05 (uma transação por ficheiro)"));
    expect(o.indexOf("Q00–Q05")).toBeLessThan(o.indexOf("T01 (separado, só descartável)"));
    expect(o[o.length - 1]).toMatch(/^R90/);
    expect(m.rehearsal_plan.on_any_error).toMatch(/ABORTAR e DESCARTAR/);
    expect(read("REHEARSAL-PLAN.md")).toMatch(/NÃO AUTORIZADO\. NÃO EXECUTADO/);
  });
});
