import { describe, it, expect } from "vitest";
import {
  coerceThemes,
  emptyLinks,
  formatThemesProposal,
  formatThemesDone,
  pendingAmbiguities,
  matchAmbiguityAnswer,
  parseThemeEdit,
  applyThemeEdit,
  isLeadTheme,
  type AudioTheme,
} from "./audio-themes";

const AUDIO_RAW = {
  themes: [
    {
      kind: "lead",
      title: "Carlos quer vender T3 em Canidelo",
      person: { name: "Carlos", phone: null, role: "proprietario" },
      property: { typology: "T3", location: "Canidelo", address: null, features: null, price: null },
      opportunity: { intent: "vender", motivation: "vai emigrar", urgency: "alta", deadline: null },
      next_action: null,
      note: null,
      confidential: false,
      confidence: 0.9,
    },
    {
      kind: "task",
      title: "Ligar à Dra. Maria",
      person: { name: "Dra. Maria", phone: null, role: null },
      property: null,
      opportunity: null,
      next_action: { type: "ligar", text: "Ligar à Dra. Maria", date: "2026-08-12", time: null },
      note: null,
      confidential: false,
      confidence: 0.8,
    },
  ],
};

describe("segmentação de temas", () => {
  it("teste 1 — separa lead de tarefa isolada", () => {
    const themes = coerceThemes(AUDIO_RAW);
    expect(themes).toHaveLength(2);
    expect(isLeadTheme(themes[0])).toBe(true);
    expect(isLeadTheme(themes[1])).toBe(false);
    expect(themes[1].next_action?.date).toBe("2026-08-12");
  });

  it("propõe os dois temas antes de gravar", () => {
    const themes = coerceThemes(AUDIO_RAW);
    const links = [emptyLinks(), emptyLinks()];
    const text = formatThemesProposal(themes, links);
    expect(text).toContain("Percebi 2 coisas:");
    expect(text).toContain("1️⃣");
    expect(text).toContain("2️⃣");
    expect(text).toContain("novo contacto");
    expect(text).toContain("Urgente (vai emigrar)");
    expect(text).toContain("Confirmas?");
  });

  it("teste 2 — mostra a ligação à placa já registada", () => {
    const themes = coerceThemes(AUDIO_RAW);
    const links = [
      { ...emptyLinks(), lead_id: "l1", lead_label: "Placa Canidelo", opportunity_id: "o1", opportunity_label: "Venda Canidelo" },
      emptyLinks(),
    ];
    const text = formatThemesProposal(themes, links);
    expect(text).toContain('ligado à placa "Placa Canidelo"');
  });

  it("teste 3 — contacto já existente aparece como conhecido", () => {
    const themes = coerceThemes(AUDIO_RAW);
    const links = [{ ...emptyLinks(), person_id: "p1", person_label: "Carlos Moreira" }, emptyLinks()];
    expect(formatThemesProposal(themes, links)).toContain("contacto que já tinhas");
  });

  it("teste 4 — descartar um tema mantém o outro", () => {
    const themes = coerceThemes(AUDIO_RAW);
    const links = [emptyLinks(), emptyLinks()];
    const edit = parseThemeEdit("descarta o 2", 2, "2026-08-10");
    expect(edit).toEqual({ index: 1, remove: true });
    const next = applyThemeEdit(themes, links, edit!);
    expect(next.themes).toHaveLength(1);
    expect(next.themes[0].title).toContain("Carlos");
  });

  it("teste 4 — corrigir a tipologia do tema 1 desliga o imóvel adivinhado", () => {
    const themes = coerceThemes(AUDIO_RAW);
    const links = [{ ...emptyLinks(), property_id: "x", property_label: "T3 Canidelo" }, emptyLinks()];
    const edit = parseThemeEdit("o 1 é T2", 2, "2026-08-10");
    expect(edit?.typology).toBe("T2");
    const next = applyThemeEdit(themes, links, edit!);
    expect(next.themes[0].property?.typology).toBe("T2");
    expect(next.links[0].property_id).toBeNull();
  });

  it("teste 5 — ambiguidade pergunta em vez de escolher", () => {
    const themes = coerceThemes(AUDIO_RAW);
    const links = [
      {
        ...emptyLinks(),
        ambiguous_people: [
          { id: "a", label: "Carlos Silva", score: 0.7 },
          { id: "b", label: "Carlos Moreira", score: 0.7 },
        ],
      },
      emptyLinks(),
    ];
    const amb = pendingAmbiguities(themes, links);
    expect(amb).toHaveLength(1);
    const text = formatThemesProposal(themes, links);
    expect(text).toContain("Qual deles é?");
    expect(matchAmbiguityAnswer("é o Carlos Moreira", amb[0].candidates)?.id).toBe("b");
    expect(matchAmbiguityAnswer("nenhum", amb[0].candidates)).toBeNull();
  });

  it("confirmação diz o quê + onde e não promete envios", () => {
    const done = formatThemesDone([
      { personName: "Carlos", personCreated: true, propertyTitle: "T3 em Canidelo", propertyCreated: true, opportunityTitle: "Venda T3 em Canidelo — Carlos", opportunityCreated: true },
      { followUpTitle: "Ligar à Dra. Maria" },
    ]);
    expect(done).toContain("Guardei o contacto Carlos");
    expect(done).toContain("ligados entre si");
    expect(done).toContain('Guardei o seguimento "Ligar à Dra. Maria" em Seguimentos, no dashboard.');
    expect(done).toContain("Não enviei nada a ninguém.");
    expect(done).not.toMatch(/enviei a|partilhei|equipa/i);
  });

  it("não inventa temas a partir de lixo", () => {
    expect(coerceThemes({ themes: [{ kind: "lead" }] })).toHaveLength(0);
    const t: AudioTheme[] = coerceThemes({ themes: [{ kind: "xpto", title: "olá" }] });
    expect(t[0].kind).toBe("note");
  });
});
