import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Verificação estática: nenhum componente de navegação (menu lateral, menu
 * "Mais", atalhos, links) pode mostrar "Documentos" ou "Drive" isolados.
 * O nome do módulo é sempre "Drive Inteligente" (fonte única MODULE_NAME.drive).
 * "Documentos" continua permitido como cabeçalho de secção dentro de fichas.
 */

const PROIBIDOS = new Set(["Documentos", "Drive"]);
const RAIZ = join(process.cwd(), "src");

function ficheiros(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return ficheiros(caminho);
    if (!/\.tsx?$/.test(nome) || /\.test\.tsx?$/.test(nome)) return [];
    return [caminho];
  });
}

/** Rótulos usados em navegação: `label: "..."`, `title: "..."` em itens com `to:`/`href:`, e texto de <Link>. */
function rotulosDeNavegacao(codigo: string): string[] {
  const rotulos: string[] = [];

  // Itens de navegação declarativos: objetos com `to:`/`href:` e um rótulo.
  const itemRe = /\{[^{}]*\b(?:to|href)\s*:\s*["'`][^"'`]*["'`][^{}]*\}/g;
  for (const [item] of codigo.matchAll(itemRe)) {
    for (const [, valor] of item.matchAll(/\b(?:label|title|name)\s*:\s*["'`]([^"'`]+)["'`]/g)) {
      rotulos.push(valor.trim());
    }
  }

  // Links JSX com texto literal: <Link to="/x">Texto</Link>, <a href="...">Texto</a>
  const linkRe = /<(?:Link|a)\b[^>]*\b(?:to|href)=[^>]*>([^<>{}]+)<\/(?:Link|a)>/g;
  for (const [, texto] of codigo.matchAll(linkRe)) rotulos.push(texto.trim());

  return rotulos.filter(Boolean);
}

describe("nomes visíveis na navegação", () => {
  const alvos = ficheiros(RAIZ);

  it("encontra ficheiros para varrer", () => {
    expect(alvos.length).toBeGreaterThan(20);
  });

  it('não usa "Documentos" nem "Drive" isolados em menus, links ou atalhos', () => {
    const falhas: string[] = [];
    for (const caminho of alvos) {
      const codigo = readFileSync(caminho, "utf8");
      for (const rotulo of rotulosDeNavegacao(codigo)) {
        if (PROIBIDOS.has(rotulo)) {
          falhas.push(`${caminho.replace(process.cwd() + "/", "")}: "${rotulo}"`);
        }
      }
    }
    expect(falhas, `Usa MODULE_NAME.drive ("Drive Inteligente"):\n${falhas.join("\n")}`).toEqual([]);
  });

  it('permite "Documentos" como cabeçalho de secção', () => {
    const exemplo = `<h2 className="text-sm">Documentos</h2>\n<CardTitle>Documentos</CardTitle>`;
    expect(rotulosDeNavegacao(exemplo)).toEqual([]);
  });

  it("deteta um item de menu proibido", () => {
    const mau = `const items = [{ to: "/documentos", label: "Documentos", icon: X }];`;
    expect(rotulosDeNavegacao(mau)).toContain("Documentos");
  });
});
