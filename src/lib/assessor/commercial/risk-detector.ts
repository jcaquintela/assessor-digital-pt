// Detetor de risco comercial (puro): prazos, avaliação, CPCV, desistência,
// baixa procura, financiamento. Cada risco diz se é CONFIRMADO (dito pelo
// consultor), CALCULADO (contas do simulador) ou ALEGADO (por verificar).

export type RiskKind =
  | "deadline" | "appraisal_gap" | "financing_gap" | "budget_reality" | "pre_approval"
  | "cpcv" | "withdrawal" | "alleged_offer" | "low_demand" | "price_discrepancy";
export type Severity = "alta" | "média" | "baixa";
export type Evidence = "confirmado" | "calculado" | "alegado";

export interface Risk { kind: RiskKind; severity: Severity; text: string; evidence: Evidence }

const ORDER: Record<Severity, number> = { alta: 0, "média": 1, baixa: 2 };

export function sortRisks(r: Risk[]): Risk[] {
  return [...r].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}

export function daysBetween(fromYmd: string, toYmd: string): number {
  return Math.round((Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / 86400_000);
}

export function deadlineRisk(label: string, ymd: string | null, todayYmd: string): Risk | null {
  if (!ymd) return null;
  const n = daysBetween(todayYmd, ymd);
  if (n < 0) return { kind: "deadline", severity: "alta", text: `${label} já passou (${ymd.slice(8, 10)}/${ymd.slice(5, 7)})`, evidence: "confirmado" };
  if (n <= 21) return { kind: "deadline", severity: n <= 7 ? "alta" : "média", text: `${label} em ${n} dias`, evidence: "confirmado" };
  return null;
}

export function formatRisks(risks: Risk[], max = 5): string | null {
  if (!risks.length) return null;
  return ["*Riscos detetados*", ...sortRisks(risks).slice(0, max).map((r) => `- [${r.severity}] ${r.text} (${r.evidence})`)].join("\n");
}
