import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { readInputs, walk } from "../../../../scripts/staging/build-staging-package-v101";
import { copiedFromPreviousV107 } from "../../../../scripts/staging/build-staging-package-v107";
import { buildDiffV107, buildManifestV107, buildSha256SumsV107, generateDerivedFilesV107, PACKAGE_DIR_V107 } from "./package";
import { BLOCKERS_V107, FINDINGS_V107, REHEARSAL_SEQUENCE_V107, STAGING_0000_INPUT_V107, V107_CHANGED_HANDWRITTEN, V107_NEW, V107_PRESERVED_SQL_SHA256, V107_PREVIOUS_DIR } from "./rules";
// @ts-expect-error módulo .mjs do próprio pacote, sem tipos
import { verificar } from "../../../../staging-install/package/v1.0.7/verificacao/V01_regressao_estatica.mjs";

// Pacote v1.0.7. Testes SÓ ESTÁTICOS: nada aqui liga a uma base nem corre um script ou guião do ensaio.
const ROOT = process.cwd();
const PKG = join(ROOT, PACKAGE_DIR_V107);
const PREV = join(ROOT, V107_PREVIOUS_DIR);
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const read = (p: string) => readFileSync(join(PKG, p));
const onDisk = walk(PKG).map((p) => relative(PKG, p).split("\\").join("/"));
const all = () => onDisk.map((p) => ({ path: p, content: read(p) }));
const noMeta = () => all().filter((f) => f.path !== "MANIFEST.json" && f.path !== "SHA256SUMS");
const { files: derived } = generateDerivedFilesV107(readInputs(ROOT));

describe("v1.0.7: reprodutibilidade byte a byte", () => {
  it("derivados, DIFF, MANIFEST e SHA256SUMS = montagem", () => {
    for (const f of derived) expect(read(f.path).toString("utf8"), f.path).toBe(f.content);
    expect(read("DIFF-v1.0.6.md").toString("utf8")).toBe(buildDiffV107(readFileSync(join(PREV, "SHA256SUMS"), "utf8"), noMeta()));
    expect(read("MANIFEST.json").toString("utf8")).toBe(buildManifestV107(noMeta()));
    expect(read("SHA256SUMS").toString("utf8")).toBe(buildSha256SumsV107(all()));
  });

  it("copiados da v1.0.6 sem alteração; alterados diferem; DIFF-v1.0.5 retirado", () => {
    for (const p of copiedFromPreviousV107(ROOT, derived.map((f) => f.path))) expect(sha(read(p)), p).toBe(sha(readFileSync(join(PREV, p))));
    for (const p of V107_CHANGED_HANDWRITTEN) expect(sha(read(p)), p).not.toBe(sha(readFileSync(join(PREV, p))));
    for (const p of V107_NEW) expect(onDisk, p).toContain(p);
    expect(onDisk).not.toContain("DIFF-v1.0.5.md");
    for (const p of ["tools/R20_verificar_processo.sh", "tools/R41_processo_cliente.sh", "operador/E-EVIDENCIA.modelo", "ensaio/R40_sessao.psql"]) expect(sha(read(p)), p).toBe(sha(readFileSync(join(PREV, p))));
  });
});

describe("v1.0.7: preservado", () => {
  it("S4-00…S4-05 byte a byte com os sha256 auditados e iguais à v1.0.6", () => {
    expect(Object.keys(V107_PRESERVED_SQL_SHA256)).toHaveLength(6);
    for (const [n, h] of Object.entries(V107_PRESERVED_SQL_SHA256)) {
      expect(sha(read(`sql/${n}`)), n).toBe(h);
      expect(read(`sql/${n}`).equals(readFileSync(join(PREV, `sql/${n}`))), n).toBe(true);
    }
  });
  it("entrada 0000 autenticada byte a byte igual", () => {
    const b = read(STAGING_0000_INPUT_V107.packagedPath);
    expect(sha(b)).toBe(STAGING_0000_INPUT_V107.sha256Full);
    expect(b.length).toBe(2303);
    expect(b[b.length - 1]).not.toBe(0x0a);
    expect(b.equals(readFileSync(join(PREV, STAGING_0000_INPUT_V107.packagedPath)))).toBe(true);
  });
});

describe("v1.0.7: regressão estática do pacote (V01)", () => {
  it("passa no pacote e a saída registada é a de hoje", () => {
    const r = verificar(PKG, { semSintaxe: true });
    expect(r.linhas.filter((l: string) => l.startsWith("FALHA"))).toEqual([]);
    expect(r.falhas).toBe(0);
    const reg = read("evidence/regressao-estatica.txt").toString("utf8");
    expect(reg).toContain("RESULTADO: 0 falhas");
    for (const l of r.linhas.filter((x: string) => !x.startsWith("OK S"))) expect(reg).toContain(l);
  });
  it("cada bloqueio Z1–Z2 aponta para provas V01 existentes, com controlo negativo; as provas anteriores continuam", () => {
    const reg = read("evidence/regressao-estatica.txt").toString("utf8");
    expect(FINDINGS_V107.map((f) => f.id)).toEqual(["Z1", "Z2"]);
    for (const id of ["Z1-0", "Z1-1", "Z1-2", "Z1-3", "Z1-4", "Z1-5", "Z1-6", "Z1-7", "Z2-0", "Z2-1", "Z2-2", "Z2-3", "Y1-0", "Y1-1", "Y1-2", "Y1-3", "Y1-4", "Y1-5", "Y2-0", "Y2-1", "Y2-2", "Y2-3", "Y2-4", "Y3-0", "Y3-1", "Y3-2", "Y3-3", "Y3-4", "X1-0", "X2-6", "X3-0", "X3-1", "X3-5", "X3-7", "T1", "T2", "K4", "D1"]) expect(reg, id).toContain(`OK ${id} `);
  });
  it("sequência única: E1–E10 → R10 → R20 → R05 → R40 … → R90, no MANIFEST e nos 4 documentos", () => {
    const seq = REHEARSAL_SEQUENCE_V107.join(" → ");
    expect(seq.startsWith("E1–E10 → R10 → R20 → R05 → R40 R30 → ")).toBe(true);
    expect(seq.endsWith(" → R40 T01 → R90")).toBe(true);
    expect(JSON.parse(read("MANIFEST.json").toString("utf8")).rehearsal_sequence).toEqual([...REHEARSAL_SEQUENCE_V107]);
    for (const d of ["README.md", "REHEARSAL-PLAN.md", "REHEARSAL-TARGET.md", "TEST-CRITERIA.md"]) expect(read(d).toString("utf8"), d).toContain(`**Sequência única:** \`${seq}\``);
  });
  it("manifesto: nada executado, sem GO, G1–G4 NO-GO, B13/B14/B18/B19 abertos", () => {
    const m = JSON.parse(read("MANIFEST.json").toString("utf8"));
    expect(m.executed).toBe(false);
    expect(m.rehearsal_go).toBe(false);
    expect(m.rehearsal_authorized).toBe(false);
    expect(m.gates).toBe("G1–G4 NO-GO");
    expect(BLOCKERS_V107.every((b) => !b.resolved)).toBe(true);
    for (const id of ["B13", "B14", "B18", "B19"]) expect(BLOCKERS_V107.find((b) => b.id === id)?.resolved, id).toBe(false);
    expect(m.residual_risks.map((r: string) => r.slice(0, 3))).toEqual(["RR1", "RR2", "RR3", "RR4", "RR5", "RR6", "RR7"]);
  });
});

describe("v1.0.7: trinco (Z1, Z2) — regras lidas do pacote, sem executar nada", () => {
  const lib = read("tools/lib_ensaio.sh").toString("utf8");
  const r90 = read("tools/R90_descartar.sh").toString("utf8");
  it("Z1: nenhum rm/rmdir sobre o caminho partilhado do trinco em nenhum script", () => {
    for (const p of onDisk.filter((x) => /^tools\/.*\.sh$/.test(x))) {
      const code = read(p).toString("utf8").split("\n").filter((l) => !/^\s*#/.test(l));
      const bad = code.filter((l) => [...l.matchAll(/(^|[\s;(|&!{])(rm|rmdir)\s+([^;|&]*)/g)].some((m) => /\.trinco|TRINCO_MEU/.test(m[3])));
      expect(bad, p).toEqual([]);
    }
  });
  it("Z2: o R90 só assume o trinco com o dono TERMINADO; INDETERMINADO dá incerteza (3) antes de DESCARTE=1", () => {
    const iDesc = r90.indexOf("\nDESCARTE=1\nCODIGO_FALHA=3\n");
    expect(r90.indexOf("    TERMINADO) ORFAO=sim ;;")).toBeGreaterThan(0);
    expect(r90.indexOf('    *) incerteza "estado do dono do trinco')).toBeLessThan(iDesc);
    expect(r90.indexOf('trinco_assume_orfao "$ROOT" || incerteza')).toBeGreaterThan(iDesc);
    expect(lib).not.toMatch(/\ntrinco_vivo\(\) \{/);
  });
  it("a versão do pacote nas marcas é 1.0.7", () => {
    expect(lib).toContain("\nVERSAO_PACOTE=1.0.7\n");
  });
});
