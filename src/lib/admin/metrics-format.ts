// Formato único das métricas do admin.
//
// Regra combinada no Ciclo Admin 2: o mesmo indicador nunca aparece em dois
// formatos diferentes. Um rácio 0–1 mostra-se sempre em percentagem; o ATS,
// que vive na escala 0–100, mostra-se sempre como "x,y/100". Decimal com
// vírgula, porque é PT-PT.

/** 0,668 → "66,8%" */
export function fmtPct(value: number | null | undefined, decimals = 1): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(decimals).replace(".", ",")}%`;
}

/** 85,776 → "85,8/100" */
export function fmtScore100(value: number | null | undefined, decimals = 1): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(decimals).replace(".", ",")}/100`;
}

/** 138 em 151 → "91,4%" */
export function fmtShare(part: number, total: number, decimals = 1): string {
  if (!total) return "—";
  return fmtPct(part / total, decimals);
}

/** Número simples com vírgula decimal. */
export function fmtNum(value: number | null | undefined, decimals = 1): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(decimals).replace(".", ",");
}
