import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { readInputs, walk } from "../../../../scripts/staging/build-staging-package-v101";
import { STAGING_PROJECT_ID } from "../v101/rules";
import { buildR30 } from "../v103/queries";
import { buildDiffV104, buildManifestV104, buildSha256SumsV104, generateDerivedFilesV104, PACKAGE_DIR_V104 } from "./package";
import { BOOTSTRAP_SUPER, P02_V104_NEW, P02_V104_REPLACED } from "./queries";
import { BLOCKERS_V104, OPERATOR_OBLIGATIONS, R31_MARKERS, R32_MARKERS, SESSION_STEPS, STAGING_0000_INPUT_V104, SYNTHETIC_EMAIL, V104_CHANGED_QUERY, V104_COPIED_HANDWRITTEN, V104_PRESERVED_SQL_SHA256, V104_PREVIOUS_DIR } from "./rules";

// Pacote v1.0.4 para o AFONSO Staging. Testes SÓ ESTÁTICOS: nada aqui liga a uma base nem corre um script ou guião do ensaio.
const ROOT = process.cwd();
const PKG = join(ROOT, PACKAGE_DIR_V104);
const PREV = join(ROOT, V104_PREVIOUS_DIR);
const gen = generateDerivedFilesV104(readInputs());
const { files: derived, queries, prevQueries, r30, r31, r32 } = gen;
const read = (p: string) => readFileSync(join(PKG, p), "utf8");
const readPrev = (p: string) => readFileSync(join(PREV, p), "utf8");
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const onDisk = walk(PKG).map((p) => relative(PKG, p).split("\\").join("/"));
const prevOnDisk = walk(PREV).map((p) => relative(PREV, p).split("\\").join("/"));
const code = (s: string) => s.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
const scripts = onDisk.filter((p) => /^tools\/.*\.sh$/.test(p)).sort();
const blocked = onDisk.filter((p) => p.endsWith(".bloqueado.sql")).sort();
const changedOrNew = onDisk.filter((p) => !prevOnDisk.includes(p) || read(p) !== readPrev(p));
const MARKER = /__[A-Z][A-Z0-9_]*__/g;
const all = () => onDisk.map((p) => ({ path: p, content: readFileSync(join(PKG, p)) }));

describe("v1.0.4: integridade e reprodutibilidade", () => {
  it("ficheiros derivados no disco = montagem; DIFF e MANIFEST reproduzíveis", () => {
    for (const f of derived) expect(read(f.path), f.path).toBe(f.content);
    const noMeta = all().filter((f) => f.path !== "MANIFEST.json" && f.path !== "SHA256SUMS");
    expect(read("DIFF-v1.0.3.md")).toBe(buildDiffV104(readPrev("SHA256SUMS"), noMeta, prevQueries, queries));
    expect(read("MANIFEST.json")).toBe(buildManifestV104(gen.out, queries, [r30, r31, r32], noMeta));
  });

  it("SHA256SUMS cobre todos os ficheiros e confere; MANIFEST usa os mesmos hashes", () => {
    expect(read("SHA256SUMS")).toBe(buildSha256SumsV104(all()));
    const m = JSON.parse(read("MANIFEST.json"));
    const sums = new Map(read("SHA256SUMS").trim().split("\n").map((l) => [l.slice(66), l.slice(0, 64)]));
    for (const f of m.files) expect(sums.get(f.path), f.path).toBe(f.sha256);
    expect(m.files.length).toBe(onDisk.length - 2);
    expect(sums.size).toBe(onDisk.length - 1);
  });

  it("manifesto: nada executado, ensaio não autorizado e sem GO, NO-GO, pendentes declarados", () => {
    const m = JSON.parse(read("MANIFEST.json"));
    expect(m.version).toBe("1.0.4");
    expect(m.executed).toBe(false);
    expect(m.rehearsal_authorized).toBe(false);
    expect(m.rehearsal_go).toBe(false);
    expect(m.gates).toBe("G1–G4 NO-GO");
    expect(m.target_project.id).toBe(STAGING_PROJECT_ID);
    expect(m.supersedes).toEqual({ version: "1.0.3", commit: "fd4fdaca" });
    expect(m.evidence_status.executor_effective_role).toMatch(/^PENDENTE/);
    expect(m.evidence_status.staging_0000_input).toMatch(/^PENDENTE/);
    expect(m.evidence_status.rehearsal_target).toMatch(/NÃO provam isolamento/);
    expect(m.rehearsal_plan.status).toMatch(/NÃO AUTORIZADO, NÃO EXECUTADO, SEM GO/);
    expect(m.scripts.every((s: { executed: boolean }) => s.executed === false)).toBe(true);
    expect(BLOCKERS_V104.every((b) => b.resolved === false)).toBe(true);
  });

  it("verificação de sintaxe SQL e de shell guardadas correspondem aos ficheiros atuais, sem falhas", () => {
    const ev = read("evidence/parse-check.txt");
    expect(ev).toMatch(/RESULTADO: 0 falhas/);
    for (const p of onDisk.filter((x) => /^(sql|preflight|posflight|ensaio|tests-db)\/.*\.sql$/.test(x))) expect(ev, p).toContain(`[${sha(read(p)).slice(0, 16)}]`);
    const sc = read("evidence/shell-check.txt");
    for (const p of scripts) expect(sc, p).toContain(`OK sh -n, bash -n, dash -n — ${p} [${sha(read(p)).slice(0, 16)}]`);
    expect(sc).toMatch(/shellcheck 0\.11\.0 \(-s sh -x\): 0 avisos/);
  });

  it("as versões anteriores continuam byte a byte iguais aos seus SHA256SUMS", () => {
    for (const v of ["v1.0.1", "v1.0.2", "v1.0.3"]) {
      const dir = join(ROOT, "staging-install/package", v);
      for (const l of readFileSync(join(dir, "SHA256SUMS"), "utf8").trim().split("\n")) expect(sha(readFileSync(join(dir, l.slice(66)))), `${v}/${l.slice(66)}`).toBe(l.slice(0, 64));
    }
  });
});

describe("v1.0.4: o que NÃO muda", () => {
  it("S4-00…S4-05 com os 6 sha256 auditados e iguais byte a byte à v1.0.3", () => {
    expect(onDisk.filter((p) => p.startsWith("sql/")).sort()).toEqual(Object.keys(V104_PRESERVED_SQL_SHA256).map((n) => `sql/${n}`).sort());
    for (const [n, h] of Object.entries(V104_PRESERVED_SQL_SHA256)) {
      expect(sha(readFileSync(join(PKG, "sql", n))), n).toBe(h);
      expect(read(`sql/${n}`)).toBe(readPrev(`sql/${n}`));
    }
  });

  it("só o P02 muda entre as P/Q; quarentena, ACCESS-MATRIX e documentos copiados iguais", () => {
    for (const p of onDisk.filter((x) => /^(preflight|posflight|quarantine)\//.test(x) || x === "ACCESS-MATRIX.md" || (V104_COPIED_HANDWRITTEN as readonly string[]).includes(x))) {
      if (p === V104_CHANGED_QUERY) expect(read(p)).not.toBe(readPrev(p));
      else expect(read(p), p).toBe(readPrev(p));
    }
  });

  it("F1: pg_get_userbyid(oid) mantém-se (P01, P05, Q02 iguais); revokes/só servidor", () => {
    for (const p of ["preflight/P01_dono_historico.sql", "preflight/P05_registo_base.sql", "posflight/Q02_seguranca.sql"]) expect(read(p)).toBe(readPrev(p));
    expect(read("preflight/P01_dono_historico.sql")).toMatch(/pg_get_userbyid/);
    for (const n of Object.keys(V104_PRESERVED_SQL_SHA256)) expect(read(`sql/${n}`)).not.toMatch(/GRANT[^;]*\bTO\s+(anon|authenticated|PUBLIC)\b/i);
  });
});

describe("v1.0.4: P1 dicionário unaccent e P2 sem OID fixo", () => {
  const p2 = queries.find((q) => `${q.dir}/${q.name}` === V104_CHANGED_QUERY)!;
  const prev2 = prevQueries.find((q) => `${q.dir}/${q.name}` === V104_CHANGED_QUERY)!;
  const byId = new Map(p2.checks.map((c) => [c.id, c]));

  it("P02-14 substituída, P02-16 nova, as restantes iguais", () => {
    expect(p2.checks.map((c) => c.id)).toEqual([...prev2.checks.map((c) => c.id), ...P02_V104_NEW].sort());
    for (const c of prev2.checks.filter((c) => !(P02_V104_REPLACED as readonly string[]).includes(c.id))) expect(byId.get(c.id)).toEqual(c);
  });

  it("P2: nenhum 10::oid em nenhuma consulta nem ficheiro novo; superutilizador de arranque lido do catálogo", () => {
    for (const c of p2.checks) expect(c.ok + c.actual, c.id).not.toMatch(/\b10::oid\b|=\s*10\b/);
    for (const p of changedOrNew.filter((x) => /\.(sql|psql|sh)$/.test(x))) expect(read(p), p).not.toMatch(/\b10::oid\b/);
    expect(byId.get("P02-14")!.ok).toContain(BOOTSTRAP_SUPER);
    expect(BOOTSTRAP_SUPER).toMatch(/nspname = 'pg_catalog'/);
    expect(byId.get("P02-14")!.ok.startsWith("(SELECT estado FROM est) = 'INSTALADA' OR")).toBe(true);
  });

  it("P1: P02-16 só INSTALADA, com pertença, modelo, init/lexize, opções e dono", () => {
    const ok = byId.get("P02-16")!.ok;
    expect(ok.startsWith("(SELECT estado FROM est) = 'NOVA' OR")).toBe(true);
    for (const s of ["'pg_ts_dict'::regclass", "'pg_ts_template'::regclass", "dicttemplate", "'unaccent_init'", "'unaccent_lexize'", "rules=''unaccent''", "dictowner", "extowner"]) expect(ok).toContain(s);
    expect(read(V104_CHANGED_QUERY)).toMatch(/APROVADO SÓ COMO DONO HISTÓRICO/);
  });
});

// Espelho, em TypeScript, das regras de cópia do wrapper (para testar marcadores sem correr o script).
const SHELL_GROUPS: Record<string, readonly string[]> = {
  INST: ["__R_PGDATA__", "__R_SOCKDIR__", "__R_SYSID__", "__R_PORT__", "__R_NONCE_SHA256__"],
  EMAIL: ["__EMAIL_AUTORIZADO__"],
  P05A: ["__P05_B01_CONTA__", "__P05_B02_IDENTIDADES__", "__P05_B03_PAPEIS__"],
  P05B: ["__P05_B04_POLITICAS__", "__P05_B05_FUNCOES__", "__P05_B06_TABELAS__", "__P05_B07_TIPO__"],
  R31: [...R31_MARKERS],
  GUIAO: ["__R_SESS__", "__R_TOOLS__", "__R_ROOT__", "__R_PASSO__"],
};
const simulate = (src: string, markers: readonly string[], unblock: boolean) => {
  let s = unblock ? src.split("\n").filter((l) => !/^DO \$bloqueado\$ BEGIN RAISE EXCEPTION 'BLOQUEADO/.test(l)).join("\n") : src;
  for (const m of markers) s = s.split(m).join("x");
  return s;
};
const r40 = () => read("tools/R40_sessao.sh");
const shellSteps = () => [...r40().matchAll(/^\s+([A-Z0-9-]+|0000|B01b)\)\s+echo "([^"]+)" ;;$/gm)].map((m) => ({ passo: m[1], cols: m[2].split("|") }));

describe("v1.0.4: S1/S2 wrapper único, V1 marcadores", () => {
  it("a tabela de passos do R40_sessao.sh é igual a SESSION_STEPS (ordem incluída)", () => {
    const sh = shellSteps();
    expect(sh.map((s) => s.passo)).toEqual(SESSION_STEPS.map((s) => s.passo));
    expect(r40()).toContain(`ORDEM="${SESSION_STEPS.map((s) => s.passo).join(" ")}"`);
    for (const [i, s] of SESSION_STEPS.entries()) {
      const [ficheiro, base, papel, sup, tx, desbl, marc] = sh[i].cols;
      expect(ficheiro, s.passo).toBe(s.passo === "0000" ? "ENTRADA_0000" : s.ficheiro);
      expect([base, papel, sup, tx, desbl], s.passo).toEqual([s.base, s.papel, s.super ? "sim" : "nao", s.tx ? "sim" : "nao", s.desbloquear ? "sim" : "nao"]);
      const groups = marc === "-" ? [] : marc.split(",");
      expect(new Set(groups.flatMap((g) => SHELL_GROUPS[g])), s.passo).toEqual(new Set(s.marcadores));
      expect(s.desbloquear, s.passo).toBe(s.ficheiro.endsWith(".bloqueado.sql"));
    }
  });

  it("V1: cada fonte só tem marcadores declarados e a cópia simulada não deixa nenhum", () => {
    for (const s of SESSION_STEPS.filter((x) => x.passo !== "0000")) {
      const src = read(s.ficheiro);
      for (const m of src.match(MARKER) ?? []) expect(s.marcadores, `${s.passo}: ${m}`).toContain(m);
      expect(simulate(src, s.marcadores, s.desbloquear).match(MARKER), s.passo).toBeNull();
      if (s.desbloquear) expect(simulate(src, s.marcadores, true).split("\n").filter((l) => l.startsWith("DO $bloqueado$")).length).toBe(0);
    }
    expect(simulate(read("ensaio/R31_sessao_passo.sql"), SHELL_GROUPS.R31, false).match(MARKER)).toBeNull();
    expect(simulate(read("ensaio/R32_instancia_super.sql"), SHELL_GROUPS.INST, false).match(MARKER)).toBeNull();
    expect(simulate(read("ensaio/R40_sessao.psql"), SHELL_GROUPS.GUIAO, false).match(MARKER)).toBeNull();
    for (const m of R32_MARKERS) expect(SHELL_GROUPS.INST).toContain(m);
  });

  it("V1: R30 com as mesmas 17 verificações da v1.0.3 e o cabeçalho sem texto parecido com marcador", () => {
    expect(r30.checks).toEqual(buildR30().checks);
    const comments = read("ensaio/R30_sessao_alvo.sql").split("\n").filter((l) => l.startsWith("--")).join("\n");
    expect(comments).not.toMatch(/__R_/);
    expect(r40()).toContain("procura -Eq '__[A-Z][A-Z0-9_]*__'");
  });

  it("S2: cópias determinísticas registadas e reconferidas; fonte conferida no SHA256SUMS; nada repetido", () => {
    const s = code(r40());
    for (const t of ["sha_registado \"$PKG\" \"$FICH\"", ">> \"$EV/copias.sha256\"", "a cópia $c mudou depois de registada", "pacote_integro_ou_falha", "já foi tentado nesta instância", "não está APROVADO: ordem do plano", "entradas/0000.sha256"]) expect(s).toContain(t);
    expect(s).not.toMatch(/date|\$RANDOM|mktemp[^\n]*sessoes/);
  });

  it("S1: o guião corre R41 → R31 → [R32] → passo → R31 → mesmo PID, e o wrapper corre o R20 antes", () => {
    const g = read("ensaio/R40_sessao.psql");
    const idx = (t: string, from = 0) => g.indexOf(t, from);
    const a = idx("R41_processo_cliente.sh"), b = idx("\\i __R_SESS__/R31.sql"), c = idx("\\i __R_SESS__/R32.sql"), d = idx("\\i __R_SESS__/passo.sql"), e = idx("\\i __R_SESS__/R31.sql", d), f = idx("AS mesma \\gset");
    expect([a, b, c, d, e, f].every((x) => x > 0)).toBe(true);
    expect(a < b && b < c && c < d && d < e && e < f).toBe(true);
    expect(r40().indexOf("R20_verificar_processo.sh")).toBeLessThan(r40().indexOf("\"$PG_BIN/psql\""));
    expect(r40()).toContain("host=$ROOT/sock port=$PORT dbname=$BASE user=$PAPEL");
  });
});

describe("v1.0.4: V2–V7 nos scripts", () => {
  it("V2: o comando do R41 é texto literal (sem variáveis psql, dois-pontos, aspas) e o R41 não recebe a autorização por argumento", () => {
    const line = read("ensaio/R40_sessao.psql").split("\n").find((l) => l.startsWith("\\set r41 "))!;
    const inner = line.slice(line.indexOf("`") + 1, line.lastIndexOf("`"));
    expect(inner).toBe("sh __R_TOOLS__/R41_processo_cliente.sh __R_ROOT__ __R_SESS__");
    expect(simulate(inner, SHELL_GROUPS.GUIAO, false)).not.toMatch(/[:'"$\\;&|]/);
    expect(read("tools/lib_ensaio.sh")).toContain("*[!A-Za-z0-9/._-]*");
    expect(read("tools/R41_processo_cliente.sh")).toContain('AUT=$(ler1 "$SESS/autorizacao")');
  });

  it("V3: guiões .psql sem conversões para int; decisões por \\if sobre \\gset; falha por RAISE EXCEPTION", () => {
    for (const p of onDisk.filter((x) => x.endsWith(".psql"))) expect(read(p), p).not.toMatch(/::int/);
    const g = read("ensaio/R40_sessao.psql");
    expect(g.match(/^\\if :r40_[a-z0-9_]+$/gm)!.length).toBeGreaterThanOrEqual(4);
    expect(g.match(/RAISE EXCEPTION 'REPROVADO/g)!.length).toBe(2);
    expect(g).toContain("\\set ON_ERROR_STOP on");
    for (const q of [r31, r32]) for (const c of q.checks) expect(c.ok, c.id).not.toMatch(/'[^']*'::int/);
  });

  it("V3: nenhuma linha de saída das consultas de passo contém REPROVADO quando aprovadas (o wrapper rejeita essa palavra)", () => {
    for (const q of [...queries, r30, r31, r32]) for (const c of q.checks) expect(`${c.label} ${c.expected}`, c.id).not.toMatch(/REPROVADO/);
  });

  it("V4: sem pipelines nas verificações; grep só dentro de procura; fail no stderr", () => {
    for (const p of scripts) {
      const lines = code(read(p)).replace(/'[^']*'/g, "''").split("\n").map((l) => l.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/\|\|/g, " "));
      for (const l of lines) if (/\|/.test(l)) expect(l, p).toMatch(/^\s*[^()\s]+(\|[^()\s]+)+\)|^\s*case .* in .*\)|;;\s*esac|^\s*\*\)/);
      for (const l of lines) if (/\bgrep\b/.test(l)) expect(l, p).toMatch(/^procura\(\) \{ grep "" && _rc=0/);
    }
    expect(read("tools/lib_ensaio.sh")).toMatch(/fail\(\) \{ printf 'REPROVADO: %s\\n' "\$1" >&2; exit 2; \}/);
  });

  it("V5: identidade estável; a linha de comando nunca decide", () => {
    for (const p of ["tools/R20_verificar_processo.sh", "tools/R41_processo_cliente.sh", "tools/R90_descartar.sh", "tools/R40_sessao.sh"]) {
      const s = code(read(p));
      expect(s.replace(/^cat -- "\/proc\/\$PID\/cmdline" > "\$EV\/argumentos\.obtidos\.bin" \|\| fail "cmdline ilegível"$/m, ""), p).not.toMatch(/cmdline/);
    }
    const lib = read("tools/lib_ensaio.sh");
    for (const t of ["_r=${_s##*) }", "shift 19", "stat -L -c '%d:%i'", "identidade_para", "postmaster_igual_ou_falha"]) expect(lib).toContain(t);
    expect(read("tools/R20_verificar_processo.sh")).toContain('postmaster_igual_ou_falha "$PID"');
    expect(read("tools/R41_processo_cliente.sh")).toContain('postmaster_igual_ou_falha "$PID"');
  });

  it("V6/V7: R10 marca e regista a unidade antes de qualquer processo; R90 trata parciais, espera a unidade vazia, INCERTEZA = destruir", () => {
    const r10 = read("tools/R10_arranque_controlado.sh");
    expect(r10.indexOf('> "$ROOT/$MARCA"')).toBeLessThan(r10.indexOf('"$PG_BIN/initdb"'));
    expect(r10.indexOf('> "$EV/cgroup"')).toBeLessThan(r10.indexOf('"$PG_BIN/initdb"'));
    expect(r10).toContain("trap falhou EXIT");
    const r90 = code(read("tools/R90_descartar.sh"));
    for (const t of ["cgroup.kill", "exit 3", "trap 'incerteza", "vazio_ou_ausente", "kill -INT", "for d in /proc/[0-9]*"]) expect(r90).toContain(t);
    expect(r90).not.toMatch(/kill -(KILL|9)\b/);
    expect(r90).not.toMatch(/fail "ROOT não parece/);
  });

  it("scripts: exigem AUTORIZADO (o R41 lê-a do registo), sem rede, palavras-passe, pg_ctl nem set -x; só o R40 abre sessões", () => {
    expect(scripts).toEqual(["tools/R05_entrada_0000.sh", "tools/R10_arranque_controlado.sh", "tools/R20_verificar_processo.sh", "tools/R40_sessao.sh", "tools/R41_processo_cliente.sh", "tools/R90_descartar.sh", "tools/lib_ensaio.sh"]);
    for (const p of scripts) {
      const s = code(read(p));
      if (!["tools/lib_ensaio.sh", "tools/R41_processo_cliente.sh"].includes(p)) expect(s, p).toMatch(/exige_autorizacao "\$\{1:-\}"/);
      expect(s.replace(/'[^'\n]*'/g, "''").replace(/"[^"\n]*"/g, '""'), p).not.toMatch(/(?<![./*\w-])(curl|wget|nc|ncat|ssh|scp|pg_ctl|printenv)\b|PGPASSWORD|\.pgpass|\benv\s*$|\benv\s*\|/m);
      expect(s, p).not.toMatch(/\bset\s+-x/);
      if (p !== "tools/R40_sessao.sh") expect(s, p).not.toMatch(/\/psql"\s+-/);
    }
  });
});

describe("v1.0.4: B1/B2 bootstrap, E1–E10, 0000 pendente", () => {
  it("B1: cada ficheiro bloqueado: 1.ª guarda BLOQUEADO, 2.ª SÓ DESCARTÁVEL com superutilizador, papel, base, sem TCP, PGDATA, sysid e nonce", () => {
    expect(blocked).toEqual(["ensaio/B00_papeis_e_base.bloqueado.sql", "ensaio/B01_plataforma_sintetica.bloqueado.sql", "ensaio/B01b_unaccent_instalada.bloqueado.sql", "ensaio/B02_papel_admin_sintetico.bloqueado.sql", "tests-db/T01_matriz_comportamental.bloqueado.sql"]);
    for (const p of blocked) {
      const s = read(p);
      const active = s.split("\n").filter((l) => l.trim() && !l.startsWith("--"));
      expect(active[0], p).toMatch(/^DO \$bloqueado\$ BEGIN RAISE EXCEPTION 'BLOQUEADO/);
      expect(active[1], p).toBe("DO $so_descartavel$ BEGIN");
      const g = s.slice(s.indexOf("DO $so_descartavel$"), s.indexOf("END $so_descartavel$"));
      const base = SESSION_STEPS.find((x) => x.ficheiro === p)!.base;
      for (const t of ["rolsuper", "session_user <> 'ensaio_super' OR current_user <> session_user", `current_database() <> '${base}'`, "inet_server_addr() IS NOT NULL", "'__R_PGDATA__'", "'__R_SYSID__'", "'__R_NONCE_SHA256__'"]) expect(g, `${p}: ${t}`).toContain(t);
    }
  });

  it("B2: B01 e B02 exigem provider/email/sub coerentes", () => {
    for (const p of ["ensaio/B01_plataforma_sintetica.bloqueado.sql", "ensaio/B02_papel_admin_sintetico.bloqueado.sql"]) {
      const s = read(p);
      for (const t of ["i.provider = 'email'", "i.provider_id = u.id::text", "i.identity_data ->> 'sub' = u.id::text", "i.identity_data ->> 'email' = u.email", "i.email = lower(u.email)", "email_verified", "u.encrypted_password IS NULL"]) expect(s, `${p}: ${t}`).toContain(t);
    }
  });

  it("T01: corpo M1–M7 igual à v1.0.2", () => {
    const body = (s: string) => s.slice(s.indexOf("\nBEGIN;"));
    expect(body(read("tests-db/T01_matriz_comportamental.bloqueado.sql"))).toBe(body(readFileSync(join(ROOT, "staging-install/package/v1.0.2/tests-db/T01_matriz_comportamental.bloqueado.sql"), "utf8")));
  });

  it("E1–E10: obrigações no documento, no modelo da ficha (todas PENDENTE) e no R10, que recusa sem ficha completa", () => {
    const t = read("REHEARSAL-TARGET.md");
    expect(t).toMatch(/os scripts sozinhos não provam isolamento/);
    for (const e of OPERATOR_OBLIGATIONS) {
      expect(t).toContain(`| ${e} |`);
      expect(read("operador/E-EVIDENCIA.modelo")).toContain(`\n${e}=PENDENTE\n`);
    }
    expect(read("tools/R10_arranque_controlado.sh")).toContain(`lista="${OPERATOR_OBLIGATIONS.join(" ")}"`);
    expect(read("tools/R10_arranque_controlado.sh")).toContain("PENDENTE|POR VERIFICAR");
  });

  it("0000: metadados localizados registados, bytes NÃO obtidos, continua PENDENTE; R05 e R10 recusam", () => {
    const m = STAGING_0000_INPUT_V104;
    expect(m.state).toBe("PENDENTE");
    expect(m.bytesObtained).toBe(false);
    expect(m.alternativeBootstrap).toBeNull();
    expect(m.gitCommit).toBe("ab5187829bb989795d47a283e0f093b796843e72");
    expect(m.gitBlob).toBe("24c38a525e549551e1fdf3028ff58e1e1906b0ee");
    expect(m.sha256Full).toBe("a87578e560f0c97f9c1184d5fe3e2730f18de6e513b8e610c4808a28f98aecd2");
    expect(m.sha256Full.startsWith(m.sha256Prefix)).toBe(true);
    expect([m.bytes, m.lines, m.trailingNewline]).toEqual([2303, 44, false]);
    expect(m.caveat).toMatch(/NÃO verificada/);
    expect(m.caveat).toMatch(/3 INSERTs sintéticos/);
    const e = read("entradas/0000/ESPERADO");
    expect(e).toContain("\nestado=PENDENTE\n");
    expect(e).toContain(`\nsha256=${m.sha256Full}\n`);
    expect(e).toContain(`\ngit_blob=${m.gitBlob}\n`);
    expect(e).toContain(`\ncommit=${m.gitCommit}\n`);
    expect(e).toContain("\nbytes=2303\nlinhas=44\nlf_final=nao\n");
    expect(e).toContain(`\nsha256_prefixo=${m.sha256Prefix}\n`);
    // nenhum ficheiro 0000 (nem nenhum SQL) dentro de entradas/: os bytes não foram obtidos nem reconstruídos
    expect(onDisk.filter((p) => p.startsWith("entradas/"))).toEqual(["entradas/0000/ESPERADO", "entradas/0000/README.md"]);
    expect(onDisk.some((p) => /0000_staging_access_control\.sql$/.test(p))).toBe(false);
    const manifest = JSON.parse(read("MANIFEST.json"));
    expect(manifest.staging_0000_input).toMatchObject({ state: "PENDENTE", bytes_obtained: false, included_in_package: false, sha256: m.sha256Full, git_blob: m.gitBlob, bytes: 2303 });
    for (const p of ["tools/R05_entrada_0000.sh", "tools/R10_arranque_controlado.sh"]) expect(read(p)).toMatch(/AUTENTICADO\)|AUTENTICADO\|ALTERNATIVO_AUDITADO\)/);
    const r05 = read("tools/R05_entrada_0000.sh");
    for (const k of ["chave \"$ESP\" bytes", "chave \"$ESP\" linhas", "chave \"$ESP\" lf_final", "chave \"$ESP\" git_blob", "sha1sum"]) expect(r05).toContain(k);
  });

  it("documentos: nada executado, sem GO, sem promessas de isolamento absoluto", () => {
    for (const d of ["README.md", "REHEARSAL-PLAN.md", "TEST-CRITERIA.md", "FINDINGS-RESOLUTION.md"]) {
      expect(read(d), d).toMatch(/Nada (deste pacote )?foi executado|NÃO EXECUTADO/);
      expect(read(d), d).not.toMatch(/isolamento (garantido|total|absoluto)|ensaio (aprovado|GO)\b/i);
    }
    expect(read("REHEARSAL-PLAN.md")).toMatch(/NÃO AUTORIZADO\. NÃO EXECUTADO\. SEM GO/);
  });

  it("só dados sintéticos nos ficheiros novos ou alterados", () => {
    for (const p of changedOrNew.filter((x) => /\.(sql|psql|sh|md|modelo)$|ESPERADO$/.test(x))) {
      const s = read(p);
      for (const e of s.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]+/g) ?? []) expect(e, p).toMatch(/@afonso-staging\.invalid$/);
      for (const u of s.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi) ?? []) expect(u, p).toBe(STAGING_PROJECT_ID);
      expect(s, p).not.toMatch(/\+351|\b9[1236]\d{7}\b|meuafonso\.com|ydwthwusdlxlgyreulsd/);
    }
    expect(read("tools/R40_sessao.sh")).toContain(`EMAIL=${SYNTHETIC_EMAIL}`);
  });
});
