import { BRAND_NAME, appTitle } from "@/lib/brand";
// Fonte única dos nomes visíveis dos módulos e dos títulos de página.
// Mudar aqui muda menu, planos, <title> e og:title em todos os ambientes.

export const APP_NAME: string = BRAND_NAME;

/** Módulos do produto (enum fechada — não há nomes de módulo fora daqui). */
export const ModuleKey = {
  Hoje: "hoje",
  Pessoas: "pessoas",
  Imoveis: "imoveis",
  Negocios: "negocios",
  Agenda: "agenda",
  Drive: "drive",
  Faturacao: "faturacao",
  Diversos: "diversos",
  Prospecao: "prospecao",
  Definicoes: "definicoes",
} as const;

export type ModuleKey = (typeof ModuleKey)[keyof typeof ModuleKey];

/**
 * Nome visível do Drive, fixado ao nível do tipo. Qualquer tentativa de
 * escrever outra coisa em MODULE_NAME.drive falha na compilação.
 */
export const DRIVE_MODULE_NAME = "Drive Inteligente";
export type DriveModuleName = typeof DRIVE_MODULE_NAME;

/** Contrato: o módulo do Drive só pode chamar-se "Drive Inteligente". */
export type ModuleNames = Record<Exclude<ModuleKey, "drive">, string> & {
  readonly drive: DriveModuleName;
};

export const MODULE_NAME = {
  hoje: "Hoje",
  pessoas: "Pessoas",
  imoveis: "Imóveis",
  negocios: "Negócios",
  agenda: "Agenda",
  drive: DRIVE_MODULE_NAME,
  faturacao: "Faturação",
  diversos: "Diversos",
  prospecao: "Prospeção",
  definicoes: "Definições",
} as const satisfies ModuleNames;

/** "Drive Inteligente" -> appTitle("Drive Inteligente") */
export function pageTitle(name: string): string {
  return `${name} — ${APP_NAME}`;
}

/** Título de um módulo, opcionalmente com prefixo ("Ficheiro"). */
export function moduleTitle(key: ModuleKey, prefix?: string): string {
  const base = MODULE_NAME[key];
  return pageTitle(prefix ? `${prefix} — ${base}` : base);
}
