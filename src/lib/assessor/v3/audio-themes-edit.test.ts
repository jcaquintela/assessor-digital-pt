import { describe, it, expect } from "vitest";
import { coerceThemes, emptyLinks, parseThemeEdit, applyThemeEdit, describeThemeEdit, formatThemesRevised } from "@/lib/assessor/v3/audio-themes";

const base = coerceThemes({ themes: [
  { kind: "lead", title: "Carlos vende T3 Canidelo", person: { name: "Carlos", phone: null, role: "proprietario" },
    property: { typology: "T3", location: "Canidelo", price: null }, opportunity: { intent: "vender", urgency: "alta", motivation: "vai emigrar" }, confidence: 0.9 },
  { kind: "task", title: "Ligar à Dra. Maria", person: { name: "Dra. Maria" }, next_action: { type: "ligar", text: "Ligar à Dra. Maria", date: "2026-08-12" }, confidence: 0.8 },
]});
const links = () => [{ ...emptyLinks(), person_id: "p1", person_label: "Carlos Silva", property_id: "im1", property_label: "T3 Canidelo" }, emptyLinks()];
const T = "2026-08-10";

describe("edição por tema antes de gravar", () => {
  it("corrige o valor", () => {
    const e = parseThemeEdit("no 1 o valor são 250 mil", 2, T)!;
    expect(e.price).toBe(250000);
    expect(applyThemeEdit(base, links(), e).themes[0].property?.price).toBe(250000);
    expect(describeThemeEdit(e)).toContain("valor: 250 000 €");
    expect(describeThemeEdit(e)).toContain("Ainda não gravei nada");
  });
  it("corrige o nome e desliga o contacto adivinhado", () => {
    const e = parseThemeEdit("no 1 o nome é Carlos Moreira", 2, T)!;
    expect(e.personName).toBe("Carlos Moreira");
    const r = applyThemeEdit(base, links(), e);
    expect(r.themes[0].person?.name).toBe("Carlos Moreira");
    expect(r.links[0].person_id).toBeNull();
  });
  it("corrige o telefone", () => {
    const e = parseThemeEdit("no 1 o telefone é 912 345 678", 2, T)!;
    expect(e.personPhone).toBe("912345678");
    expect(applyThemeEdit(base, links(), e).themes[0].person?.phone).toBe("912345678");
  });
  it("corrige a data à portuguesa", () => {
    const e = parseThemeEdit("o 2 é dia 14/09", 2, T)!;
    expect(e.date).toBe("2026-09-14");
    expect(applyThemeEdit(base, links(), e).themes[1].next_action?.date).toBe("2026-09-14");
    const e2 = parseThemeEdit("o 2 é 3 de setembro", 2, T)!;
    expect(e2.date).toBe("2026-09-03");
  });
  it("tira a data", () => {
    const e = parseThemeEdit("o 2 fica sem data", 2, T)!;
    expect(e.clearDate).toBe(true);
    expect(applyThemeEdit(base, links(), e).themes[1].next_action?.date).toBeNull();
  });
  it("corrige intenção e urgência", () => {
    const e = parseThemeEdit("o 1 é para arrendar e não é urgente", 2, T)!;
    expect(e.intent).toBe("arrendar");
    expect(e.urgency).toBe("baixa");
    const r = applyThemeEdit(base, links(), e);
    expect(r.themes[0].opportunity?.intent).toBe("arrendar");
    expect(r.themes[0].opportunity?.urgency).toBe("baixa");
  });
  it("mostra o valor no resumo revisto", () => {
    const e = parseThemeEdit("no 1 o valor são 250 mil", 2, T)!;
    const r = applyThemeEdit(base, links(), e);
    const txt = formatThemesRevised(r.themes, r.links, describeThemeEdit(e));
    expect(txt).toContain("250 000 €");
    expect(txt).toContain("Guardo?");
  });
  it("não confunde conversa normal com edição", () => {
    expect(parseThemeEdit("obrigado", 2, T)).toBeNull();
    expect(parseThemeEdit("o 1 está certo", 2, T)).toBeNull();
  });
});
