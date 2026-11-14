// Monta o pacote v1.0.1 em staging-install/package/v1.0.1/ (só ficheiros).
// Não liga a nenhuma base, não executa SQL, não lê segredos.
// Uso: bun scripts/staging/build-staging-package-v101.ts
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { buildManifest, buildSha256Sums, generateDerivedFiles, PACKAGE_DIR } from "../../src/lib/staging/v101/package";
import { SOURCE_DUMP, V100_SQL } from "../../src/lib/staging/v101/rules";

export function readInputs(root = process.cwd()) {
  return {
    dump: readFileSync(join(root, SOURCE_DUMP.path), "utf8"),
    v100: V100_SQL.map((s) => ({ name: s.name, sql: readFileSync(join(root, "staging-install/migrations", s.name), "utf8") })),
  };
}

export const walk = (d: string): string[] =>
  readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));

if ((import.meta as any).main) {
  const root = process.cwd();
  const pkg = join(root, PACKAGE_DIR);
  const { files, out } = generateDerivedFiles(readInputs(root));
  for (const f of files) { mkdirSync(dirname(join(pkg, f.path)), { recursive: true }); writeFileSync(join(pkg, f.path), f.content); }
  const load = () => walk(pkg).map((p) => ({ path: relative(pkg, p).split("\\").join("/"), content: readFileSync(p) })).filter((f) => !f.path.includes("__pycache__"));
  writeFileSync(join(pkg, "MANIFEST.json"), buildManifest(out, load()));
  writeFileSync(join(pkg, "SHA256SUMS"), buildSha256Sums(load()));
  console.log(`OK: ${files.length} ficheiros derivados, ${load().length} ficheiros no pacote.`);
}
