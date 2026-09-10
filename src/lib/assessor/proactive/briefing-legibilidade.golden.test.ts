// Golden tests da legibilidade do briefing (8/9/2026):
// espaçamento real entre secções, próximas ações sem repetir P1/P2,
// conflitos compactos com hora à frente, e o mesmo conteúdo a alimentar
// tanto o texto livre como os templates.

import { describe, it, expect } from "vitest";
import { composeEnrichedBriefing, nextActionsWithoutRepeats, type BriefingPriority } from "./briefing-enriched";
import { conflictCompact } from "@/lib/agenda/conflict-message";
import { flattenForTemplate } from "./meeting-briefing";
import { formatMorningTemplateList, morningTemplatePayload } from "./templates";

const NOW = new Date("2026-09-08T07:00:00.000Z"); // 08:00 Lisboa

function item(over: Partial<BriefingPriority>): BriefingPriority {
  return {
    subject_type: "follow_up",
    subject_id: "f1",
    action: "Ligar ao João",
    entity_label: null,
    priority_score: 60,
    ...over,
  };
}

const pair = {
  a: {
    id: "e1",
    title: "METHOD ALIGN",
    startMs: Date.parse("2026-09-08T11:00:00.000Z"),
    endMs: Date.parse("2026-09-08T12:00:00.000Z"),
  },
  b: {
    id: "e2",
    title: "ZI Update Mensal",
    startMs: Date.parse("2026-09-08T11:00:00.000Z"),
    endMs: Date.parse("2026-09-08T11:30:00.000Z"),
  },
  overlapStartMs: Date.parse("2026-09-08T11:00:00.000Z"),
  overlapEndMs: Date.parse("2026-09-08T11:30:00.000Z"),
  pairKey: "e1|e2",
} as any;

const priorities = [
  item({ subject_id: "a", action: "Preparar o compromisso das 12:00: METHOD ALIGN", priority_score: 92 }),
  item({ subject_id: "b", action: "Ligar à Maria Santos", priority_score: 70 }),
  item({ subject_id: "c", action: "Enviar a proposta ao Rui", priority_score: 20 }),
];

describe("briefing menos denso", () => {
  const text = composeEnrichedBriefing(priorities, {
    firstName: "Júlio",
    now: NOW,
    conflicts: [pair],
  });

  it("G1 — secções separadas por linha em branco", () => {
    expect(text).toContain("O que interessa hoje:\n\n🔴 P1");
    expect(text).toContain("\n\n⚠️ Conflitos a resolver");
    expect(text).toContain("\n\nPróximas ações");
    expect(text).not.toMatch(/•[^\n]*\n🟠/); // nunca um bullet colado à secção seguinte
  });

  it("G2 — próximas ações não repetem o que já está em P1/P2", () => {
    expect(text).toContain("Próximas ações\n1. Enviar a proposta ao Rui");
    expect(text).not.toContain("1. Preparar o compromisso das 12:00: METHOD ALIGN");
    expect(nextActionsWithoutRepeats(priorities, [priorities[0]!, priorities[1]!])).toEqual([
      "Enviar a proposta ao Rui",
    ]);
    // Repetição pura: a secção desaparece em vez de repetir.
    const so2 = composeEnrichedBriefing([priorities[0]!, priorities[1]!], { now: NOW });
    expect(so2).not.toContain("Próximas ações");
  });

  it("G3 — conflito compacto com o dia e a hora em destaque", () => {
    expect(conflictCompact(pair, NOW)).toBe("Hoje, 12:00 — METHOD ALIGN vs ZI Update Mensal");
    expect(text).toContain("• Hoje, 12:00 — METHOD ALIGN vs ZI Update Mensal");
    expect(text).not.toContain("sobrepõem-se");
    expect(text).not.toContain("“METHOD ALIGN”");
  });

  it("G4 — o mesmo conteúdo alimenta o caminho de template", () => {
    const corpo = text.replace(/^Bom dia[^\n]*\n+/, "");
    const template = flattenForTemplate(corpo);
    expect(template).not.toContain("\n");
    expect(template).toContain("Hoje, 12:00 — METHOD ALIGN vs ZI Update Mensal");
    expect(template).toContain("Enviar a proposta ao Rui");
    // Sem repetição também no template.
    expect(template.match(/Enviar a proposta ao Rui/g)).toHaveLength(1);
  });

  it("G5 — template matinal separa compromissos e conflitos", () => {
    const screenshotFormat = [
      "• Preparar o compromisso das 10:15: Reunião A",
      "• Preparar o compromisso das 13:00: Reunião B",
      "Conflitos a resolver",
      "• Hoje, 10:30 — Reunião A vs Reunião C",
    ].join("\n");
    const list = formatMorningTemplateList(screenshotFormat);
    expect(list).toBe(
      "• Preparar o compromisso das 10:15: Reunião A\n\n" +
      "• Preparar o compromisso das 13:00: Reunião B\n\n" +
      "Conflitos a resolver\n" +
      "• Hoje, 10:30 — Reunião A vs Reunião C",
    );
    const payload = morningTemplatePayload("Julio", list) as any;
    expect(payload.template.components[0].parameters[1].text).toBe(list);
  });

  it("G6 — o briefing enriquecido mantém o espaçamento já validado", () => {
    expect(text).toContain("O que interessa hoje:\n\n🔴 P1");
    expect(text).toContain("\n\n⚠️ Conflitos a resolver");
    expect(text).toContain("Próximas ações\n1. Enviar a proposta ao Rui");
  });
});
