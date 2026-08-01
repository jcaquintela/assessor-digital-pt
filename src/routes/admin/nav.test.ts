import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { navGroups, EXPECTED_GROUPS, OFF_MENU_PAGES } from "./nav";

const DIR = join(process.cwd(), "src/routes/admin");

function routeFiles() {
  return readdirSync(DIR).filter(
    (f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx") && f !== "route.tsx",
  );
}

/** Caminho declarado no createFileRoute de cada ficheiro. */
function declaredPaths() {
  const out: Record<string, string> = {};
  for (const f of routeFiles()) {
    const src = readFileSync(join(DIR, f), "utf8");
    const m = src.match(/createFileRoute\(\s*["'`]([^"'`]+)["'`]\s*\)/);
    if (m) out[f] = m[1];
  }
  return out;
}

const navPaths = navGroups.flatMap((g) => g.items.map((i) => i.to));

describe("navegação do admin", () => {
  it("tem os 6 grupos, pela ordem definida", () => {
    expect(navGroups.map((g) => g.group)).toEqual(EXPECTED_GROUPS);
  });

  it("nenhum grupo está vazio", () => {
    for (const g of navGroups) expect(g.items.length, g.group).toBeGreaterThan(0);
  });

  it("não há links nem etiquetas duplicados", () => {
    expect(new Set(navPaths).size).toBe(navPaths.length);
    const labels = navGroups.flatMap((g) => g.items.map((i) => i.label));
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("cada link aponta para uma página admin que existe", () => {
    const paths = new Set(Object.values(declaredPaths()));
    for (const to of navPaths) {
      const target = to === "/admin" ? "/admin/" : to;
      expect(paths.has(target) || paths.has(to), `sem página para ${to}`).toBe(true);
    }
  });

  it("nenhuma página fica acessível só por URL sem justificação", () => {
    const inNav = new Set(navPaths.map((p) => (p === "/admin" ? "/admin/" : p)));
    const orphans: string[] = [];
    for (const [file, path] of Object.entries(declaredPaths())) {
      if (inNav.has(path)) continue;
      if (OFF_MENU_PAGES[path]) continue;
      orphans.push(`${file} (${path})`);
    }
    expect(orphans, "páginas invisíveis no menu e sem motivo registado").toEqual([]);
  });
});