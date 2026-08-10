export type NavItem = { to: string; label: string; exact?: boolean };
export type NavGroup = { group: string; items: NavItem[] };

/** Os 6 grupos da barra lateral do admin. Verificado por nav.test.ts. */
export const navGroups: NavGroup[] = [
  {
    group: "Visão geral",
    items: [
      { to: "/admin", label: "Visão geral", exact: true },
      { to: "/admin/negocio", label: "Negócio" },
    ],
  },
  {
    group: "Clientes",
    items: [
      { to: "/admin/utilizadores", label: "Utilizadores & planos" },
      { to: "/admin/beta", label: "Beta testers" },
      { to: "/admin/suporte", label: "Suporte" },
      { to: "/admin/convites", label: "Convites Telegram" },
      { to: "/admin/entradas", label: "Entradas no painel" },
    ],
  },
  {
    group: "Comercial",
    items: [
      { to: "/admin/planos", label: "Planos & preços" },
      { to: "/admin/aquisicao", label: "Aquisição" },
      { to: "/admin/subscricoes", label: "Subscrições" },
      { to: "/admin/faturacao", label: "Faturação" },
    ],
  },
  {
    group: "Operação",
    items: [
      { to: "/admin/custos", label: "Custos" },
      { to: "/admin/utilizacao", label: "Utilização" },
      { to: "/admin/comunicacao", label: "Comunicação" },
    ],
  },
  {
    group: "Qualidade",
    items: [
      { to: "/admin/qualidade", label: "Qualidade" },
      { to: "/admin/feedback", label: "Feedback dos consultores" },
      { to: "/admin/autonomas", label: "Ações autónomas" },
      { to: "/admin/goldens", label: "Goldens" },
      { to: "/admin/simulador-briefing", label: "Simulador do briefing" },
      { to: "/admin/agenda-debug", label: "Debug da agenda" },
    ],
  },
  {
    group: "Plataforma",
    items: [
      { to: "/admin/integracoes-flags", label: "Integrações & flags" },
      { to: "/admin/whatsapp-nome", label: "Nome do WhatsApp" },
      { to: "/admin/auditoria-seguranca", label: "Auditoria & segurança" },
    ],
  },
];

export const EXPECTED_GROUPS = [
  "Visão geral",
  "Clientes",
  "Comercial",
  "Operação",
  "Qualidade",
  "Plataforma",
];

/**
 * Páginas admin deliberadamente fora do menu, com o motivo.
 * Qualquer outra página nova tem de entrar num grupo — o teste falha se não entrar.
 */
export const OFF_MENU_PAGES: Record<string, string> = {
  "/admin/auditoria": "redirect para /admin/auditoria-seguranca",
  "/admin/seguranca": "redirect para /admin/auditoria-seguranca",
  "/admin/integracoes": "redirect para /admin/integracoes-flags",
  "/admin/funcionalidades": "redirect para /admin/integracoes-flags",
  "/admin/definicoes": "página vazia (em preparação), escondida até ter conteúdo",
  "/admin/consultor/$id": "ficha de um consultor, aberta a partir de Utilizadores & planos",
};