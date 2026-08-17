import { adminTitle, appTitle } from "@/lib/brand";
// Fonte única do nome do assistente/produto.
// Qualquer texto visível ao consultor que refira o produto deve derivar daqui
// (ou do nome personalizado do consultor, via `useAssessorName`).
// Nomes internos (ficheiros, tabelas, identificadores) não usam isto.

export const BRAND_NAME = "Afonso" as const;

/** Sufixo usado nos títulos do painel de administração. */
export const BRAND_ADMIN_SUFFIX = `${BRAND_NAME} admin`;

/** "Planos" -> appTitle("Planos") */
export function appTitle(page: string): string {
  return `${page} — ${BRAND_NAME}`;
}

/** "Custos" -> adminTitle("Custos") */
export function adminTitle(page: string): string {
  return `${page} — ${BRAND_ADMIN_SUFFIX}`;
}
