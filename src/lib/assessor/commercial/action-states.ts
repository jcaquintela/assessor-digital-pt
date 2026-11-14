// Estados de ação explícitos — o consultor sabe sempre o que foi FEITO, o que
// está só PREPARADO, o que espera o "sim" dele e onde o Afonso não chega.
//
// Regra dura: "Executado" só com o resultado de uma ferramenta que correu
// neste turno. Divulgar, publicar, enviar, alterar anúncios ou gastar
// dinheiro nunca aparece como executado — no máximo "aguarda aprovação".

export type ActionState = "executed" | "prepared" | "awaiting_approval" | "no_access";

export interface ActionItem {
  state: ActionState;
  text: string;
  /** Obrigatório para "executed": nome da ferramenta que confirmou. */
  evidenceTool?: string;
}

export const STATE_LABEL: Record<ActionState, string> = {
  executed: "Executado",
  prepared: "Preparado",
  awaiting_approval: "Aguarda aprovação",
  no_access: "Sem acesso",
};

const ORDER: ActionState[] = ["executed", "prepared", "awaiting_approval", "no_access"];

/** Um item "executado" sem ferramenta por trás é despromovido a "preparado". */
export function normalizeItems(items: ActionItem[]): ActionItem[] {
  return items.map((i) => (i.state === "executed" && !i.evidenceTool ? { ...i, state: "prepared" as const } : i));
}

export function formatActionStates(items: ActionItem[]): string {
  const norm = normalizeItems(items);
  const lines: string[] = ["*Estado das ações*"];
  for (const s of ORDER) {
    const list = norm.filter((i) => i.state === s).map((i) => i.text);
    if (list.length) lines.push(`*${STATE_LABEL[s]}:* ${list.join("; ")}.`);
  }
  return lines.join("\n");
}
