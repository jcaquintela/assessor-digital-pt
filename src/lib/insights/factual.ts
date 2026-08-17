// ANÁLISE FACTUAL POR MÓDULO — exclusiva do plano Pro.
//
// Mesma disciplina do Mentor Nível 2 (`src/lib/assessor/supreme/mentor-context.ts`):
// módulo puro, nunca lê da BD, nunca prevê. Só afirma o que é verificável no
// histórico — contagens e tempos parados — e termina em convite, nunca em
// juízo. Sem caso real, cala-se.

import { tierAtLeast } from "@/lib/subscription/tiers";

/** Um registo já reduzido ao mínimo: rótulo e dias parado. */
export type StalledItem = { id: string; label: string; days: number };

export interface FactualFacts {
  /** Registos considerados (universo desta leitura). */
  total: number;
  /** Quantos passaram a régua de dias sem movimento. */
  parados: number;
  /** Dias do mais parado de todos. */
  dias: number;
  /** Régua usada, para o consultor poder confirmar de onde vem o número. */
  minDias: number;
  /** O caso mais parado, para dar um exemplo concreto. */
  exemplo: StalledItem | null;
}

export function emptyFactualFacts(minDias: number): FactualFacts {
  return { total: 0, parados: 0, dias: 0, minDias, exemplo: null };
}

/** Apura os factos a partir de registos já datados. Determinístico. */
export function stalledFacts(items: StalledItem[], minDias: number): FactualFacts {
  const parados = items.filter((i) => i.days >= minDias).sort((a, b) => b.days - a.days);
  return {
    total: items.length,
    parados: parados.length,
    dias: parados.length ? parados[0].days : 0,
    minDias,
    exemplo: parados[0] ?? null,
  };
}

export interface FactualInsight {
  key: string;
  text: string;
  linkLabel: string;
  to: string;
  /** "De onde vem isto?" — a régua, em português simples. */
  reason: string;
  facts: FactualFacts;
}

export type InsightConfig = {
  key: string;
  /** ["imóvel", "imóveis"] */
  noun: [string, string];
  /** O que conta como movimento, para a linha "de onde vem isto". */
  movimento: string;
  linkLabel: string;
  to: string;
};

function plural(n: number, [um, muitos]: [string, string]): string {
  return n === 1 ? `1 ${um}` : `${n} ${muitos}`;
}

/**
 * Compõe a frase factual. Devolve `null` quando não há nada de concreto —
 * preferimos silêncio a encher o ecrã.
 */
export function factualInsight(f: FactualFacts, cfg: InsightConfig): FactualInsight | null {
  if (f.parados <= 0) return null;
  const alvo = `${plural(f.parados, cfg.noun)} sem movimento há mais de ${f.minDias} dias`;
  const exemplo = f.exemplo ? ` O mais parado é "${f.exemplo.label}", há ${f.exemplo.days} dias.` : "";
  const convite =
    f.parados === 1
      ? " Queres retomar este?"
      : ` Queres começar por ${f.exemplo ? "este" : "um deles"}?`;
  return {
    key: cfg.key,
    text: `${alvo.charAt(0).toUpperCase()}${alvo.slice(1)}, de ${f.total} no total.${exemplo}${convite}`,
    linkLabel: cfg.linkLabel,
    to: cfg.to,
    reason: `contagem directa dos teus registos: ${cfg.movimento}. Régua de ${f.minDias} dias, sem previsões.`,
    facts: f,
  };
}

/**
 * Gate Pro. Mesmo `effective_tier()` de todo o produto — a análise proativa
 * só aparece a partir do plano Pro; abaixo disso devolve `null` em silêncio,
 * sem teaser nem ruído.
 */
export function applyProInsight(
  insight: FactualInsight | null,
  tier: string | null | undefined,
): FactualInsight | null {
  return tierAtLeast(tier, "pro") ? insight : null;
}