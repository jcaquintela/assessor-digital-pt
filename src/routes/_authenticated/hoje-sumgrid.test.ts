import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const hojeSrc = readFileSync(resolve("src/routes/_authenticated/hoje.tsx"), "utf8");
const routeTreeSrc = readFileSync(resolve("src/routeTree.gen.ts"), "utf8");

/** Caminhos navegáveis reais (interface FileRoutesByTo do route tree gerado). */
function navigableRoutes(): Set<string> {
  const block = routeTreeSrc.split("interface FileRoutesByTo")[1] ?? "";
  const body = block.slice(0, block.indexOf("\n}"));
  const out = new Set<string>();
  for (const m of body.matchAll(/^\s*'([^']+)':/gm)) out.add(m[1]);
  return out;
}

/** Extrai cada <SumCard ... /> da grelha de resumo. */
function sumCards(): Array<{ raw: string; to: string; tone: string; label: string }> {
  return [...hojeSrc.matchAll(/<SumCard\b([\s\S]*?)\/>/g)].map((m) => {
    const raw = m[1];
    const pick = (name: string) => raw.match(new RegExp(`${name}=(?:"([^"]*)"|\\{\`?([^}\`]*)\`?\\})`))?.slice(1).find(Boolean) ?? "";
    return { raw, to: pick("to"), tone: pick("tone"), label: pick("label") };
  });
}

describe("grelha de resumo de /hoje", () => {
  const cards = sumCards();
  const routes = navigableRoutes();

  it("tem os 6 cartões da grelha", () => {
    expect(cards).toHaveLength(6);
  });

  it("cada cartão tem destino, tom e etiqueta", () => {
    for (const c of cards) {
      expect(c.to, `cartão sem destino: ${c.raw}`).toMatch(/^\//);
      expect(c.tone).not.toBe("");
      expect(c.label).not.toBe("");
    }
  });

  it("cada destino existe no route tree e não precisa de parâmetros", () => {
    for (const c of cards) {
      expect(c.to.includes("$"), `${c.to} exige parâmetros dinâmicos`).toBe(false);
      expect(routes.has(c.to), `${c.to} não existe nas rotas navegáveis`).toBe(true);
    }
  });

  it("cobre as 6 rubricas esperadas, sem destinos repetidos", () => {
    const tos = cards.map((c) => c.to);
    expect(new Set(tos).size).toBe(tos.length);
    expect(tos.sort()).toEqual(
      ["/calendario", "/diversos", "/imoveis", "/negocio", "/negocios", "/pessoas"],
    );
  });

  it("o cartão é renderizado como <Link> acessível (aria-label)", () => {
    const comp = hojeSrc.slice(hojeSrc.indexOf("function SumCard"));
    expect(comp).toMatch(/<Link\s+to=\{to[\s\S]*?aria-label=\{label\}/);
  });
});
