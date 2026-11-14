// Monta o pacote v1.0.3 em staging-install/package/v1.0.3/ (só ficheiros).
// Não liga a nenhuma base, não executa SQL, não corre nenhum script do ensaio, não lê segredos.
// Uso: bun scripts/staging/build-staging-package-v103.ts
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { buildDiffV103, buildManifestV103, buildSha256SumsV103, generateDerivedFilesV103, PACKAGE_DIR_V103 } from "../../src/lib/staging/v103/package";
import { V103_COPIED_HANDWRITTEN, V103_PREVIOUS, V103_PREVIOUS_DIR } from "../../src/lib/staging/v103/rules";
import { readInputs, walk } from "./build-staging-package-v101";

if ((import.meta as any).main) {
  const root = process.cwd();
  const pkg = join(root, PACKAGE_DIR_V103);
  const prev = join(root, V103_PREVIOUS_DIR);
  const { files, out, queries, prevQueries, r30 } = generateDerivedFilesV103(readInputs(root));
  for (const f of files) { mkdirSync(dirname(join(pkg, f.path)), { recursive: true }); writeFileSync(join(pkg, f.path), f.content); }
  for (const p of V103_COPIED_HANDWRITTEN) { mkdirSync(dirname(join(pkg, p)), { recursive: true }); copyFileSync(join(prev, p), join(pkg, p)); }
  const load = () => walk(pkg).map((p) => ({ path: relative(pkg, p).split("\\").join("/"), content: readFileSync(p) }));
  writeFileSync(join(pkg, `DIFF-v${V103_PREVIOUS.version}.md`), buildDiffV103(readFileSync(join(prev, "SHA256SUMS"), "utf8"), load(), prevQueries, queries));
  writeFileSync(join(pkg, "MANIFEST.json"), buildManifestV103(out, queries, r30, load()));
  writeFileSync(join(pkg, "SHA256SUMS"), buildSha256SumsV103(load()));
  console.log(`OK: ${files.length} ficheiros derivados, ${load().length} ficheiros no pacote.`);
}
