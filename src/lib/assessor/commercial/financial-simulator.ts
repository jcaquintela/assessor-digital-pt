// Simulador financeiro de compra (puro). São CONTAS, não uma decisão do banco.
//
// Regras e fontes (Continente, 2026):
// - Crédito à habitação própria: até 90% do MENOR entre preço e avaliação
//   (recomendação macroprudencial do Banco de Portugal). Garantia pública
//   para jovens até 35 anos pode permitir até 100% — depende do banco.
// - IMT: tabelas 2026 (HPP, secundária, IMT Jovem até 35 anos).
// - Imposto do Selo: 0,8% na aquisição (IMT Jovem: só sobre o excesso de
//   330 539 €) e 0,6% sobre o montante do crédito (prazo ≥ 5 anos).
// - Escritura/registo e custos bancários: ESTIMATIVAS, sempre mostradas.
// Pré-aprovação não é aprovação final: o banco decide após avaliação e
// análise final.

export const TAX_YEAR = 2026;
export const DEFAULT_LTV = 0.9;
export const YOUNG_GUARANTEE_LTV = 1.0;
export const IS_ACQUISITION = 0.008;
export const IS_CREDIT = 0.006;
export const DEED_REGISTRY_ESTIMATE = 1000;
export const BANK_FEES_ESTIMATE = 800;
export const YOUNG_EXEMPT_UP_TO = 330_539;

interface Bracket { upTo: number; rate: number; minus: number; single?: boolean }
const B = (upTo: number, rate: number, minus = 0, single = false): Bracket => ({ upTo, rate, minus, single });

export const IMT_HPP: Bracket[] = [
  B(106_346, 0), B(145_470, 0.02, 2126.92), B(198_347, 0.05, 6491.02), B(330_539, 0.07, 10457.96),
  B(660_982, 0.08, 13763.35), B(1_150_853, 0.06, 0, true), B(Infinity, 0.075, 0, true),
];
export const IMT_SECONDARY: Bracket[] = [
  B(106_346, 0.01), B(145_470, 0.02, 1063.46), B(198_347, 0.05, 5427.56), B(330_539, 0.07, 9394.5),
  B(633_931, 0.08, 12699.89), B(1_150_853, 0.06, 0, true), B(Infinity, 0.075, 0, true),
];
export const IMT_YOUNG: Bracket[] = [
  B(330_539, 0), B(660_982, 0.08, 26443.12), B(1_150_853, 0.06, 0, true), B(Infinity, 0.075, 0, true),
];

export type Use = "hpp" | "secondary";

export function imt(price: number, use: Use, young: boolean): number {
  const table = use === "secondary" ? IMT_SECONDARY : young ? IMT_YOUNG : IMT_HPP;
  const b = table.find((x) => price <= x.upTo)!;
  return Math.max(0, Math.round((price * b.rate - b.minus) * 100) / 100);
}

export function stampAcquisition(price: number, use: Use, young: boolean): number {
  if (use === "hpp" && young && price <= 660_982) return Math.round(Math.max(0, price - YOUNG_EXEMPT_UP_TO) * IS_ACQUISITION * 100) / 100;
  return Math.round(price * IS_ACQUISITION * 100) / 100;
}

export interface SimInput {
  price: number;
  /** Avaliação bancária, se já existe. */
  appraisal?: number | null;
  ownFunds: number;
  /** Teto do crédito pré-aprovado (não é aprovação final). */
  loanCap?: number | null;
  ltv?: number;
  /** null = assumido habitação própria e permanente (dito nos pressupostos). */
  use?: Use | null;
  /** null = desconhecido → regime normal (dito nos pressupostos). */
  young?: boolean | null;
}

export interface CostLine { label: string; value: number; estimate: boolean }

export interface SimResult {
  price: number;
  loanBasis: number;
  loan: number;
  ltv: number;
  entry: number;
  costs: CostLine[];
  costsTotal: number;
  totalNeeded: number;
  ownFunds: number;
  /** > 0 = falta dinheiro; ≤ 0 = sobra. */
  gap: number;
  assumptions: string[];
}

export function simulatePurchase(i: SimInput): SimResult {
  const use: Use = i.use ?? "hpp";
  const young = use === "hpp" && i.young === true;
  const ltv = i.ltv ?? DEFAULT_LTV;
  const loanBasis = Math.min(i.price, i.appraisal ?? i.price);
  const loan = Math.min(Math.round(loanBasis * ltv * 100) / 100, i.loanCap ?? Infinity);
  const entry = i.price - loan;
  const costs: CostLine[] = [
    { label: "IMT", value: imt(i.price, use, young), estimate: false },
    { label: "Selo da compra", value: stampAcquisition(i.price, use, young), estimate: false },
    { label: "Selo do crédito", value: Math.round(loan * IS_CREDIT * 100) / 100, estimate: false },
    { label: "escritura e registo", value: DEED_REGISTRY_ESTIMATE, estimate: true },
    { label: "custos do banco", value: BANK_FEES_ESTIMATE, estimate: true },
  ];
  const costsTotal = costs.reduce((a, c) => a + c.value, 0);
  const totalNeeded = entry + costsTotal;
  const assumptions = [
    `crédito até ${Math.round(ltv * 100)}% do menor entre preço e avaliação${ltv > DEFAULT_LTV ? " (garantia pública jovem — depende do banco)" : ""}`,
    i.loanCap != null ? `limitado à pré-aprovação de ${eur(i.loanCap)}` : null,
    i.use == null ? "habitação própria e permanente (assumido)" : null,
    young ? "IMT Jovem (até 35 anos)" : i.young == null && use === "hpp" ? "sem IMT Jovem (idade por confirmar)" : null,
    `escritura/registo ~${eur(DEED_REGISTRY_ESTIMATE)} e banco ~${eur(BANK_FEES_ESTIMATE)} (estimativas)`,
    `IMT e Selo ${TAX_YEAR}, Continente`,
  ].filter((x): x is string => !!x);
  return { price: i.price, loanBasis, loan, ltv, entry, costs, costsTotal, totalNeeded, ownFunds: i.ownFunds, gap: totalNeeded - i.ownFunds, assumptions };
}

/** Preço máximo (arredondado aos 1 000 € abaixo) que fecha com os capitais disponíveis. */
export function maxViablePrice(i: Omit<SimInput, "price">): number {
  let lo = 0;
  let hi = 3_000_000;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (simulatePurchase({ ...i, price: mid }).gap <= 0) lo = mid; else hi = mid;
  }
  return Math.floor(lo / 1000) * 1000;
}

export const eur = (n: number) => `${Math.round(n).toLocaleString("pt-PT")} €`;

export const NOT_BANK_DECISION =
  "São contas, não uma decisão do banco: pré-aprovação não é aprovação final — o banco decide depois da avaliação e da análise final.";

export function costsLine(s: SimResult): string {
  return s.costs.map((c) => `${c.label} ${c.estimate ? "~" : ""}${eur(c.value)}`).join(", ");
}

/** "A 385 000 €: crédito 328 500 € → entrada 56 500 € + encargos 22 xxx € = … ; tens … → faltam …". */
export function summaryLine(s: SimResult, label?: string): string {
  const head = label ?? `A ${eur(s.price)}`;
  const tail = s.gap > 0 ? `faltam ~${eur(s.gap)}` : `sobram ~${eur(-s.gap)}`;
  return `${head}: crédito máx. ${eur(s.loan)} → entrada ${eur(s.entry)} + encargos ~${eur(s.costsTotal)} = ${eur(s.totalNeeded)}; capitais ${eur(s.ownFunds)} → ${tail}.`;
}
