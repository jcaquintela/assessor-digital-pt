// AFONSO V2 · pacote v1.0.5 · V01 · TESTE DE REGRESSÃO ESTÁTICO, reproduzível, incluído no pacote.
// Só LÊ ficheiros do pacote (e, se houver `sh`, corre `sh -n`, que só analisa a sintaxe). Não liga a nenhuma
// base, não executa SQL nem nenhum passo do ensaio (R05–R90), não usa rede, não lê segredos.
// Uso:  node verificacao/V01_regressao_estatica.mjs <pasta-do-pacote> [--sem-sintaxe]
// Saída: uma linha OK/FALHA por verificação e "RESULTADO: <n> falhas"; código 0 só com 0 falhas.
// Inclui CONTROLOS NEGATIVOS: os detetores têm de reprovar os padrões defeituosos da v1.0.4 (texto embutido).
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const S4 = {
  "S4-00_prelude_aditivo.sql": "23f198ffa3135153efb015008e10368829c78ac2548a6a0056efa4738d2f828c",
  "S4-01_tipos_tabelas_a.sql": "5724b20543f0716e3c818e186e8a56cb5fc66790f671796a1e2e2968787aaf55",
  "S4-02_tabelas_b_restricoes.sql": "5b8fae75417e16e25cb21d80f7ba47ea8aab11237f9c3dc95020bd922c778cc4",
  "S4-03_funcoes.sql": "68f244fffb97280eaedda9054784ccc0952936e9405838968e0a5cfe6fe4846a",
  "S4-04_indices_chaves_gatilhos.sql": "8ba1230d83e7c8794ec9d2b8200ac1ef79739f2cd9f96439ee8fb266d4dba2ba",
  "S4-05_politicas.sql": "6276b63eb5bd6c1c54c41dbc535e2dd62f18f83d910037d7e48cc25a30fa8543",
};
const E0000 = { path: "entradas/0000/0000_staging_access_control.sql", sha256: "a87578e560f0c97f9c1184d5fe3e2730f18de6e513b8e610c4808a28f98aecd2", blob: "24c38a525e549551e1fdf3028ff58e1e1906b0ee", bytes: 2303, lines: 44 };
// Conjuntos de marcadores de cada nome-token (iguais aos do copia_det do R40; a V01 confere que o R40 os tem).
const TOKENS = {
  INST: ["__R_PGDATA__", "__R_SOCKDIR__", "__R_SYSID__", "__R_PORT__", "__R_NONCE_SHA256__"],
  EMAIL: ["__EMAIL_AUTORIZADO__"],
  P05A: ["__P05_B01_CONTA__", "__P05_B02_IDENTIDADES__", "__P05_B03_PAPEIS__", "__P05_B04_POLITICAS__", "__P05_B05_FUNCOES__", "__P05_B06_TABELAS__", "__P05_B07_TIPO__"],
};
TOKENS.P05B = TOKENS.P05A;
// Defeitos da v1.0.4 (controlos negativos): os detetores TÊM de os encontrar.
const NEG_X1 = 'while IFS= read -r _e; do [ "$_e" = "HOME=$2" ] && _achou=sim; done < "$3/env.$1" || fail "leitura falhou"\n';
const NEG_X1_MULTI = 'for x in a b; do\n  echo "$x"\n  [ "$x" = a ] && n=1\ndone || fail "x"\n';
const NEG_X3 = 'kill -INT "$p" 2>/dev/null || true\n';

const sha = (b) => createHash("sha256").update(b).digest("hex");
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const semComentarios = (s) => s.split("\n").map((l) => (/^\s*#/.test(l) ? "" : l)).join("\n");

/** Ciclos cujo estado de saída é verificado ("done … ||") e cujo ÚLTIMO comando do corpo é uma lista "a && b". */
export function ciclosComAndFinal(texto) {
  const linhas = semComentarios(texto).split("\n");
  const achados = [];
  linhas.forEach((l, i) => {
    const m = l.match(/(^|[;\s])done\b[^#]*\|\|/);
    if (!m) return;
    const antes = l.slice(0, m.index + m[1].length);
    let ultimo;
    if (/(^|[;\s])do\s/.test(antes)) {
      const corpo = antes.slice(antes.search(/(^|[;\s])do\s/) + 3);
      const partes = corpo.split(/;\s*/).map((x) => x.trim()).filter(Boolean);
      ultimo = partes[partes.length - 1] ?? "";
    } else {
      let j = i - 1;
      while (j >= 0 && !linhas[j].trim()) j--;
      ultimo = (linhas[j] ?? "").trim().replace(/;\s*$/, "");
    }
    const a = ultimo.lastIndexOf("&&");
    if (a >= 0 && ultimo.indexOf("||", a) < 0 && !/^(if|while|until)\b/.test(ultimo)) achados.push({ linha: i + 1, ultimo });
  });
  return achados;
}

/** Ocorrências de `kill` em código (sem comentários). */
export function kills(texto) {
  return semComentarios(texto).split("\n").map((l, i) => ({ linha: i + 1, l: l.trim() })).filter((x) => /(^|[;\s(|&!])kill\s/.test(x.l));
}

export function verificar(pkg, opcoes = {}) {
  const linhas = [];
  let falhas = 0;
  const ok = (cond, txt) => { if (!cond) falhas++; linhas.push(`${cond ? "OK" : "FALHA"} ${txt}`); };
  const ler = (p) => readFileSync(join(pkg, p), "utf8");
  const existe = (p) => existsSync(join(pkg, p));
  const ficheiros = walk(pkg).map((p) => relative(pkg, p).split("\\").join("/")).sort();

  // A. Integridade
  const sums = ler("SHA256SUMS").trim().split("\n").map((l) => [l.slice(66), l.slice(0, 64)]);
  const sm = new Map(sums);
  const errados = sums.filter(([p, h]) => !existe(p) || sha(readFileSync(join(pkg, p))) !== h).map(([p]) => p);
  const fora = ficheiros.filter((p) => p !== "SHA256SUMS" && !sm.has(p));
  ok(errados.length === 0, `A1 SHA256SUMS: ${sums.length} ficheiros listados conferem${errados.length ? " — não conferem: " + errados.join(", ") : ""}`);
  ok(fora.length === 0, `A2 nenhum ficheiro fora do SHA256SUMS${fora.length ? " — fora: " + fora.join(", ") : ""}`);

  // B. Preservado byte a byte
  for (const [n, h] of Object.entries(S4)) ok(existe(`sql/${n}`) && sha(readFileSync(join(pkg, "sql", n))) === h, `B1 sql/${n} = ${h.slice(0, 16)}…`);
  ok(ficheiros.filter((p) => p.startsWith("sql/")).length === 6, "B2 exatamente 6 migrações em sql/");
  const b = readFileSync(join(pkg, E0000.path));
  const blob = createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${b.length}\0`), b])).digest("hex");
  ok(sha(b) === E0000.sha256 && blob === E0000.blob && b.length === E0000.bytes && b.filter((x) => x === 10).length + 1 === E0000.lines && b[b.length - 1] !== 10, "B3 entrada 0000: sha256, blob Git, 2303 bytes, 44 linhas, sem LF final");
  ok(/\nestado=AUTENTICADO\n/.test(ler("entradas/0000/ESPERADO")), "B4 entradas/0000/ESPERADO: estado=AUTENTICADO");

  const scripts = ficheiros.filter((p) => /^tools\/.*\.sh$/.test(p));
  const src = Object.fromEntries(scripts.map((p) => [p, ler(p)]));
  const lib = src["tools/lib_ensaio.sh"], r05 = src["tools/R05_entrada_0000.sh"], r10 = src["tools/R10_arranque_controlado.sh"], r20 = src["tools/R20_verificar_processo.sh"], r40 = src["tools/R40_sessao.sh"], r41 = src["tools/R41_processo_cliente.sh"], r90 = src["tools/R90_descartar.sh"];
  const fn = (s, nome) => { const i = s.indexOf(`\n${nome}() {`); if (i < 0) return ""; const j = s.indexOf("\n}\n", i); return s.slice(i, j + 3); };

  // X1
  ok(ciclosComAndFinal(NEG_X1).length === 1 && ciclosComAndFinal(NEG_X1_MULTI).length === 1, "X1-0 controlo negativo: o detetor reprova o ciclo defeituoso da v1.0.4 (uma linha e várias linhas)");
  for (const p of scripts) { const a = ciclosComAndFinal(src[p]); ok(a.length === 0, `X1-1 ${p}: nenhum ciclo "done … ||" termina numa lista "&&"${a.length ? " — linhas " + a.map((x) => x.linha).join(",") : ""}`); }
  const home = fn(lib, "home_controlada_ou_falha");
  ok(/_nh=\$\(\(_nh \+ 1\)\)/.test(home) && /\[ "\$_nh" -eq 1 \]/.test(home) && /if \[ "\$_e" = "HOME=\$2" \]; then _achou=sim; fi/.test(home) && !/&& _achou=sim/.test(home), "X1-2 home_controlada_ou_falha: conta as definições HOME, exige exatamente 1 e igual à pasta do ensaio, sem lista && no ciclo");

  // X2
  const cg2 = fn(lib, "cgroup2_ou_falha"), pop = fn(lib, "populated_de"), desc = fn(lib, "sem_descendentes_ou_falha");
  ok(/\/sys\/fs\/cgroup/.test(cg2) && /cgroup2/.test(cg2) && /t == "cgroup"/.test(cg2) && /rt != "\/"/.test(cg2), "X2-1 lib: cgroup2_ou_falha exige montagem única cgroup2 em /sys/fs/cgroup com raiz / e nenhum cgroup v1");
  ok(/cgroup\.events/.test(pop) && /populated/.test(pop) && /-eq 1 \]/.test(pop), "X2-2 lib: populated_de lê cgroup.events (exatamente uma linha populated, 0|1)");
  ok(/cgroup\.stat/.test(desc) && /nr_descendants/.test(desc) && /-eq 0 \]/.test(desc) && /subcgroup/.test(desc), "X2-3 lib: sem_descendentes_ou_falha exige nr_descendants 0 e nenhuma subpasta");
  ok(/cgroup2_ou_falha "\$\$"/.test(r10) && /sem_descendentes_ou_falha "\$CGD"/.test(r10) && /populated_de "\$CGD"/.test(r10), "X2-4 R10: montagem cgroup v2, sem descendentes e populated antes de registar a unidade");
  ok(/cgroup2_ou_falha "\$PID"/.test(r20) && /cgroup2_ou_falha "\$\$"/.test(r20) && (r20.match(/sem_descendentes_ou_falha "\$CGD"/g) ?? []).length === 2 && /populated_de "\$CGD"/.test(r20), "X2-5 R20: montagem cgroup v2 (servidor e R20), sem subcgroups antes E depois de ler cgroup.procs, populated 1");
  const uv = fn(r90, "unidade_vazia");
  ok(/populated_de "\$D"/.test(uv) && /\[ "\$pv" = 0 \]/.test(uv) && !/linhas_dados/.test(uv) && /cgroup2_ou_falha "\$\$"/.test(r90), "X2-6 R90: \"vazia\" decide-se por cgroup.events populated 0 (cgroup.procs só como evidência); montagem cgroup v2 confirmada");

  // X3
  const todosKills = scripts.flatMap((p) => kills(src[p]).map((k) => `${p}: ${k.l}`));
  const permitidos = todosKills.filter((k) => /tools\/lib_ensaio\.sh: if kill "-\$2" "\$1" 2>\/dev\/null; then/.test(k) || /tools\/R40_sessao\.sh: interrompido\(\) \{.*kill -TERM "\$CPID"/.test(k));
  ok(kills(NEG_X3).length === 1, "X3-0 controlo negativo: o detetor encontra o kill direto da v1.0.4");
  ok(todosKills.length === 2 && permitidos.length === 2, `X3-1 só dois kill no pacote: sinaliza_se_mesmo (identidade completa relida antes) e o psql filho do R40${todosKills.length !== 2 ? " — encontrados: " + todosKills.join(" | ") : ""}`);
  const sig = fn(lib, "sinaliza_se_mesmo");
  ok(sig.indexOf("identidade_para") >= 0 && sig.indexOf("cmp -s") > sig.indexOf("identidade_para") && sig.indexOf("kill ") > sig.indexOf("cmp -s"), "X3-2 sinaliza_se_mesmo: relê a identidade completa, compara byte a byte e só depois envia o sinal");
  ok(/sinaliza_se_mesmo "\$p" INT/.test(r90) && /sinaliza_se_mesmo "\$p" QUIT/.test(r90), "X3-3 R90: SIGINT e SIGQUIT só por sinaliza_se_mesmo (identidade relida antes de CADA sinal)");
  const iD = r90.indexOf("\nDESCARTE=1\nCODIGO_FALHA=3\n"), iTrap = r90.indexOf("trap saida_r90 EXIT"), iAut = r90.indexOf('exige_autorizacao "${1:-}"');
  const depois = iD >= 0 ? r90.slice(iD) : "";
  ok(iD > 0 && iTrap > 0 && iTrap < iAut && /if \[ "\$DESCARTE" = 1 \] && \[ "\$rc" -ne 0 \]; then/.test(fn(r90, "saida_r90")) && /exit 3/.test(fn(r90, "saida_r90")), "X3-4 R90: EXIT trap converte QUALQUER saída ≠ 0 depois de DESCARTE=1 em código 3; fail passa a código 3 (CODIGO_FALHA)");
  ok((depois.match(/trap - EXIT/g) ?? []).length === 1 && /trap - EXIT INT TERM HUP\necho "R90 DESCARTADO/.test(depois), "X3-5 R90: o EXIT trap só é retirado imediatamente antes da linha final DESCARTADO");
  ok(/CODIGO_FALHA" = 3 \]; then printf 'INCERTEZA: %s\\n' "\$1" >&2; exit 3; fi/.test(lib), "X3-6 lib: fail termina com 3 quando CODIGO_FALHA=3");
  const fal = fn(r10, "falhou");
  ok(/sinaliza_se_mesmo "\$PID" INT "\$REF"/.test(fal) && /postmaster\.inicio\.arranque/.test(fal) && /pai_de "\$PID"/.test(fal) && /exit 3/.test(fal) && /PID=\$!\nprintf '%s\\n' "\$PID" > "\$EV\/postmaster\.pid\.registado" \|\| fail "escrita falhou"\n# [^\n]*\ninicio_de "\$PID" > "\$EV\/postmaster\.inicio\.arranque"/.test(r10), "X3-7 R10: trap só sinaliza com identidade completa (registada ou provisória: início logo após o arranque, pai, executável, cwd, cgroup); dúvida => código 3");

  // E1–E10: ficha
  const mod = ler("operador/E-EVIDENCIA.modelo");
  ok(Array.from({ length: 10 }, (_, i) => `\nE${i + 1}=PENDENTE\n`).every((x) => mod.includes(x)) && /<artefacto>\|<sha256/.test(mod), "F1 modelo da ficha: 10 obrigações PENDENTE e formato artefacto|sha256|descrição");
  ok(!/length\(val\[k\]\) < 8/.test(r10) && /split\(val\[k\], f, "\|"\) != 3/.test(r10) && /length\(d\) < 30 \|\| nw < 5/.test(r10) && /E-artefactos/.test(r10) && /\[ "\$g" = "\$h" \] \|\| fail "artefacto de \$k não confere/.test(r10) && /\[ "\$NA" -eq 10 \]/.test(r10), "F2 R10: oito caracteres já não bastam — exige artefacto existente com sha256 que confere, descrição >= 30 caracteres e >= 5 palavras, sem repetições");

  // Trinco global
  ok([r05, r10, r40].every((s) => /trinco_adquire "\$ROOT"/.test(s)) && ![r20, r41].some((s) => /trinco_adquire/.test(s)), "T1 trinco global: R05, R10 e R40 seguram <ROOT>/.trinco; R20 e R41 (só leitura) não");
  ok(/trinco_vivo "\$ROOT\/\.trinco"/.test(r90) && /trinco_adquire "\$ROOT" R90/.test(r90) && /\.trinco\|pgdata/.test(r90), "T2 R90: recusa se o dono do trinco ainda corre, assume órfãos, conhece .trinco");

  // Campos-token
  const defs = [...r40.matchAll(/^\s+([A-Za-z0-9-]+)\)\s+echo "([^"]+)" ;;$/gm)].map((m) => ({ passo: m[1], f: m[2].split("|") }));
  const ordem = (r40.match(/^ORDEM="([^"]+)"$/m) ?? [, ""])[1].split(" ");
  ok(defs.length === 25 && defs.map((d) => d.passo).join(" ") === ordem.join(" "), `K1 R40: 25 passos na tabela, pela mesma ordem do ORDEM`);
  const man = JSON.parse(ler("MANIFEST.json"));
  const steps = new Map((man.session_steps ?? []).map((s) => [s.passo, s]));
  for (const d of defs) {
    const [fich, base, papel, sup, tx, desb, marc] = d.f;
    const tokens = marc === "-" ? [] : marc.split(",");
    const boa = d.f.length === 7 && ["postgres", "afonso_ensaio"].includes(base) && ["ensaio_super", "postgres"].includes(papel) && [sup, tx, desb].every((v) => v === "sim" || v === "nao") && ((sup === "sim") === (papel === "ensaio_super")) && (desb === "nao" || fich.endsWith(".bloqueado.sql")) && tokens.every((t) => t in TOKENS) && new Set(tokens).size === tokens.length;
    const st = steps.get(d.passo);
    const espelho = !!st && st.base === base && st.papel === papel && st.super === (sup === "sim") && st.tx === (tx === "sim") && st.desbloquear === (desb === "sim") && (d.passo === "0000" ? fich === "ENTRADA_0000" : st.ficheiro === fich);
    let cobre = true, sobra = [];
    if (fich !== "ENTRADA_0000") {
      const t = ler(fich);
      cobre = tokens.every((k) => TOKENS[k].some((m) => t.includes(m)));
      const perm = new Set(tokens.flatMap((k) => TOKENS[k]));
      sobra = [...new Set(t.match(/__[A-Z][A-Z0-9_]*__/g) ?? [])].filter((m) => !perm.has(m));
    }
    ok(boa && espelho && cobre && sobra.length === 0, `K2 passo ${d.passo}: 7 campos válidos, igual ao MANIFEST, cada token cobre um campo da fonte e nenhum campo fica sem token${sobra.length ? " — sem token: " + sobra.join(",") : ""}`);
  }
  ok(/\[ "\$NC" = 7 \]/.test(r40) && /marcadores_ou_falha "\$MARC" "INST EMAIL P05A P05B"/.test(r40) && /marcadores_ou_falha "\$_m" "INST EMAIL R31 GUIAO P05A P05B"/.test(r40) && /não cobre nenhum campo/.test(r40), "K3 R40: conta os campos, valida nomes-token e a cobertura de cada um antes de copiar");
  const det = fn(r40, "copia_det");
  ok(Object.entries({ INST: TOKENS.INST, EMAIL: TOKENS.EMAIL }).every(([k, ms]) => ms.every((m) => new RegExp(`\\*,${k},\\*\\).*s#${m}#`).test(det))) && TOKENS.P05A.every((m) => det.includes(`__P05_\${_k%%:*}_\${_k##*:}__`) && det.includes(m.slice(6, m.length - 2).replace("_", ":"))), "K4 R40: o copia_det substitui exatamente os marcadores de cada token");

  // Documentos: nenhuma prova citada fora do pacote
  for (const d of ["README.md", "TEST-CRITERIA.md", "FINDINGS-RESOLUTION.md"]) {
    const ext = ler(d).split("\n").filter((l) => /src\/lib\/|vitest|package-v10\d\.test/.test(l) && !/fora do pacote/.test(l));
    ok(ext.length === 0, `D1 ${d}: nenhuma prova citada que não esteja no pacote${ext.length ? " — " + ext.length + " linha(s)" : ""}`);
  }

  // Sintaxe (só análise: sh -n)
  if (!opcoes.semSintaxe) {
    const temSh = spawnSync("sh", ["-c", ":"]).status === 0;
    ok(temSh, "S0 sh disponível para a análise de sintaxe");
    if (temSh) for (const p of scripts) ok(spawnSync("sh", ["-n", join(pkg, p)]).status === 0, `S1 sh -n ${p} [${sha(readFileSync(join(pkg, p))).slice(0, 16)}]`);
  }
  linhas.push(`RESULTADO: ${falhas} falhas`);
  return { linhas, falhas };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const pkg = process.argv[2];
  if (!pkg || !statSync(pkg).isDirectory()) { console.error("uso: node V01_regressao_estatica.mjs <pasta-do-pacote> [--sem-sintaxe]"); process.exit(2); }
  const r = verificar(pkg, { semSintaxe: process.argv.includes("--sem-sintaxe") });
  console.log(r.linhas.join("\n"));
  process.exit(r.falhas === 0 ? 0 : 1);
}
