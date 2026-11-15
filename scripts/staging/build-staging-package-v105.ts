// Monta o pacote v1.0.5 em staging-install/package/v1.0.5/ (só ficheiros).
// Não liga a nenhuma base, não executa SQL, não corre nenhum script do ensaio, não lê segredos.
// Uso: bun scripts/staging/build-staging-package-v105.ts
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { buildDiffV105, buildManifestV105, buildSha256SumsV105, generateDerivedFilesV105, PACKAGE_DIR_V105 } from "../../src/lib/staging/v105/package";
import { V105_CHANGED_HANDWRITTEN, V105_GENERATED, V105_NEW, V105_PREVIOUS_DIR, V105_RETIRED } from "../../src/lib/staging/v105/rules";
import { readInputs, walk } from "./build-staging-package-v101";

/** Ficheiros da v1.0.4 copiados sem alteração (tudo o que não é derivado, alterado, novo, retirado ou gerado). */
export function copiedFromPreviousV105(root: string, derived: string[]): string[] {
  const prev = join(root, V105_PREVIOUS_DIR);
  const skip = new Set<string>([...derived, ...V105_CHANGED_HANDWRITTEN, ...V105_NEW, ...V105_RETIRED, ...V105_GENERATED]);
  return walk(prev).map((p) => relative(prev, p).split("\\").join("/")).filter((p) => !skip.has(p)).sort();
}

if ((import.meta as any).main) {
  const root = process.cwd();
  const pkg = join(root, PACKAGE_DIR_V105);
  const prev = join(root, V105_PREVIOUS_DIR);
  const { files } = generateDerivedFilesV105(readInputs(root));
  for (const f of files) { mkdirSync(dirname(join(pkg, f.path)), { recursive: true }); writeFileSync(join(pkg, f.path), f.content); }
  for (const p of copiedFromPreviousV105(root, files.map((f) => f.path))) { mkdirSync(dirname(join(pkg, p)), { recursive: true }); copyFileSync(join(prev, p), join(pkg, p)); }
  for (const p of V105_RETIRED) rmSync(join(pkg, p), { force: true });
  const load = () => walk(pkg).map((p) => ({ path: relative(pkg, p).split("\\").join("/"), content: readFileSync(p) })).filter((f) => f.path !== "MANIFEST.json" && f.path !== "SHA256SUMS");
  writeFileSync(join(pkg, "DIFF-v1.0.4.md"), buildDiffV105(readFileSync(join(prev, "SHA256SUMS"), "utf8"), load()));
  writeFileSync(join(pkg, "MANIFEST.json"), buildManifestV105(load()));
  const all = walk(pkg).map((p) => ({ path: relative(pkg, p).split("\\").join("/"), content: readFileSync(p) }));
  writeFileSync(join(pkg, "SHA256SUMS"), buildSha256SumsV105(all));
  console.log(`OK: ${files.length} ficheiros derivados, ${all.length} ficheiros no pacote.`);
}
