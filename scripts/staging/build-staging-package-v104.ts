// Monta o pacote v1.0.4 em staging-install/package/v1.0.4/ (só ficheiros).
// Não liga a nenhuma base, não executa SQL, não corre nenhum script do ensaio, não lê segredos.
// Uso: bun scripts/staging/build-staging-package-v104.ts
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { buildDiffV104, buildManifestV104, buildSha256SumsV104, generateDerivedFilesV104, PACKAGE_DIR_V104 } from "../../src/lib/staging/v104/package";
import { V104_COPIED_HANDWRITTEN, V104_PREVIOUS, V104_PREVIOUS_DIR } from "../../src/lib/staging/v104/rules";
import { readInputs, walk } from "./build-staging-package-v101";

if ((import.meta as any).main) {
  const root = process.cwd();
  const pkg = join(root, PACKAGE_DIR_V104);
  const prev = join(root, V104_PREVIOUS_DIR);
  const { files, out, queries, prevQueries, r30, r31, r32 } = generateDerivedFilesV104(readInputs(root));
  for (const f of files) { mkdirSync(dirname(join(pkg, f.path)), { recursive: true }); writeFileSync(join(pkg, f.path), f.content); }
  for (const p of V104_COPIED_HANDWRITTEN) { mkdirSync(dirname(join(pkg, p)), { recursive: true }); copyFileSync(join(prev, p), join(pkg, p)); }
  const load = () => walk(pkg).map((p) => ({ path: relative(pkg, p).split("\\").join("/"), content: readFileSync(p) })).filter((f) => f.path !== "MANIFEST.json" && f.path !== "SHA256SUMS");
  writeFileSync(join(pkg, `DIFF-v${V104_PREVIOUS.version}.md`), buildDiffV104(readFileSync(join(prev, "SHA256SUMS"), "utf8"), load(), prevQueries, queries));
  writeFileSync(join(pkg, "MANIFEST.json"), buildManifestV104(out, queries, [r30, r31, r32], load()));
  const all = walk(pkg).map((p) => ({ path: relative(pkg, p).split("\\").join("/"), content: readFileSync(p) }));
  writeFileSync(join(pkg, "SHA256SUMS"), buildSha256SumsV104(all));
  console.log(`OK: ${files.length} ficheiros derivados, ${all.length} ficheiros no pacote.`);
}
