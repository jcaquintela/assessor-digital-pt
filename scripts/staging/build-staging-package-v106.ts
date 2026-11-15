// Monta o pacote v1.0.6 em staging-install/package/v1.0.6/ (só ficheiros).
// Não liga a nenhuma base, não executa SQL, não corre nenhum script do ensaio, não lê segredos.
// Uso: bun scripts/staging/build-staging-package-v106.ts
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { buildDiffV106, buildManifestV106, buildSha256SumsV106, generateDerivedFilesV106, PACKAGE_DIR_V106 } from "../../src/lib/staging/v106/package";
import { V106_CHANGED_HANDWRITTEN, V106_GENERATED, V106_NEW, V106_PREVIOUS_DIR, V106_RETIRED } from "../../src/lib/staging/v106/rules";
import { readInputs, walk } from "./build-staging-package-v101";

/** Ficheiros da v1.0.5 copiados sem alteração (tudo o que não é derivado, alterado, novo, retirado ou gerado). */
export function copiedFromPreviousV106(root: string, derived: string[]): string[] {
  const prev = join(root, V106_PREVIOUS_DIR);
  const skip = new Set<string>([...derived, ...V106_CHANGED_HANDWRITTEN, ...V106_NEW, ...V106_RETIRED, ...V106_GENERATED]);
  return walk(prev).map((p) => relative(prev, p).split("\\").join("/")).filter((p) => !skip.has(p)).sort();
}

if ((import.meta as any).main) {
  const root = process.cwd();
  const pkg = join(root, PACKAGE_DIR_V106);
  const prev = join(root, V106_PREVIOUS_DIR);
  const { files } = generateDerivedFilesV106(readInputs(root));
  for (const f of files) { mkdirSync(dirname(join(pkg, f.path)), { recursive: true }); writeFileSync(join(pkg, f.path), f.content); }
  for (const p of copiedFromPreviousV106(root, files.map((f) => f.path))) { mkdirSync(dirname(join(pkg, p)), { recursive: true }); copyFileSync(join(prev, p), join(pkg, p)); }
  for (const p of V106_RETIRED) rmSync(join(pkg, p), { force: true });
  const load = () => walk(pkg).map((p) => ({ path: relative(pkg, p).split("\\").join("/"), content: readFileSync(p) })).filter((f) => f.path !== "MANIFEST.json" && f.path !== "SHA256SUMS");
  writeFileSync(join(pkg, "DIFF-v1.0.5.md"), buildDiffV106(readFileSync(join(prev, "SHA256SUMS"), "utf8"), load()));
  writeFileSync(join(pkg, "MANIFEST.json"), buildManifestV106(load()));
  const all = walk(pkg).map((p) => ({ path: relative(pkg, p).split("\\").join("/"), content: readFileSync(p) }));
  writeFileSync(join(pkg, "SHA256SUMS"), buildSha256SumsV106(all));
  console.log(`OK: ${files.length} ficheiros derivados, ${all.length} ficheiros no pacote.`);
}
