// Monta o pacote v1.0.2 em staging-install/package/v1.0.2/ (só ficheiros).
// Não liga a nenhuma base, não executa SQL, não lê segredos.
// Uso: bun scripts/staging/build-staging-package-v102.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { buildManifestV102, buildSha256SumsV102, generateDerivedFilesV102, PACKAGE_DIR_V102 } from "../../src/lib/staging/v102/package";
import { readInputs, walk } from "./build-staging-package-v101";

if ((import.meta as any).main) {
  const root = process.cwd();
  const pkg = join(root, PACKAGE_DIR_V102);
  const { files, out, queries } = generateDerivedFilesV102(readInputs(root));
  for (const f of files) { mkdirSync(dirname(join(pkg, f.path)), { recursive: true }); writeFileSync(join(pkg, f.path), f.content); }
  const load = () => walk(pkg).map((p) => ({ path: relative(pkg, p).split("\\").join("/"), content: readFileSync(p) }));
  writeFileSync(join(pkg, "MANIFEST.json"), buildManifestV102(out, queries, load()));
  writeFileSync(join(pkg, "SHA256SUMS"), buildSha256SumsV102(load()));
  console.log(`OK: ${files.length} ficheiros derivados, ${load().length} ficheiros no pacote.`);
}
