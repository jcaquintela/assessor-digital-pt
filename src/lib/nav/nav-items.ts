// Fonte única das áreas de navegação do consultor.
//
// v1: 10 áreas na barra lateral.
// v2 (flag `assessor.design.v2`): 5 áreas de uso diário/semanal na barra
// principal — Hoje, Pessoas, Imóveis, Negócios, Agenda — e tudo o resto sob
// "Mais". A decisão é por frequência de uso, não por estética: nenhuma das
// áreas movidas é ponto de partida de sessão, todas são destino de uma ação
// iniciada noutro sítio (alerta em Hoje, upload no canal, notificação).
import { MODULE_NAME } from "@/lib/seo/module-names";
import { isModuleVisible } from "@/lib/subscription/tiers";
import {
  Building2,
  CalendarDays,
  CreditCard,
  FolderOpen,
  Handshake,
  Home,
  Inbox,
  MapPin,
  MessagesSquare,
  Mail,
  MoreHorizontal,
  Repeat,
  Settings,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import type { ComponentType } from "react";

export type NavEntry = { to: string; label: string; icon: ComponentType<any> };

/** Barra lateral do desenho actual (v1). */
export const NAV_DESKTOP_V1: NavEntry[] = [
  { to: "/hoje", label: "Hoje", icon: Home },
  { to: "/pessoas", label: "Pessoas", icon: Users },
  { to: "/imoveis", label: "Imóveis", icon: Building2 },
  { to: "/negocios", label: "Negócios", icon: Handshake },
  { to: "/oportunidades/prospecao", label: "Prospeção", icon: MapPin },
  { to: "/calendario", label: "Agenda", icon: CalendarDays },
  { to: "/drive", label: MODULE_NAME.drive, icon: FolderOpen },
  { to: "/negocio", label: "Faturação", icon: Wallet },
  { to: "/diversos", label: "Diversos", icon: Inbox },
  { to: "/definicoes", label: "Definições", icon: Settings },
];

/** Barra principal do redesenho (v2): só o que se usa todos os dias. */
export const NAV_PRIMARY_V2: NavEntry[] = [
  { to: "/hoje", label: "Hoje", icon: Home },
  { to: "/pessoas", label: "Pessoas", icon: Users },
  { to: "/imoveis", label: "Imóveis", icon: Building2 },
  { to: "/negocios", label: "Negócios", icon: Handshake },
  { to: "/calendario", label: "Agenda", icon: CalendarDays },
];

export const NAV_MORE_ENTRY: NavEntry = { to: "/mais", label: "Mais", icon: MoreHorizontal };

/** O que passa para "Mais" no v2 (e o que a página /mais lista). */
export const NAV_MORE_V2: NavEntry[] = [
  { to: "/oportunidades/prospecao", label: "Prospeção", icon: MapPin },
  { to: "/rotinas", label: "Rotinas", icon: Repeat },
  { to: "/interacoes", label: "Interações", icon: MessagesSquare },
  { to: "/comunicacao", label: "Comunicação", icon: Mail },
  { to: "/drive", label: MODULE_NAME.drive, icon: FolderOpen },

  { to: "/negocio", label: "Faturação", icon: Wallet },
  { to: "/diversos", label: "Diversos", icon: Inbox },
  { to: "/definicoes", label: "Definições", icon: Settings },
  { to: "/subscricao", label: "Subscrição", icon: CreditCard },
  { to: "/sobre-a-ia", label: "Sobre a IA", icon: Sparkles },
];

/** Página /mais completa: o que sai da barra + as áreas secundárias de sempre. */
export const NAV_MAIS_PAGE: NavEntry[] = [
  { to: "/pessoas", label: "Pessoas", icon: Users },
  { to: "/negocios", label: "Negócios", icon: Handshake },
  { to: "/imoveis", label: "Imóveis", icon: Building2 },
  { to: "/oportunidades/prospecao", label: "Prospeção", icon: MapPin },
  { to: "/calendario", label: "Calendário", icon: CalendarDays },
  { to: "/rotinas", label: "Rotinas", icon: Repeat },
  { to: "/interacoes", label: "Interações", icon: MessagesSquare },
  { to: "/comunicacao", label: "Comunicação", icon: Mail },
  { to: "/drive", label: MODULE_NAME.drive, icon: FolderOpen },
  { to: "/diversos", label: "Diversos", icon: Inbox },
  { to: "/negocio", label: "Faturação", icon: Wallet },
  { to: "/subscricao", label: "Subscrição", icon: CreditCard },
  { to: "/definicoes", label: "Definições", icon: Settings },
  { to: "/sobre-a-ia", label: "Sobre a IA", icon: Sparkles },
];

/**
 * Filtro por plano. A lista dentro de "Mais" tem de passar exactamente pelo
 * mesmo `isModuleVisible` que a barra lateral — senão consolidar a sidebar
 * passaria a expor módulos bloqueados.
 */
export function visibleNav<T extends { to: string }>(
  items: readonly T[],
  tier: string | null | undefined,
): T[] {
  return items.filter((i) => isModuleVisible(i.to, tier));
}
