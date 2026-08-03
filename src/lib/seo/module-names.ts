// Fonte única dos nomes visíveis dos módulos e dos títulos de página.
// Mudar aqui muda menu, planos, <title> e og:title em todos os ambientes.

export const APP_NAME = "Afonso";

export const MODULE_NAME = {
  hoje: "Hoje",
  pessoas: "Pessoas",
  imoveis: "Imóveis",
  negocios: "Negócios",
  agenda: "Agenda",
  drive: "Drive Inteligente",
  faturacao: "Faturação",
  diversos: "Diversos",
  prospecao: "Prospeção",
  definicoes: "Definições",
} as const;

export type ModuleKey = keyof typeof MODULE_NAME;

/** "Drive Inteligente" -> "Drive Inteligente — Afonso" */
export function pageTitle(name: string): string {
  return `${name} — ${APP_NAME}`;
}

/** Título de um módulo, opcionalmente com prefixo ("Ficheiro"). */
export function moduleTitle(key: ModuleKey, prefix?: string): string {
  const base = MODULE_NAME[key];
  return pageTitle(prefix ? `${prefix} — ${base}` : base);
}
