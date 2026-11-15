// Monta o pacote v1.0.7 em staging-install/package/v1.0.7/ (só ficheiros).
// Não liga a nenhuma base, não executa SQL, não corre nenhum script do ensaio, não lê segredos.
// Uso: bun scripts/staging/build-staging-package-v107.ts
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { buildDiffV107, buildManifestV107, buildSha256SumsV107, generateDerivedFilesV107, PACKAGE_DIR_V107 } from "../../src/lib/staging/v107/package";
import { V107_CHANGED_HANDWRITTEN, V107_GENERATED, V107_NEW, V107_PREVIOUS_DIR, V107_RETIRED } from "../../src/lib/staging/v107/rules";
import { readInputs, walk } from "./build-staging-package-v101";

/** Ficheiros da v1.0.6 copiados sem alteração (tudo o que não é derivado, alterado, novo, retirado ou gerado). */
export function copiedFromPreviousV107(root: string, derived: string[]): string[] {
  const prev = join(root, V107_PREVIOUS_DIR);
  const skip = new Set<string>([...derived, ...V107_CHANGED_HANDWRITTEN, ...V107_NEW, ...V107_RETIRED, ...V107_GENERATED]);
  return walk(prev).map((p) => relative(prev, p).split("\\").join("/")).filter((p) => !skip.has(p)).sort();
}

if ((import.meta as any).main) {
  const root = process.cwd();
  const pkg = join(root, PACKAGE_DIR_V107);
  const prev = join(root, V107_PREVIOUS_DIR);
  const { files } = generateDerivedFilesV107(readInputs(root));
  for (const f of files) { mkdirSync(dirname(join(pkg, f.path)), { recursive: true }); writeFileSync(join(pkg, f.path), f.content); }
  for (const p of copiedFromPreviousV107(root, files.map((f) => f.path))) { mkdirSync(dirname(join(pkg, p)), { recursive: true }); copyFileSync(join(prev, p), join(pkg, p)); }
  for (const p of V107_RETIRED) rmSync(join(pkg, p), { force: true });
  const load = () => walk(pkg).map((p) => ({ path: relative(pkg, p).split("\\").join("/"), content: readFileSync(p) })).filter((f) => f.path !== "MANIFEST.json" && f.path !== "SHA256SUMS");
  writeFileSync(join(pkg, "DIFF-v1.0.6.md"), buildDiffV107(readFileSync(join(prev, "SHA256SUMS"), "utf8"), load()));
  writeFileSync(join(pkg, "MANIFEST.json"), buildManifestV107(load()));
  const all = walk(pkg).map((p) => ({ path: relative(pkg, p).split("\\").join("/"), content: readFileSync(p) }));
  writeFileSync(join(pkg, "SHA256SUMS"), buildSha256SumsV107(all));
  console.log(`OK: ${files.length} ficheiros derivados, ${all.length} ficheiros no pacote.`);
}
