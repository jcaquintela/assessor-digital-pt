// Fonte única de URLs por registo.
//
// Existiam links construídos à mão em vários sítios (briefings, cartões,
// mensagens). Quando uma rota muda, só este ficheiro tem de mudar.

export type EntityKind =
  | "follow_up"
  | "person"
  | "people"
  | "deal"
  | "opportunity"
  | "deal_deadline"
  | "property"
  | "prospecting_lead";

const PATHS: Record<EntityKind, string> = {
  follow_up: "/seguimentos",
  person: "/pessoas",
  people: "/pessoas",
  deal: "/oportunidades",
  opportunity: "/oportunidades",
  deal_deadline: "/oportunidades",
  property: "/imoveis",
  prospecting_lead: "/oportunidades/prospecao",
};

function normalizeBase(base?: string | null): string {
  const b = String(base ?? "").trim();
  if (!b) return "";
  return b.replace(/\/+$/, "");
}

/**
 * URL de um registo. Sem `base` devolve caminho relativo (uso no painel);
 * com `base` devolve URL absoluto (uso em WhatsApp/Telegram/email).
 */
export function entityUrl(
  type: string | null | undefined,
  id: string | null | undefined,
  opts: { base?: string | null } = {},
): string | null {
  const key = String(type ?? "").trim() as EntityKind;
  const path = PATHS[key];
  const rid = String(id ?? "").trim();
  if (!path || !rid) return null;
  return `${normalizeBase(opts.base)}${path}/${encodeURIComponent(rid)}`;
}
