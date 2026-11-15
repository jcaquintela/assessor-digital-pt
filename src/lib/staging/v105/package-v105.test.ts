import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { readInputs, walk } from "../../../../scripts/staging/build-staging-package-v101";
import { copiedFromPreviousV105 } from "../../../../scripts/staging/build-staging-package-v105";
import { buildDiffV105, buildManifestV105, buildSha256SumsV105, generateDerivedFilesV105, PACKAGE_DIR_V105 } from "./package";
import { BLOCKERS_V105, FINDINGS_V105, STAGING_0000_INPUT_V105, V105_CHANGED_HANDWRITTEN, V105_NEW, V105_PRESERVED_SQL_SHA256, V105_PREVIOUS_DIR } from "./rules";
// @ts-expect-error módulo .mjs do próprio pacote, sem tipos
import { verificar } from "../../../../staging-install/package/v1.0.5/verificacao/V01_regressao_estatica.mjs";

// Pacote v1.0.5. Testes SÓ ESTÁTICOS: nada aqui liga a uma base nem corre um script ou guião do ensaio.
const ROOT = process.cwd();
const PKG = join(ROOT, PACKAGE_DIR_V105);
const PREV = join(ROOT, V105_PREVIOUS_DIR);
const sha = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const read = (p: string) => readFileSync(join(PKG, p));
const onDisk = walk(PKG).map((p) => relative(PKG, p).split("\\").join("/"));
const all = () => onDisk.map((p) => ({ path: p, content: read(p) }));
const noMeta = () => all().filter((f) => f.path !== "MANIFEST.json" && f.path !== "SHA256SUMS");
const { files: derived } = generateDerivedFilesV105(readInputs(ROOT));

describe("v1.0.5: reprodutibilidade byte a byte", () => {
  it("derivados, DIFF, MANIFEST e SHA256SUMS = montagem", () => {
    for (const f of derived) expect(read(f.path).toString("utf8"), f.path).toBe(f.content);
    expect(read("DIFF-v1.0.4.md").toString("utf8")).toBe(buildDiffV105(readFileSync(join(PREV, "SHA256SUMS"), "utf8"), noMeta()));
    expect(read("MANIFEST.json").toString("utf8")).toBe(buildManifestV105(noMeta()));
    expect(read("SHA256SUMS").toString("utf8")).toBe(buildSha256SumsV105(all()));
  });

  it("copiados da v1.0.4 sem alteração; alterados diferem; DIFF-v1.0.3 retirado", () => {
    for (const p of copiedFromPreviousV105(ROOT, derived.map((f) => f.path))) expect(sha(read(p)), p).toBe(sha(readFileSync(join(PREV, p))));
    for (const p of V105_CHANGED_HANDWRITTEN) expect(sha(read(p)), p).not.toBe(sha(readFileSync(join(PREV, p))));
    for (const p of V105_NEW) expect(onDisk, p).toContain(p);
    expect(onDisk).not.toContain("DIFF-v1.0.3.md");
  });
});

describe("v1.0.5: preservado", () => {
  it("S4-00…S4-05 byte a byte com os sha256 auditados e iguais à v1.0.4", () => {
    expect(Object.keys(V105_PRESERVED_SQL_SHA256)).toHaveLength(6);
    for (const [n, h] of Object.entries(V105_PRESERVED_SQL_SHA256)) {
      expect(sha(read(`sql/${n}`)), n).toBe(h);
      expect(read(`sql/${n}`).equals(readFileSync(join(PREV, `sql/${n}`))), n).toBe(true);
    }
  });
  it("entrada 0000 autenticada byte a byte igual", () => {
    const b = read(STAGING_0000_INPUT_V105.packagedPath);
    expect(sha(b)).toBe(STAGING_0000_INPUT_V105.sha256Full);
    expect(b.length).toBe(2303);
    expect(b[b.length - 1]).not.toBe(0x0a);
    expect(b.equals(readFileSync(join(PREV, STAGING_0000_INPUT_V105.packagedPath)))).toBe(true);
  });
});

describe("v1.0.5: regressão estática do pacote (V01)", () => {
  it("passa no pacote e a saída registada é a de hoje", () => {
    const r = verificar(PKG, { semSintaxe: true });
    expect(r.linhas.filter((l: string) => l.startsWith("FALHA"))).toEqual([]);
    expect(r.falhas).toBe(0);
    const reg = read("evidence/regressao-estatica.txt").toString("utf8");
    expect(reg).toContain("RESULTADO: 0 falhas");
    for (const l of r.linhas.filter((x: string) => !x.startsWith("OK S"))) expect(reg).toContain(l);
  });
  it("cada achado X1–X3 e reforço aponta para uma prova V01 existente", () => {
    const reg = read("evidence/regressao-estatica.txt").toString("utf8");
    for (const id of ["X1", "X2", "X3"]) expect(FINDINGS_V105.some((f) => f.id === id)).toBe(true);
    for (const id of ["X1-0", "X1-1", "X1-2", "X2-1", "X2-6", "X3-0", "X3-7", "F2", "T1", "T2", "K3", "K4", "D1"]) expect(reg, id).toContain(`OK ${id} `);
  });
  it("manifesto: nada executado, sem GO, G1–G4 NO-GO, B19 residual aberto", () => {
    const m = JSON.parse(read("MANIFEST.json").toString("utf8"));
    expect(m.executed).toBe(false);
    expect(m.rehearsal_go).toBe(false);
    expect(m.rehearsal_authorized).toBe(false);
    expect(m.gates).toBe("G1–G4 NO-GO");
    expect(BLOCKERS_V105.every((b) => !b.resolved)).toBe(true);
    expect(BLOCKERS_V105.map((b) => b.id)).toContain("B19");
  });
});
