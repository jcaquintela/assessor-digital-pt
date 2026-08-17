// Análise proativa de Pessoas (plano Pro). Parte pura.
//
// Reaproveita a régua factual comum (`src/lib/insights/factual.ts`) e a
// definição única de contacto real (`src/lib/insights/last-contact.ts`).
// Nunca prevê nada: só conta o que está na base.

import {
  emptyFactualFacts,
  factualInsight,
  stalledFacts,
  type FactualInsight,
  type StalledItem,
} from "@/lib/insights/factual";

/** Régua das pessoas: mais de 30 dias sem contacto real. */
export const PESSOAS_MIN_DIAS = 30;
/** Abaixo disto não vale a pena analisar — dizemos porquê, não ficamos calados. */
export const PESSOAS_MIN_REGISTOS = 5;

export type PeopleExtras = {
  /** Pessoas sem papel nem relação preenchidos. */
  semCategoria: number;
  /** Pessoas sem telefone e sem email. */
  semContacto: number;
};

function frasesExtra(e: PeopleExtras): string[] {
  const out: string[] = [];
  if (e.semCategoria > 0) {
    out.push(
      e.semCategoria === 1
        ? "1 pessoa está sem categoria"
        : `${e.semCategoria} pessoas estão sem categoria`,
    );
  }
  if (e.semContacto > 0) {
    out.push(
      e.semContacto === 1
        ? "1 pessoa não tem telefone nem email"
        : `${e.semContacto} pessoas não têm telefone nem email`,
    );
  }
  return out;
}

/**
 * Compõe a análise. Devolve `null` quando não há nada de concreto a dizer.
 */
export function peopleInsight(items: StalledItem[], extras: PeopleExtras): FactualInsight | null {
  const facts = stalledFacts(items, PESSOAS_MIN_DIAS);
  const base = factualInsight(facts, {
    key: "pessoas-sem-contacto",
    noun: ["pessoa", "pessoas"],
    movimento: "última interação registada ou seguimento fechado com a pessoa",
    linkLabel: "Ver pessoas →",
    to: "/pessoas",
  });
  const extra = frasesExtra(extras);
  const cauda = extra.length ? ` Além disso, ${extra.join(" e ")}.` : "";

  if (base) return { ...base, text: `${base.text}${cauda}` };
  if (!extra.length) return null;

  const texto = `${extra.join(" e ")}.`;
  return {
    key: "pessoas-ficha-incompleta",
    text: `${texto.charAt(0).toUpperCase()}${texto.slice(1)} Queres tratar disso agora?`,
    linkLabel: "Ver pessoas →",
    to: "/pessoas",
    reason: `contagem directa das tuas fichas: categoria, telefone e email. Régua de contacto: ${PESSOAS_MIN_DIAS} dias, sem previsões.`,
    facts: { ...emptyFactualFacts(PESSOAS_MIN_DIAS), total: items.length },
  };
}

/**
 * Estado vazio explícito: nunca deixamos o cartão desaparecer sem explicação.
 */
export function peopleEmptyHint(total: number): string {
  if (total === 0) {
    return `Sem registos: ainda não tens pessoas guardadas, por isso não há nada para analisar. A régua é de ${PESSOAS_MIN_DIAS} dias sem contacto real.`;
  }
  if (total < PESSOAS_MIN_REGISTOS) {
    return `Poucos registos: só tens ${total} ${total === 1 ? "pessoa" : "pessoas"} e a análise só ganha sentido a partir de ${PESSOAS_MIN_REGISTOS}. A régua é de ${PESSOAS_MIN_DIAS} dias sem contacto real.`;
  }
  return `Nada a assinalar: ninguém passou a régua de ${PESSOAS_MIN_DIAS} dias sem contacto real e as fichas têm categoria e contacto.`;
}
