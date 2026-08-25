// Memória de escrita — módulo puro (sem I/O).
//
// Depois de um create_* bem sucedido, a conversa tem de saber O QUE acabou de
// nascer. Sem isto, "muda o telefone dela" obriga o motor a adivinhar um id
// (caso Ana Catarina Santos, 25/08 — update_person com id inventado).

export type CreatedResourceType =
  | "person"
  | "property"
  | "deal"
  | "follow_up"
  | "event"
  | "prospecting_lead"
  | "interaction"
  | "miscellaneous"
  | "financial_movement"
  | "routine";

const CREATE_MAP: Record<string, { type: CreatedResourceType; path: string[] }> = {
  create_person: { type: "person", path: ["person", "id"] },
  create_property: { type: "property", path: ["property", "id"] },
  create_deal: { type: "deal", path: ["deal", "id"] },
  create_follow_up: { type: "follow_up", path: ["follow_up", "id"] },
  create_event: { type: "event", path: ["event", "id"] },
  create_prospecting_lead: { type: "prospecting_lead", path: ["lead", "id"] },
  save_interaction: { type: "interaction", path: ["interaction", "id"] },
  save_miscellaneous: { type: "miscellaneous", path: ["item", "id"] },
  create_financial_movement: { type: "financial_movement", path: ["movement", "id"] },
  create_routine: { type: "routine", path: ["routine", "id"] },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

function pick(data: unknown, path: string[]): unknown {
  let cur: any = data;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return null;
    cur = cur[key];
  }
  return cur;
}

/** Extrai {tipo, id} de uma ferramenta de criação bem sucedida. */
export function createdResourceFrom(
  tool: string,
  data: unknown,
): { type: CreatedResourceType; id: string } | null {
  const spec = CREATE_MAP[tool];
  if (!spec) return null;
  const direct = pick(data, spec.path);
  if (isUuid(direct)) return { type: spec.type, id: direct.trim() };
  // Algumas ferramentas devolvem { id } no primeiro nível.
  const flat = pick(data, ["id"]);
  if (isUuid(flat)) return { type: spec.type, id: flat.trim() };
  return null;
}

export const CREATE_TOOLS = Object.keys(CREATE_MAP);
