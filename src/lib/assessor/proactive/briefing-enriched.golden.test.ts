// Golden tests do briefing matinal enriquecido.
import { describe, it, expect } from "vitest";
import {
  bucketOf,
  bucketPriorities,
  composeEnrichedBriefing,
  nextThreeActions,
  priorityUrl,
  tightGapsFromAgenda,
  BRIEFING_MAX_CHARS,
  TRUNCATION_NOTE,
  type BriefingPriority,
} from "./briefing-enriched";
import { entityUrl } from "@/lib/nav/entity-url";
import { findConflicts, findTightGaps } from "@/lib/agenda/conflicts";
import { tightGapMessage } from "@/lib/agenda/conflict-message";
import { flattenForTemplate } from "./meeting-briefing";

const NOW = new Date("2026-08-31T08:00:00.000Z"); // 09:00 Lisboa

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

describe("1. bucketing P1/P2/P3", () => {
  it("usa o score e mantém o evento de hoje sempre em P1", () => {
    const alto = item({ subject_id: "a", priority_score: 88 });
    const medio = item({ subject_id: "b", priority_score: 60 });
    const baixo = item({ subject_id: "c", priority_score: 20 });
    const eventoFraco = item({
      subject_id: "d",
      priority_score: 10,
      event_start_at: "2026-08-31T13:00:00.000Z",
    });
    expect(bucketOf(alto, NOW)).toBe("P1");
    expect(bucketOf(medio, NOW)).toBe("P2");
    expect(bucketOf(baixo, NOW)).toBe("P3");
    expect(bucketOf(eventoFraco, NOW)).toBe("P1");

    const b = bucketPriorities([alto, medio, baixo, eventoFraco], NOW);
    expect(b.p1.map((i) => i.subject_id)).toEqual(["a", "d"]);
    expect(b.p2.map((i) => i.subject_id)).toEqual(["b"]);
    expect(b.p3.map((i) => i.subject_id)).toEqual(["c"]);
  });
});

describe("2. intervalo apertado", () => {
  const rows = [
    { id: "e1", title: "Visita Belém", due_date: "2026-08-31", due_time: "10:00", duration_minutes: 60 },
    { id: "e2", title: "Reunião Alvalade", due_date: "2026-08-31", due_time: "11:05", duration_minutes: 30 },
  ];

  it("deteta a folga curta sem a transformar em conflito", () => {
    const gaps = findTightGaps(rows as any);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.gapMinutes).toBe(5);
    // Não é sobreposição: o caminho dos nudges de conflito não vê nada.
    expect(findConflicts(rows as any)).toHaveLength(0);
  });

  it("aparece no briefing como aviso informativo", () => {
    const gaps = findTightGaps(rows as any);
    const text = composeEnrichedBriefing([item({ priority_score: 90 })], {
      firstName: "Júlio",
      now: NOW,
      tightGaps: gaps,
    });
    expect(text).toContain(tightGapMessage(gaps[0]!));
    expect(text).toContain("Atenção:");
  });

  it("tightGapsFromAgenda reutiliza a agenda do dia já carregada", () => {
    const gaps = tightGapsFromAgenda(
      [
        { id: "e1", title: "A", startIso: "2026-08-31T09:00:00.000Z", endIso: "2026-08-31T10:00:00.000Z", isWork: true },
        { id: "e2", title: "B", startIso: "2026-08-31T10:10:00.000Z", endIso: "2026-08-31T11:00:00.000Z", isWork: true },
      ],
      NOW,
    );
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.gapMinutes).toBe(10);
  });
});

describe("3. próximas 3 ações", () => {
  it("são os 3 primeiros por prioridade, com o texto original", () => {
    const items = [
      item({ subject_id: "a", action: "Preparar o compromisso das 10:00: Visita", priority_score: 90 }),
      item({ subject_id: "b", action: "Ligar à Maria", priority_score: 70 }),
      item({ subject_id: "c", action: "Definir próxima ação com Rui", priority_score: 60 }),
      item({ subject_id: "d", action: "Enviar documentos", priority_score: 30 }),
    ];
    expect(nextThreeActions(items)).toEqual([
      "Preparar o compromisso das 10:00: Visita",
      "Ligar à Maria",
      "Definir próxima ação com Rui",
    ]);
    const text = composeEnrichedBriefing(items, { now: NOW });
    expect(text).toContain("1) Preparar o compromisso das 10:00: Visita");
    expect(text).toContain("3) Definir próxima ação com Rui");
  });
});

describe("4. links por registo", () => {
  it("gera URLs corretos para seguimento, pessoa e negócio", () => {
    expect(entityUrl("follow_up", "f1")).toBe("/seguimentos/f1");
    expect(entityUrl("person", "p1")).toBe("/pessoas/p1");
    expect(entityUrl("opportunity", "d1", { base: "https://app.meuafonso.com/" })).toBe(
      "https://app.meuafonso.com/oportunidades/d1",
    );
    expect(entityUrl("follow_up", "")).toBeNull();
    expect(entityUrl("desconhecido", "x")).toBeNull();
    // Prazo de negócio aponta para o negócio, não para o prazo.
    expect(priorityUrl(item({ subject_type: "deal_deadline", subject_id: "dd1", deal_id: "d9" }))).toBe(
      "/oportunidades/d9",
    );
    const text = composeEnrichedBriefing([item({ subject_id: "f7", priority_score: 90 })], {
      now: NOW,
      base: "https://app.meuafonso.com",
    });
    expect(text).toContain("https://app.meuafonso.com/seguimentos/f7");
  });
});

describe("5. limites de leitura", () => {
  const many = Array.from({ length: 12 }, (_, i) =>
    item({
      subject_id: `x${i}`,
      action: `Ação número ${i} com um título bastante longo para ocupar espaço no canal`,
      priority_score: i < 6 ? 90 : i < 9 ? 60 : 20,
    }),
  );

  it("mostra no máximo 3 P1 e 2 P2, o resto só como contagem", () => {
    const text = composeEnrichedBriefing(many, { firstName: "Júlio", now: NOW });
    const linhas = text.split("\n").filter((l) => l.startsWith("•"));
    expect(linhas).toHaveLength(5);
    expect(text).toContain("Mais 7 no painel");
    expect(text.length).toBeLessThanOrEqual(BRIEFING_MAX_CHARS);
  });

  it("nunca ultrapassa o limite de caracteres", () => {
    const gordo = Array.from({ length: 6 }, (_, i) =>
      item({ subject_id: `y${i}`, action: "A".repeat(300), priority_score: 95 }),
    );
    const text = composeEnrichedBriefing(gordo, { now: NOW, maxChars: 1200 });
    expect(text.length).toBeLessThanOrEqual(1200);
    expect(text).toContain("resto no painel");
  });
});

describe("6. dentro vs. fora da janela de 24h", () => {
  const items = [
    item({ subject_id: "a", action: "Preparar o compromisso das 10:00: Visita", priority_score: 92 }),
    item({ subject_id: "b", action: "Ligar à Maria", priority_score: 60 }),
    item({ subject_id: "c", action: "Enviar contrato", priority_score: 30 }),
  ];

  it("texto livre tem quebras de linha; template vai numa linha e corta com aviso", () => {
    const livre = composeEnrichedBriefing(items, { firstName: "Júlio", now: NOW });
    expect(livre).toContain("\n");
    expect(livre).toContain("🔴 P1");

    const corpo = livre.replace(/^Bom dia[^\n]*\n?/, "");
    const template = flattenForTemplate(corpo);
    expect(template).not.toContain("\n");
    expect(template).toContain("Ligar à Maria");

    const curto = flattenForTemplate(corpo, 60);
    expect(curto.length).toBeLessThanOrEqual(60 + TRUNCATION_NOTE.length);
    expect(curto).toContain("resto no painel");
  });
});
