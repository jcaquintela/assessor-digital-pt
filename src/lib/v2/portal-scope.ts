// AFONSO 2.0 — portal web mínimo (decisões 16, 39, 46).
//
// O Afonso não é um CRM: na V2 o portal web serve só conta, subscrição,
// canais, integrações, privacidade e exportação. Tudo o resto (pessoas,
// imóveis, negócios, oportunidades, agenda, chat web…) vive na conversa.
// Interruptor por conta `v2.minimal_portal.v1` (pilot-gated). Desligado ou
// sem resposta = portal V1 de hoje, sem mudanças.

export const V2_MINIMAL_PORTAL_FLAG = "v2.minimal_portal.v1";
export const V2_SELF_EXPORT_FLAG = "v2.self_export.v1";

export const V2_POSITIONING = "O teu copiloto de produtividade imobiliária";

export type PortalMode = "v1" | "v2_minimal";

/** Página inicial do portal V2. */
export const V2_PORTAL_HOME = "/conta";

/** Únicas áreas web do consultor na V2. Prefixos exatos (sem subpáginas comerciais). */
export const V2_PORTAL_PATHS: readonly string[] = [
  "/conta",
  "/subscricao",
  "/ligar-canal",
  "/definicoes", // integrações (calendário/email) e preferências da conversa
  "/privacidade",
  "/sobre-a-ia", // transparência sobre a IA
];

function normalize(path: string): string {
  const p = path.split("?")[0].split("#")[0];
  return p.length > 1 ? p.replace(/\/+$/, "") : p;
}

export function isV2PortalPathAllowed(path: string): boolean {
  const p = normalize(path);
  return V2_PORTAL_PATHS.some((a) => p === a || p.startsWith(`${a}/`));
}

/** Para onde redirecionar (ou null = deixar passar). V1 nunca redireciona. */
export function portalRedirectFor(path: string, mode: PortalMode): string | null {
  if (mode !== "v2_minimal") return null;
  return isV2PortalPathAllowed(path) ? null : V2_PORTAL_HOME;
}
