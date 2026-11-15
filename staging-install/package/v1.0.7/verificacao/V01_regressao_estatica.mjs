// AFONSO V2 · pacote v1.0.7 · V01 · TESTE DE REGRESSÃO ESTÁTICO, reproduzível, incluído no pacote.
// Só LÊ ficheiros do pacote (e, se houver `sh`, corre `sh -n`, que só analisa a sintaxe). Não liga a nenhuma
// base, não executa SQL nem nenhum passo do ensaio (R05–R90), não usa rede, não lê segredos.
// Uso:  node verificacao/V01_regressao_estatica.mjs <pasta-do-pacote> [--sem-sintaxe]
// Saída: uma linha OK/FALHA por verificação e "RESULTADO: <n> falhas"; código 0 só com 0 falhas.
// Inclui CONTROLOS NEGATIVOS: os detetores têm de reprovar os padrões defeituosos da v1.0.4 (X1, X3), da
// v1.0.5 (Y1, Y2, Y3) e da v1.0.6 (Z1, Z2), embutidos como texto.
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
// Defeitos da v1.0.5 (controlos negativos), copiados do pacote v1.0.5 auditado.
// Y1: tools/R40_sessao.sh:112 — SIGTERM ao cliente sem reconfirmar a identidade imediatamente antes.
const NEG_Y1 = 'CPID=\ninterrompido() { trap - INT TERM HUP; [ -z "$CPID" ] || kill -TERM "$CPID" 2>/dev/null || true; fail "R40 interrompido no passo $PASSO: abortar e correr o R90"; }\n';
// Y2: tools/R90_descartar.sh:60-68 — o trinco órfão era removido e adquirido ANTES de DESCARTE=1 (falha => 2).
const NEG_Y2 = [
  'if [ -d "$ROOT/.trinco" ]; then',
  '  if trinco_vivo "$ROOT/.trinco"; then fail "outro passo do ensaio ainda corre"; fi',
  '  rm -rf -- "${ROOT:?}/.trinco" || incerteza "não foi possível assumir o trinco órfão"',
  'fi',
  'trinco_adquire "$ROOT" R90',
  '',
  'DESCARTE=1',
  'CODIGO_FALHA=3',
  'TR=$ROOT/.trinco/R90',
  'rm -rf -- "${ROOT:?}/.trinco" || incerteza "não foi possível libertar o trinco"',
  'trap - EXIT INT TERM HUP',
  'echo "R90 DESCARTADO: …"',
  '',
].join("\n");
// Variante sintética: uma saída explícita ≠ 3 depois do início do descarte.
const NEG_Y2_EXIT = 'saida_r90() { exit "$rc"; }\nDESCARTE=1\nCODIGO_FALHA=3\n[ -d "$TR" ] || exit 2\necho "R90 DESCARTADO" || exit 3\ntrap - EXIT INT TERM HUP\n';
// Y3: REHEARSAL-PLAN.md:57-58,66 da v1.0.5 — fase "0" (R05) antes da fase "A" (R10) e a frase contrária.
const NEG_Y3 = [
  "## 3. Fases",
  "",
  "| Fase | Passos | Critério para seguir |",
  "|---|---|---|",
  "| E | E1–E10 cumpridas | ficha completa |",
  "| 0 | `R05` com o ficheiro 0000 aceite pelo `ESPERADO` desta versão | `R05 APROVADO` |",
  "| A | `R10` (dentro da unidade) → `R20` | `R10 PRONTO`, `R20 APROVADO` |",
  "| B | `R40 R30` → `R40 B00` | cada `R40 <passo> APROVADO` |",
  "| Z | `R90` (fora da unidade) | `R90 DESCARTADO` |",
  "",
  "Ordem do R05: corre depois do R10, porque precisa de `<ROOT>/evidencia`, e antes do passo 0000.",
  "",
].join("\n");
// Variantes sintéticas para os outros dois detetores de Y3 (frase e seta contrárias à ordem única).
const NEG_Y3_FRASE = "O R05 corre antes do R10.\n";
const NEG_Y3_SETA = "Sequência: `R05` → `R10` → `R20`\n";
// Defeitos da v1.0.6 (controlos negativos), copiados BYTE A BYTE do pacote v1.0.6 auditado (commit 3f6441b2).
// Z1: tools/R90_descartar.sh:61-75 — juízo do dono e depois rm -rf no caminho PARTILHADO .trinco (TOCTOU: um trinco
//     adquirido entretanto por um passo vivo era apagado); e :160-161, a libertação do próprio R90 pelo mesmo caminho.
const NEG_Z1 = "# 2b. Trinco global, SÓ LEITURA: se o dono registado AINDA corre (mesmo PID e início), recusa sem tocar em nada\n#     (código 2). Nada foi alterado até aqui.\nif [ -d \"$ROOT/.trinco\" ]; then\n  if trinco_vivo \"$ROOT/.trinco\"; then fail \"outro passo do ensaio ainda corre (trinco $ROOT/.trinco): interrompê-lo primeiro; nada tocado\"; fi\nfi\n\n# ===== INÍCIO EFETIVO DO DESCARTE (Y2): a próxima instrução já altera ROOT. Qualquer falha => código 3. =====\nDESCARTE=1\nCODIGO_FALHA=3\n# 2c. Assumir o trinco órfão (passo interrompido) e segurá-lo. A partir daqui nenhum outro passo começa em ROOT.\n#     rm/mkdir/escrita do dono: fail => 3 (CODIGO_FALHA); \"exit 2\" de uma função => 3 (EXIT trap).\nif [ -e \"$ROOT/.trinco\" ] || [ -L \"$ROOT/.trinco\" ]; then\n  rm -rf -- \"${ROOT:?}/.trinco\" || incerteza \"não foi possível assumir o trinco órfão\"\nfi\ntrinco_adquire \"$ROOT\" R90\n";
const NEG_Z1_FIM = "rm -rf -- \"${ROOT:?}/.trinco\" || incerteza \"não foi possível libertar o trinco\"\n[ ! -e \"$ROOT/.trinco\" ] || incerteza \"não foi possível libertar o trinco\"\n";
// Z1: tools/lib_ensaio.sh:302-308 — trinco_liberta da v1.0.6: rm/rmdir no caminho partilhado, decidido só pelo PID, "nunca falha".
const NEG_Z1_LIB = "# Liberta o trinco SÓ se for deste processo (dono com o mesmo PID). Nunca falha.\ntrinco_liberta() {\n  [ -n \"$TRINCO_MEU\" ] || return 0\n  _tp=$(chave \"$TRINCO_MEU/dono\" pid 2>/dev/null) || _tp=\n  if [ \"$_tp\" = \"$$\" ]; then rm -f -- \"$TRINCO_MEU/dono\"; rmdir -- \"$TRINCO_MEU\" 2>/dev/null || true; fi\n  TRINCO_MEU=\n}\n";
// Z1: libertações com o resultado ignorado na v1.0.6 (tools/R05_entrada_0000.sh: EXIT trap; tools/R10_arranque_controlado.sh: falhou()).
const NEG_Z1_IGN05 = "trap 'trinco_liberta' EXIT\n";
const NEG_Z1_IGN10 = "  trinco_liberta\n";
// Z2: tools/lib_ensaio.sh:309-318 — trinco_vivo da v1.0.6: dois valores; uma falha de leitura do dono dava "não vivo"
//     e o R90 tratava-o como órfão (término não comprovado).
const NEG_Z2 = "# O dono registado do trinco $1 ainda corre (mesmo PID E mesmo início)? 0 = sim, 1 = não ou sem registo.\ntrinco_vivo() {\n  [ -f \"$1/dono\" ] || return 1\n  _tp=$(chave \"$1/dono\" pid 2>/dev/null) || return 1\n  _ti=$(chave \"$1/dono\" inicio 2>/dev/null) || return 1\n  case \"$_tp\" in \"\"|*[!0-9]*) return 1 ;; esac\n  [ -d \"/proc/$_tp\" ] || return 1\n  _ta=$(inicio_de \"$_tp\" 2>/dev/null) || return 1\n  [ \"$_ta\" = \"$_ti\" ]\n}\n";
// Variante SINTÉTICA (marcada como tal): três estados, mas uma falha de leitura dá TERMINADO.
const NEG_Z2_TRES = "trinco_estado() {\n  _x=$(cat -- \"$1/dono\" 2>/dev/null) || { echo TERMINADO; return 0; }\n  if [ -n \"$_x\" ]; then echo VIVO; return 0; fi\n  echo INDETERMINADO\n}\n";

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

/** Y1: `kill` em código fora do corpo de sinaliza_se_mesmo (a única guarda de identidade do pacote). */
export function killsForaDaGuarda(texto) {
  const achados = [];
  let dentro = false;
  semComentarios(texto).split("\n").forEach((l, i) => {
    if (/^sinaliza_se_mesmo\(\) \{/.test(l)) dentro = true;
    if (!dentro && /(^|[;\s(|&!])kill\s/.test(l)) achados.push({ linha: i + 1, l: l.trim() });
    if (dentro && /^\}/.test(l)) dentro = false;
  });
  return achados;
}

/** Y2: caminhos do R90 em relação ao início do descarte (linha "DESCARTE=1" seguida de "CODIGO_FALHA=3"). */
export function caminhosDescarte(texto) {
  const code = semComentarios(texto).split("\n");
  const iM = code.findIndex((l) => l === "DESCARTE=1");
  const par = iM >= 0 && code[iM + 1] === "CODIGO_FALHA=3";
  const limpa = (l) => l.replace(/2>\/dev\/null/g, "").replace(/>&2/g, "").replace(/"(?:[^"\\]|\\.)*"/g, '"S"').replace(/'[^']*'/g, "'S'");
  const MUT = /(^|[\s;(|&!])(rm|rmdir|mkdir|cp|mv|touch|chmod|chown|ln|kill|trinco_adquire|trinco_liberta|trinco_liberta_ou_incerteza|trinco_assume_orfao|sinaliza_se_mesmo)(\s|$)|cgroup\.kill|(^|[^0-9&>])>>?\s*"?[$/A-Za-z]/;
  const antes = [];
  for (let i = 0; i < (iM < 0 ? code.length : iM); i++) if (MUT.test(limpa(code[i]))) antes.push({ linha: i + 1, l: code[i].trim() });
  const depois = iM < 0 ? [] : code.slice(iM + 2).map((l, k) => ({ linha: iM + 3 + k, l }));
  const saidasRuins = [], cont = { fail: 0, incerteza: 0, exit3: 0, funcoesExit2: 0 };
  for (const { linha, l } of depois) {
    for (const m of limpa(l).matchAll(/(^|[\s;|&{(])exit(\s+([^\s;)}]+))?/g)) { if (m[3] === "3") cont.exit3++; else saidasRuins.push({ linha, l: l.trim() }); }
    cont.fail += (limpa(l).match(/(^|[\s;|&{(])fail\s/g) ?? []).length;
    cont.incerteza += (limpa(l).match(/(^|[\s;|&{(])incerteza\s/g) ?? []).length;
  }
  const trapsFora = depois.filter((x) => /trap - EXIT/.test(x.l));
  const fim = depois.map((x) => x.l).filter((l) => l.trim() !== "");
  const finalOk = trapsFora.length === 1 && fim.length >= 2 && /^trap - EXIT INT TERM HUP$/.test(fim[fim.length - 1]) && /^echo "R90 DESCARTADO[^"]*" \|\| exit 3$/.test(fim[fim.length - 2]);
  return { iM, par, antes, saidasRuins, finalOk, cont, depois };
}

/** Y3: ordem única dos passos de topo do ensaio. */
export const ORDEM_UNICA = { R10: 1, R20: 2, R05: 3, R40: 4, R90: 5 };
const tokensDe = (l) => [...l.matchAll(/\bR(05|10|20|40|90)\b/g)].map((m) => ORDEM_UNICA[`R${m[1]}`]);
/** Afirmações de ordem que contradizem a ordem única: (a) cadeias com setas (→ ou ->) numa célula/linha, cujos
 *  passos de topo têm de aparecer por ordem; (b) "<passo> … antes/depois do <passo>" na mesma oração. */
export function linhasForaDeOrdem(texto) {
  const achados = [];
  texto.split("\n").forEach((l, i) => {
    const celulas = l.trim().startsWith("|") ? l.split("|") : [l];
    for (const c of celulas) {
      if (/→|->/.test(c)) { const t = tokensDe(c); if (t.some((v, k) => k > 0 && v < t[k - 1])) achados.push({ linha: i + 1, l, tipo: "seta" }); }
      for (const m of c.matchAll(/\b(antes|depois)\s+d[oa]s?\s+(?:passo\s+)?`?R(05|10|20|40|90)\b/g)) {
        const ini = Math.max(c.lastIndexOf(". ", m.index), c.lastIndexOf("; ", m.index), 0);
        const suj = tokensDe(c.slice(ini, m.index));
        if (!suj.length) continue;
        const a = suj[suj.length - 1], b = ORDEM_UNICA[`R${m[2]}`];
        if (a !== b && (m[1] === "antes" ? a > b : a < b)) achados.push({ linha: i + 1, l, tipo: m[1] });
      }
    }
  });
  return achados;
}
/** Passos de topo citados na coluna `col` de uma tabela markdown (linha a linha, pela ordem do texto) a seguir ao título `titulo`. */
export function ordemTabela(texto, titulo, col) {
  const ls = texto.split("\n");
  let i = ls.findIndex((l) => l.startsWith(titulo));
  if (i < 0) return null;
  while (i < ls.length && !ls[i].startsWith("|")) i++;
  const seq = [];
  for (i += 2; i < ls.length && ls[i].startsWith("|"); i++) { const c = ls[i].split("|")[col + 1] ?? ""; seq.push(...tokensDe(c)); }
  return seq;
}
/** Z1: remoções (rm/rmdir) cujo alvo é o caminho PARTILHADO do trinco (".trinco" ou $TRINCO_MEU no comando). */
export function remocoesPartilhadasDoTrinco(texto) {
  const achados = [];
  semComentarios(texto).split("\n").forEach((l, i) => {
    for (const m of l.matchAll(/(^|[\s;(|&!{])(rm|rmdir)\s+([^;|&]*)/g)) if (/\.trinco|TRINCO_MEU/.test(m[3])) achados.push({ linha: i + 1, l: l.trim() });
  });
  return achados;
}
/** Z1: "mv" fora das três funções do protocolo do trinco (trinco_adquire, trinco_liberta, trinco_assume_orfao) ou sem -T. */
export function mvForaDoProtocolo(texto) {
  const achados = [];
  let f = null;
  semComentarios(texto).split("\n").forEach((l, i) => {
    const m = l.match(/^([a-z_0-9]+)\(\) \{/);
    if (m) f = m[1];
    if (/(^|[\s;(|&!{])mv\s/.test(l) && (!["trinco_adquire", "trinco_liberta", "trinco_assume_orfao"].includes(f) || !/(^|[\s;(|&!{])mv -T -- /.test(l))) achados.push({ linha: i + 1, l: l.trim() });
    if (/^\}/.test(l)) f = null;
  });
  return achados;
}
/** Z1: libertações do trinco cujo resultado é ignorado. Só três formas são admitidas: a da própria biblioteca
 *  (trinco_liberta_ou_incerteza), a do R10 (falha => INCERTEZA, código 3) e a do R90 (|| incerteza). */
export function libertacoesIgnoradas(texto) {
  const admitidas = [/^if trinco_liberta; then return 0; fi$/, /^if trinco_liberta; then :; else inc="/, /^trinco_liberta \|\| incerteza "/];
  return semComentarios(texto).split("\n").map((l, i) => ({ linha: i + 1, l: l.trim() }))
    .filter(({ l }) => /\btrinco_liberta\b/.test(l) && !/^trinco_liberta\(\) \{/.test(l) && !admitidas.some((r) => r.test(l)));
}
/** Z2: violações num avaliador do estado do dono do trinco. Uma falha de leitura nunca pode dar "terminou":
 *  (1) tem de ter os TRÊS estados; (2) nenhum "return 1" (dois valores); (3) toda a linha com "||" (fora do idioma
 *  de leitura "read -r … || [ -n … ]") só pode levar a INDETERMINADO; (4) TERMINADO só nas três provas admitidas,
 *  cada uma uma vez: PID ausente, PID com outro início, o próprio dono em Z/X. */
const TERM = /(?<![A-Z])TERMINADO/;
export function estadoTrincoViolacoes(fnTexto) {
  const code = semComentarios(fnTexto).split("\n").map((l) => l.trim()).filter(Boolean);
  const v = [];
  for (const w of ["VIVO", "INDETERMINADO"]) if (!code.some((l) => new RegExp(`echo ${w}\\b`).test(l))) v.push(`sem o estado ${w}`);
  if (!code.some((l) => /echo TERMINADO\b/.test(l))) v.push("sem o estado TERMINADO");
  for (const l of code) if (/\breturn 1\b/.test(l)) v.push(`dois valores (return 1): ${l}`);
  for (const l of code) {
    const sem = l.replace(/read -r [_a-z]+ \|\| \[ -n "\$[_a-z]+" \]/g, "");
    if (/\|\|/.test(sem) && (!/INDETERMINADO/.test(sem) || TERM.test(sem) || /\bVIVO\b/.test(sem))) v.push(`falha/alternativa que não dá INDETERMINADO: ${l}`);
  }
  const provas = [
    /^if \[ ! -e "\/proc\/\$_dp" \] && \[ ! -L "\/proc\/\$_dp" \]; then echo TERMINADO; return 0; fi$/,
    /^if \[ "\$_ini" != "\$_di" \]; then echo TERMINADO; return 0; fi$/,
    /^case "\$_est" in Z\|X\) echo TERMINADO; return 0 ;; [A-Za-z|]+\) echo VIVO; return 0 ;; esac$/,
  ];
  const term = code.filter((l) => TERM.test(l));
  for (const l of term) if (!provas.some((r) => r.test(l))) v.push(`TERMINADO sem prova admitida: ${l}`);
  for (const r of provas) if (term.filter((l) => r.test(l)).length !== 1) v.push(`prova de término em falta ou repetida: ${r}`);
  return v;
}
const crescente = (seq) => !!seq && seq.length > 0 && seq.every((v, k) => k === 0 || v >= seq[k - 1]);

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

  const man = JSON.parse(ler("MANIFEST.json"));
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
  const permitidos = todosKills.filter((k) => /tools\/lib_ensaio\.sh: if kill "-\$2" "\$1" 2>\/dev\/null; then/.test(k));
  ok(kills(NEG_X3).length === 1, "X3-0 controlo negativo: o detetor encontra o kill direto da v1.0.4");
  ok(todosKills.length === 1 && permitidos.length === 1, `X3-1 só um kill no pacote: o de sinaliza_se_mesmo (identidade completa relida antes)${todosKills.length !== 1 ? " — encontrados: " + todosKills.join(" | ") : ""}`);
  const sig = fn(lib, "sinaliza_se_mesmo");
  ok(sig.indexOf("identidade_para") >= 0 && sig.indexOf("cmp -s") > sig.indexOf("identidade_para") && sig.indexOf("kill ") > sig.indexOf("cmp -s"), "X3-2 sinaliza_se_mesmo: relê a identidade completa, compara byte a byte e só depois envia o sinal");
  ok(/sinaliza_se_mesmo "\$p" INT/.test(r90) && /sinaliza_se_mesmo "\$p" QUIT/.test(r90), "X3-3 R90: SIGINT e SIGQUIT só por sinaliza_se_mesmo (identidade relida antes de CADA sinal)");
  const iD = r90.indexOf("\nDESCARTE=1\nCODIGO_FALHA=3\n"), iTrap = r90.indexOf("trap saida_r90 EXIT"), iAut = r90.indexOf('exige_autorizacao "${1:-}"');
  const depois = iD >= 0 ? r90.slice(iD) : "";
  ok(iD > 0 && iTrap > 0 && iTrap < iAut && /if \[ "\$DESCARTE" = 1 \] && \[ "\$rc" -ne 0 \]; then/.test(fn(r90, "saida_r90")) && /exit 3/.test(fn(r90, "saida_r90")), "X3-4 R90: EXIT trap converte QUALQUER saída ≠ 0 depois de DESCARTE=1 em código 3; fail passa a código 3 (CODIGO_FALHA)");
  ok((depois.match(/trap - EXIT/g) ?? []).length === 1 && /\necho "R90 DESCARTADO[^\n]*" \|\| exit 3\ntrap - EXIT INT TERM HUP\n$/.test(depois), "X3-5 R90: o EXIT trap só é retirado DEPOIS da linha final DESCARTADO (escrita com || exit 3)");
  ok(/CODIGO_FALHA" = 3 \]; then printf 'INCERTEZA: %s\\n' "\$1" >&2; exit 3; fi/.test(lib), "X3-6 lib: fail termina com 3 quando CODIGO_FALHA=3");
  const fal = fn(r10, "falhou");
  ok(/sinaliza_se_mesmo "\$PID" INT "\$REF"/.test(fal) && /postmaster\.inicio\.arranque/.test(fal) && /pai_de "\$PID"/.test(fal) && /exit 3/.test(fal) && /PID=\$!\nprintf '%s\\n' "\$PID" > "\$EV\/postmaster\.pid\.registado" \|\| fail "escrita falhou"\n# [^\n]*\ninicio_de "\$PID" > "\$EV\/postmaster\.inicio\.arranque"/.test(r10), "X3-7 R10: trap só sinaliza com identidade completa (registada ou provisória: início logo após o arranque, pai, executável, cwd, cgroup); dúvida => código 3");

  // Y1: nenhum sinal ao cliente psql sem a identidade reconfirmada imediatamente antes
  ok(killsForaDaGuarda(NEG_Y1).length === 1, "Y1-0 controlo negativo: o detetor reprova o SIGTERM direto ao cliente do R40 da v1.0.5 (tools/R40_sessao.sh:112)");
  for (const p of scripts) { const a = killsForaDaGuarda(src[p]); ok(a.length === 0, `Y1-1 ${p}: nenhum kill fora de sinaliza_se_mesmo${a.length ? " — linhas " + a.map((x) => x.linha).join(",") : ""}`); }
  const ct = fn(r40, "cliente_termina"), s40 = fn(r40, "saida_r40");
  const iSig = ct.indexOf('sinaliza_se_mesmo "$CPID" TERM "$T/cliente.referencia" "$T"');
  ok(iSig > 0 && ct.indexOf('identidade_para "$CPID" "$T/cliente.referencia"') > 0 && ct.indexOf('identidade_para "$CPID"') < iSig
    && ['inicio 2>/dev/null)" = "$CINI"', 'exe_id 2>/dev/null)" = "$PSQLID"', 'netns 2>/dev/null)" = "$NETNS"', 'pidns 2>/dev/null)" = "$PIDNS"', 'cgroup 2>/dev/null)" = "$MEUCG"', 'pai_de "$CPID" 2>/dev/null)" = "$$"'].every((x) => { const j = ct.indexOf(x); return j > 0 && j < iSig; })
    && /if terminou "\$CPID"; then return 0; fi\n  return 3\n\}/.test(ct) && /\[ -z "\$CINI" \]/.test(ct),
    "Y1-2 R40 cliente_termina: referência = identidade lida agora e aceite só com início do lançamento, executável do psql do R10, namespaces, cgroup e pai = wrapper; sinal só por sinaliza_se_mesmo; vivo e não confirmado => 3");
  const iE3 = s40.indexOf("exit 3"), iLib = s40.indexOf("trinco_liberta");
  ok(/if cliente_termina; then :; else/.test(s40) && iE3 > 0 && iLib > iE3 && /trap saida_r40 EXIT\ntrap 'INTERROMPIDO=1; exit 2' INT TERM HUP\ntrinco_adquire "\$ROOT" "R40:\$PASSO"/.test(r40) && !/interrompido\(\)/.test(r40),
    "Y1-3 R40: EXIT trap instalado antes do trinco; sinais só marcam e saem (o EXIT trap decide); INCERTEZA => código 3 sem libertar o trinco");
  ok(/CPID=\$!\n#[^\n]*\nif CINI=\$\(inicio_de "\$CPID" 2>\/dev\/null\); then :; else CINI=; fi\n/.test(r40) && /PSQLID=\$\(ler1 "\$EV\/psql\.exe_id"\) \|\| exit 2\n\[ "\$\(ficheiro_id "\$PG_BIN\/psql"\)" = "\$PSQLID" \]/.test(r40) && /MEUCG=\$\(cgroup_de "\$\$"\) \|\| exit 2/.test(r40),
    "Y1-4 R40: início do psql lido logo após o lançamento; executável do psql conferido com o registo do R10; cgroup do wrapper fixado antes do lançamento");
  const term = fn(lib, "terminou");
  ok(/\/proc\/\$1\/stat/.test(term) && /"Z "\*\|"X "\*\) return 0/.test(term) && !/kill/.test(term), "Y1-5 lib terminou: só /proc (ausente ou zombie = terminou); não sinaliza");

  // Y2: depois do início efetivo do descarte, TODA a saída é 3
  const n2 = caminhosDescarte(NEG_Y2), n2e = caminhosDescarte(NEG_Y2_EXIT);
  ok(n2.antes.length >= 2 && n2.antes.some((x) => /rm -rf/.test(x.l)) && n2.antes.some((x) => /trinco_adquire/.test(x.l)) && !n2.finalOk && n2e.saidasRuins.length === 1,
    "Y2-0 controlo negativo: o detetor reprova a v1.0.5 (rm do trinco órfão e trinco_adquire antes de DESCARTE=1; EXIT trap retirado antes da linha final) e uma saída explícita ≠ 3 depois do início");
  const c90 = caminhosDescarte(r90);
  ok(c90.iM > 0 && c90.par && c90.antes.length === 0, `Y2-1 R90: nenhuma alteração antes de DESCARTE=1/CODIGO_FALHA=3 (rm, mkdir, cp, escrita, trinco, sinal, cgroup.kill)${c90.antes.length ? " — linhas " + c90.antes.map((x) => x.linha).join(",") : ""}`);
  const iRm = r90.indexOf('  trinco_assume_orfao "$ROOT" || incerteza "'), iAdq = r90.indexOf('trinco_adquire "$ROOT" R90'), iDesc = r90.indexOf("\nDESCARTE=1\nCODIGO_FALHA=3\n");
  ok(iDesc > 0 && iRm > iDesc && iAdq > iRm, "Y2-2 R90: assumir o trinco órfão (trinco_assume_orfao) e adquiri-lo vêm DEPOIS de DESCARTE=1");
  const libFns = [...lib.matchAll(/\n([a-z_0-9]+)\(\) \{/g)].map((m) => m[1]);
  const usadas = libFns.filter((f) => c90.depois.some((x) => new RegExp(`(^|[\\s;(|&!$])${f}(\\s|$|\\))`).test(x.l)));
  const exitsLib = usadas.flatMap((f) => [...fn(lib, f).matchAll(/\bexit\s+([^\s;)}]+)/g)].map((m) => `${f}:${m[1]}`)).filter((x) => !/:(2|3)$/.test(x));
  const sr = fn(r90, "saida_r90"), inc = (r90.match(/\nincerteza\(\) \{[^\n]*\n/) ?? [""])[0];
  ok(c90.saidasRuins.length === 0 && exitsLib.length === 0 && /if \[ "\$DESCARTE" = 1 \] && \[ "\$rc" -ne 0 \]; then/.test(sr) && /exit 3/.test(sr) && /exit 3/.test(inc) && !/trap - EXIT/.test(inc) && /trap saida_r90 EXIT/.test(r90.slice(0, iDesc)),
    `Y2-3 R90: todos os caminhos depois do início dão 3 — ${c90.cont.incerteza} incerteza, ${c90.cont.fail} fail (CODIGO_FALHA=3), ${c90.cont.exit3} exit 3, 0 exit ≠ 3; funções da biblioteca usadas (${usadas.length}: ${usadas.join(", ")}) só saem com 2 ou 3 e o EXIT trap converte ≠ 0 em 3; incerteza não retira o EXIT trap${c90.saidasRuins.length ? " — saídas ≠ 3: " + c90.saidasRuins.map((x) => x.linha).join(",") : ""}${exitsLib.length ? " — " + exitsLib.join(",") : ""}`);
  ok(c90.finalOk, "Y2-4 R90: a linha final DESCARTADO é escrita com o EXIT trap ativo (|| exit 3) e só depois o trap é retirado (único trap - EXIT depois do início)");

  // Y3: uma única sequência, igual nos documentos, no MANIFEST e imposta pelos scripts
  ok(!crescente(ordemTabela(NEG_Y3, "## 3. Fases", 1)) && linhasForaDeOrdem(NEG_Y3_FRASE).length === 1 && linhasForaDeOrdem(NEG_Y3_SETA).length === 1 && linhasForaDeOrdem("O R05 corre depois do R10 e do R20.\n").length === 0,
    "Y3-0 controlo negativo: o detetor reprova a tabela de fases da v1.0.5 (REHEARSAL-PLAN.md:57-58: fase do R05 antes da do R10, contrária à frase da linha 66), uma frase e uma seta contrárias; aceita a frase correta");
  const mdDocs = ficheiros.filter((p) => p.endsWith(".md") && !/^DIFF-/.test(p));
  for (const d of mdDocs) { const a = linhasForaDeOrdem(ler(d)); ok(a.length === 0, `Y3-1 ${d}: nenhuma seta nem "antes/depois" contrária à ordem única R10 → R20 → R05 → R40 → R90${a.length ? " — linhas " + a.map((x) => x.linha).join(",") : ""}`); }
  const fases = ordemTabela(ler("REHEARSAL-PLAN.md"), "## 3. Fases", 1), passosT = ordemTabela(ler("REHEARSAL-TARGET.md"), "## 2. Passos preparados", 0);
  ok(crescente(fases) && [1, 2, 3, 4, 5].every((v) => fases.includes(v)) && crescente(passosT) && [1, 2, 3, 4, 5].every((v) => passosT.includes(v)), "Y3-2 tabelas de fases (REHEARSAL-PLAN §3) e de passos (REHEARSAL-TARGET §2): R10 → R20 → R05 → R40 → R90, todos presentes");
  const seq = Array.isArray(man.rehearsal_sequence) ? man.rehearsal_sequence.join(" → ") : "";
  const docsSeq = ["README.md", "REHEARSAL-PLAN.md", "REHEARSAL-TARGET.md", "TEST-CRITERIA.md"];
  ok(seq.startsWith("E1–E10 → R10 → R20 → R05 → R40 R30 → ") && seq.endsWith(" → R40 T01 → R90") && docsSeq.every((d) => ler(d).includes(`**Sequência única:** \`${seq}\``)), `Y3-3 sequência única do MANIFEST (rehearsal_sequence) escrita igual em ${docsSeq.join(", ")}`);
  const iP = r05.indexOf('[ "$(ler1 "$EV/fase")" = pronto ] || fail'), iT5 = r05.indexOf('trinco_adquire "$ROOT" R05'), iS = r05.indexOf('[ ! -e "$EV/sessoes" ] || fail'), iR20 = r05.indexOf('R20OUT=$(sh "$TOOLS/R20_verificar_processo.sh" "$1" "$ROOT"'), iMk = r05.indexOf('mkdir -- "$EV/entradas"'), iAp = r05.indexOf('> "$EV/R05.aprovado"');
  const i40 = r40.indexOf('[ -f "$EV/R05.aprovado" ] && [ ! -L "$EV/R05.aprovado" ] || fail'), iOrd = r40.indexOf("\nANT=\n");
  ok(iP > 0 && iP < iT5 && iT5 < iS && iS < iR20 && iR20 < iMk && iMk < iAp && /\[ "\$R20OUT" = "R20 APROVADO" \]/.test(r05) && r05.indexOf("echo \"R05 APROVADO") > iAp
    && i40 > 0 && i40 < iOrd && i40 < r40.indexOf('trinco_adquire "$ROOT"') && /^ORDEM="R30 /m.test(r40) && /\[ "\$\(ler1 "\$EV\/fase"\)" = pronto \]/.test(r20),
    "Y3-4 scripts impõem a sequência: R05 exige a fase pronto do R10, corre o R20 completo (linha exata), recusa sessões do R40 já começadas e grava R05.aprovado por último; o R40 recusa qualquer passo (o 1.º é R30) sem R05.aprovado; o R20 exige o R10 terminado");

  // E1–E10: ficha
  const mod = ler("operador/E-EVIDENCIA.modelo");
  ok(Array.from({ length: 10 }, (_, i) => `\nE${i + 1}=PENDENTE\n`).every((x) => mod.includes(x)) && /<artefacto>\|<sha256/.test(mod), "F1 modelo da ficha: 10 obrigações PENDENTE e formato artefacto|sha256|descrição");
  ok(!/length\(val\[k\]\) < 8/.test(r10) && /split\(val\[k\], f, "\|"\) != 3/.test(r10) && /length\(d\) < 30 \|\| nw < 5/.test(r10) && /E-artefactos/.test(r10) && /\[ "\$g" = "\$h" \] \|\| fail "artefacto de \$k não confere/.test(r10) && /\[ "\$NA" -eq 10 \]/.test(r10), "F2 R10: oito caracteres já não bastam — exige artefacto existente com sha256 que confere, descrição >= 30 caracteres e >= 5 palavras, sem repetições");

  // Trinco global
  ok([r10, r05, r40, r90].every((s) => /trinco_adquire "\$ROOT"/.test(s)) && ![r20, r41].some((s) => /trinco_adquire|trinco_liberta/.test(s)), "T1 trinco global: R10, R05, R40 e R90 seguram <ROOT>/.trinco; R20 e R41 (só leitura) não o tocam");
  ok(/EST=\$\(trinco_estado "\$ROOT\/\.trinco"\) \|\| EST=INDETERMINADO/.test(r90) && /trinco_adquire "\$ROOT" R90/.test(r90) && /\.trinco\|pgdata/.test(r90) && !/trinco_vivo/.test(semComentarios(lib + r90)), "T2 R90: decide pelo estado em três valores (trinco_estado), assume só TERMINADO, conhece .trinco; trinco_vivo (dois valores) já não existe");

  // Z1: nenhum trinco apagado no caminho partilhado; libertar/assumir = rename para nome privado + confirmação
  const z1neg = remocoesPartilhadasDoTrinco(NEG_Z1).length, z1fim = remocoesPartilhadasDoTrinco(NEG_Z1_FIM).length, z1lib = remocoesPartilhadasDoTrinco(NEG_Z1_LIB).length;
  ok(z1neg === 1 && z1fim === 1 && z1lib === 2 && libertacoesIgnoradas(NEG_Z1_IGN05).length === 1 && libertacoesIgnoradas(NEG_Z1_IGN10).length === 1 && libertacoesIgnoradas(NEG_Z1_LIB).length === 0,
    "Z1-0 controlo negativo: o detetor reprova a v1.0.6 — R90:61-75 (rm -rf do .trinco depois do juízo), R90:160-161 (rm do próprio trinco), lib:302-308 (rm/rmdir no caminho partilhado) e as libertações ignoradas do R05 (EXIT trap) e do R10 (falhou)");
  for (const p of scripts) { const a = remocoesPartilhadasDoTrinco(src[p]); ok(a.length === 0, `Z1-1 ${p}: nenhum rm/rmdir no caminho partilhado do trinco (.trinco, $TRINCO_MEU)${a.length ? " — linhas " + a.map((x) => x.linha).join(",") : ""}`); }
  const mvs = scripts.flatMap((p) => mvForaDoProtocolo(src[p]).map((x) => `${p}:${x.linha}`));
  ok(mvs.length === 0 && (semComentarios(lib).match(/(^|[\s;(|&!{])mv -T -- /gm) ?? []).length === 3, `Z1-2 rename (mv -T) só nas três funções do protocolo: dono.tmp → dono, libertação e assunção${mvs.length ? " — fora: " + mvs.join(", ") : ""}`);
  const ao = fn(lib, "trinco_assume_orfao");
  const ordemAo = ["stat -c '%d:%i' -- \"$_o\"", 'cat -- "$_o/dono"', '_oes=$(trinco_estado "$_o")', 'if [ "$_oes" != TERMINADO ]; then return 1; fi', 'if [ "$_otx2" != "$_otx" ]; then return 1; fi', 'mv -T -- "$_o" "$_dst"', "stat -c '%d:%i' -- \"$_dst\"", 'if [ "$_nid" != "$_oid" ]; then return 1; fi', 'if [ "$_ntx" != "$_otx" ]; then return 1; fi', 'if [ "$_nes" != TERMINADO ]; then return 1; fi', 'rm -rf -- "$_dst"'].map((x) => ao.indexOf(x));
  ok(ordemAo.every((v, k) => v > 0 && (k === 0 || v > ordemAo[k - 1])) && !/\b(fail|exit)\b/.test(semComentarios(ao)) && /_dst=\$1\/\.trinco\.orfao\.\$\$\.\$_oti/.test(ao),
    "Z1-3 trinco_assume_orfao: lê dispositivo:inode e dono, exige TERMINADO e o dono igual antes/depois do juízo → rename para nome privado → confirma o MESMO dispositivo:inode, o MESMO dono (nonce) e de novo TERMINADO → só então apaga a cópia privada; nenhuma falha sai sem ser 1 (nada apagado)");
  const tl = fn(lib, "trinco_liberta"), tm = fn(lib, "trinco_e_meu");
  const ordemTl = ['trinco_e_meu "$_tl" || return 1', 'mv -T -- "$_tl" "$_tv"', 'trinco_e_meu "$_tv" || return 1', 'rm -rf -- "$_tv"', "TRINCO_MEU=; TRINCO_ID=; TRINCO_TEXTO="].map((x) => tl.indexOf(x));
  ok(ordemTl.every((v, k) => v > 0 && (k === 0 || v > ordemTl[k - 1])) && (tl.match(/TRINCO_MEU=/g) ?? []).length === 1 && !/\b(fail|exit)\b/.test(semComentarios(tl)) && /"\$_mi" != "\$TRINCO_ID"/.test(tm) && /"\$_mt" != "\$TRINCO_TEXTO"/.test(tm),
    "Z1-4 trinco_liberta: só se trinco_e_meu (dispositivo:inode da aquisição + dono byte a byte) → rename para nome privado → trinco_e_meu outra vez → apagar a cópia privada; o registo do trinco só se limpa no fim (falha repete-se); nunca fail/exit");
  const ta = fn(lib, "trinco_adquire");
  const ordemTa = ["uuid_de /proc/sys/kernel/random/uuid", "uuid_de /proc/sys/kernel/random/boot_id", 'inicio_de "$$"', 'ns_de "$$" pid', 'mkdir -- "$1/.trinco"', "TRINCO_ID=$(stat -c '%d:%i' -- \"$TRINCO_MEU\")", '> "$TRINCO_MEU/dono.tmp"', 'mv -T -- "$TRINCO_MEU/dono.tmp" "$TRINCO_MEU/dono"'].map((x) => ta.indexOf(x));
  ok(ordemTa.every((v, k) => v > 0 && (k === 0 || v > ordemTa[k - 1])) && /pid=%s\\ninicio=%s\\npidns=%s\\nboot=%s\\nnonce=%s\\npasso=%s\\nfim=1/.test(ta),
    "Z1-5 trinco_adquire: nonce, arranque, início e namespace lidos ANTES do mkdir (atómico); dispositivo:inode logo a seguir; dono (7 campos, com nonce) escrito em dono.tmp e posto no lugar por rename");
  const iEst = r90.indexOf('EST=$(trinco_estado "$ROOT/.trinco") || EST=INDETERMINADO'), iFinal = r90.indexOf('echo "R90 DESCARTADO'), iLibR90 = r90.indexOf('trinco_liberta || incerteza "');
  ok(iEst > 0 && iEst < iDesc && iDesc < iRm && iRm < iAdq && iLibR90 > iAdq && iLibR90 < iFinal && /\n    \.trinco\.\*\) incerteza "/.test(r90),
    "Z1-6 R90: juízo só de leitura antes de DESCARTE=1 → assunção do órfão (rename + confirmação) → mkdir; restos privados .trinco.* => INCERTEZA sem apagar; o trinco do R90 sai por trinco_liberta (|| incerteza) antes da linha final");
  const ign = scripts.flatMap((p) => libertacoesIgnoradas(src[p]).map((x) => `${p}:${x.linha}`));
  const s05 = fn(r05, "saida_r05"), s40b = fn(r40, "saida_r40"), fal10 = fn(r10, "falhou");
  const antesDe = (s, a, b) => { const i = s.lastIndexOf(a), j = s.lastIndexOf(b); return i > 0 && j > i; };
  ok(ign.length === 0 && /trinco_liberta_ou_incerteza R05/.test(s05) && /trap saida_r05 EXIT\ntrap 'exit 2' INT TERM HUP\ntrinco_adquire "\$ROOT" R05/.test(r05) && /trinco_liberta_ou_incerteza "R40 \(passo \$PASSO\)"/.test(s40b)
    && /if trinco_liberta; then :; else inc="/.test(fal10) && antesDe(r10, "trinco_liberta_ou_incerteza R10", 'echo "R10 PRONTO') && antesDe(r05, "trinco_liberta_ou_incerteza R05", 'echo "R05 APROVADO') && antesDe(r40, 'trinco_liberta_ou_incerteza "R40 (passo $PASSO)"', 'echo "R40 $PASSO APROVADO"')
    && /printf '%s INCERTEZA: [^\n]*\n  exit 3\n\}/.test(fn(lib, "trinco_liberta_ou_incerteza")),
    `Z1-7 R10, R05, R40: nenhuma libertação ignorada; falha a libertar => código 3 (EXIT traps e caminho de sucesso), e a linha PRONTO/APROVADO só sai depois de o trinco ser libertado${ign.length ? " — ignoradas: " + ign.join(", ") : ""}`);

  // Z2: estado do dono em três valores; falha de leitura nunca é término
  const z2a = estadoTrincoViolacoes(NEG_Z2), z2b = estadoTrincoViolacoes(NEG_Z2_TRES);
  ok(z2a.some((x) => /dois valores/.test(x)) && z2a.some((x) => /sem o estado INDETERMINADO/.test(x)) && z2b.some((x) => /não dá INDETERMINADO/.test(x)) && z2b.some((x) => /sem prova admitida/.test(x)),
    "Z2-0 controlo negativo: o detetor reprova o trinco_vivo da v1.0.6 (lib:309-318, dois valores: leitura falhada => \"não vivo\" => órfão) e uma variante sintética de três estados em que uma leitura falhada dá TERMINADO");
  const te = fn(lib, "trinco_estado"), zv = estadoTrincoViolacoes(te);
  ok(zv.length === 0, `Z2-1 lib trinco_estado: três estados; toda a falha de leitura ou alternativa => INDETERMINADO; TERMINADO só nas três provas (PID ausente, PID com outro início, dono em Z/X)${zv.length ? " — " + zv.join(" | ") : ""}`);
  const ordemTe = ["pid=*)", "inicio=*)", "pidns=*)", "boot=*)", "nonce=*)", "passo=*)", "fim=1)", '[ "$_nl" -ne 7 ]', 'if [ "$_me" != "$_dn" ]; then echo INDETERMINADO', 'if [ -z "$_db" ] || [ "$_bo" != "$_db" ]; then echo INDETERMINADO', 'if [ ! -r "/proc/$$/stat" ]; then echo INDETERMINADO', 'if [ ! -e "/proc/$_dp" ]'].map((x) => te.indexOf(x));
  ok(ordemTe.every((v, k) => v > 0 && (k === 0 || v > ordemTe[k - 1])) && /\n  echo INDETERMINADO\n\}\n$/.test(te),
    "Z2-2 lib trinco_estado: dono completo (7 linhas, cada chave uma vez) e o MESMO namespace de PIDs, o MESMO arranque (boot_id) e /proc do leitor legível ANTES de qualquer prova de término; por omissão INDETERMINADO");
  const usaEst = scripts.filter((p) => /trinco_estado|trinco_assume_orfao/.test(semComentarios(src[p]).replace(/^(trinco_estado|trinco_assume_orfao)\(\) \{/gm, "")));
  ok(/case "\$EST" in\n    VIVO\) fail "/.test(r90) && /\n    TERMINADO\) ORFAO=sim ;;\n    \*\) incerteza "/.test(r90) && r90.indexOf('    *) incerteza "estado do dono do trinco') < iDesc && /if \[ -n "\$ORFAO" \]; then\n  trinco_assume_orfao "\$ROOT" \|\| incerteza "/.test(r90)
    && usaEst.length === 2 && usaEst.includes("tools/lib_ensaio.sh") && usaEst.includes("tools/R90_descartar.sh"),
    "Z2-3 R90: VIVO => 2 (nada tocado); INDETERMINADO ou qualquer outra saída => INCERTEZA 3 ANTES de qualquer alteração e sem remover; só TERMINADO segue para a assunção. Só o R90 julga e assume trincos (R10, R05, R40 nunca)");

  // Campos-token
  const defs = [...r40.matchAll(/^\s+([A-Za-z0-9-]+)\)\s+echo "([^"]+)" ;;$/gm)].map((m) => ({ passo: m[1], f: m[2].split("|") }));
  const ordem = (r40.match(/^ORDEM="([^"]+)"$/m) ?? [, ""])[1].split(" ");
  ok(defs.length === 25 && defs.map((d) => d.passo).join(" ") === ordem.join(" "), `K1 R40: 25 passos na tabela, pela mesma ordem do ORDEM`);
  const steps = new Map((man.session_steps ?? []).map((s) => [s.passo, s]));
  for (const d of defs) {
    const [fich = "", base, papel, sup, tx, desb, marc = ""] = d.f;
    const tokens = marc === "-" ? [] : marc.split(",");
    const conhecidos = tokens.every((t) => Object.prototype.hasOwnProperty.call(TOKENS, t));
    const boa = d.f.length === 7 && conhecidos && ["postgres", "afonso_ensaio"].includes(base) && ["ensaio_super", "postgres"].includes(papel) && [sup, tx, desb].every((v) => v === "sim" || v === "nao") && ((sup === "sim") === (papel === "ensaio_super")) && (desb === "nao" || fich.endsWith(".bloqueado.sql")) && tokens.every((t) => t in TOKENS) && new Set(tokens).size === tokens.length;
    const st = steps.get(d.passo);
    const espelho = !!st && st.base === base && st.papel === papel && st.super === (sup === "sim") && st.tx === (tx === "sim") && st.desbloquear === (desb === "sim") && (d.passo === "0000" ? fich === "ENTRADA_0000" : st.ficheiro === fich);
    let cobre = true, sobra = [];
    if (fich !== "ENTRADA_0000" && conhecidos && existsSync(join(pkg, fich))) {
      const t = ler(fich);
      cobre = tokens.every((k) => TOKENS[k].some((m) => t.includes(m)));
      const perm = new Set(tokens.flatMap((k) => TOKENS[k]));
      sobra = [...new Set(t.match(/__[A-Z][A-Z0-9_]*__/g) ?? [])].filter((m) => !perm.has(m));
    }
    else if (fich !== "ENTRADA_0000") cobre = false;
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
