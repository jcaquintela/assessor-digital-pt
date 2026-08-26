// Golden cruzado: os dois classificadores de compromissos leem a MESMA fonte
// (`shared-terms.ts`) e nunca podem divergir.
//
//   - event-class.ts        → binário 'negocio' vs 'interno' ("Como correu?")
//   - event-category.ts     → taxonomia da Agenda Inteligente
//
// Bug reproduzido aqui: "Entrevista de recrutamento" ligada a uma pessoa
// classificava-se como Operação & Liderança na Agenda mas disparava
// "Como correu?" e entrava em "Aguardam resultado".
import { describe, expect, it } from "vitest";
import { classifyEvent, needsOutcomeFollowUp, isInternalTitle } from "@/lib/assessor/event-class";
import { eventCategoryFor } from "./event-category";
import {
  ADMIN_TERMS,
  BIRTHDAY_TERMS,
  INTERNAL_CATEGORY_KEYS,
  INTERNAL_TITLE_TERMS,
  OPERATION_TERMS,
  PERSONAL_TERMS,
  TRAINING_TERMS,
  VISIT_TERMS,
} from "./shared-terms";

/** Contexto comercial máximo: se ainda assim é interno, é por causa do título. */
const comLigacao = (title: string) => ({ title, person_id: "p1" });

describe("1. caso real — Entrevista de recrutamento ligada a pessoa", () => {
  const ev = comLigacao("Entrevista de recrutamento");

  it("Agenda diz Operação & Liderança", () => {
    expect(eventCategoryFor(ev)).toBe("operacao");
  });

  it("não dispara 'Como correu?' nem entra em Aguardam resultado", () => {
    expect(classifyEvent(ev)).toBe("interno");
    expect(needsOutcomeFollowUp(ev)).toBe(false);
  });
});

describe("2. termos antes divergentes → mesmo veredicto nos dois sistemas", () => {
  const divergentes = [
    "closing", "ops", "kick off", "pipeline", "forecast", "recrutamento", "entrevista",
  ];
  for (const termo of divergentes) {
    it(`"${termo}"`, () => {
      const ev = comLigacao(`Reunião ${termo} de agosto`);
      expect(eventCategoryFor(ev)).toBe("operacao");
      expect(classifyEvent(ev)).toBe("interno");
      expect(isInternalTitle(ev.title)).toBe(true);
    });
  }
});

describe("3. teste cruzado automático sobre toda a lista partilhada", () => {
  const internos: [string, readonly string[]][] = [
    ["operacao", OPERATION_TERMS],
    ["formacao", TRAINING_TERMS],
    ["pessoal", PERSONAL_TERMS],
    ["suporte", ADMIN_TERMS],
    ["aniversarios", BIRTHDAY_TERMS],
  ];

  it("todos os termos internos: categoria não comercial E classe 'interno'", () => {
    const divergencias: string[] = [];
    for (const [, termos] of internos) {
      for (const termo of termos) {
        const ev = comLigacao(`Reunião ${termo} de agosto`);
        const categoria = eventCategoryFor(ev);
        const classe = classifyEvent(ev);
        const coerente = INTERNAL_CATEGORY_KEYS.includes(categoria) && classe === "interno";
        if (!coerente) divergencias.push(`${termo} → ${categoria} / ${classe}`);
      }
    }
    expect(divergencias).toEqual([]);
  });

  it("todos os termos de visita: categoria 'visitas' E classe 'negocio' com ligação", () => {
    const divergencias: string[] = [];
    for (const termo of VISIT_TERMS) {
      const ev = comLigacao(`Reunião ${termo} de agosto`);
      const categoria = eventCategoryFor(ev);
      const classe = classifyEvent(ev);
      if (categoria !== "visitas" || classe !== "negocio") {
        divergencias.push(`${termo} → ${categoria} / ${classe}`);
      }
    }
    expect(divergencias).toEqual([]);
  });

  it("nunca há termo interno que a Agenda leia como comercial", () => {
    const maus = INTERNAL_TITLE_TERMS.filter(
      (termo) => eventCategoryFor({ title: `Reunião ${termo} de agosto` }) === "visitas",
    );
    expect(maus).toEqual([]);
  });
});
