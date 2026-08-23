/** Nomes legíveis das superfícies de CTA do painel Hoje. */
const SURFACE_LABELS: Record<string, string> = {
  cabecalho: "Cabeçalho",
  barra: "Barra permanente",
  fab: "Botão flutuante (mobile)",
  menu_prioridade: "Menu de uma prioridade",
};

export function surfaceLabel(key: string): string {
  return SURFACE_LABELS[key] ?? key;
}
