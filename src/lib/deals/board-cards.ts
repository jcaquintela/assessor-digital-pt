// Cartões canónicos do quadro de Negócios. Puro, sem React nem BD.
// Regra de produto: os grupos canónicos aparecem SEMPRE, mesmo a zero, e um
// negócio concluído tem sempre cartão próprio — nunca fica escondido.

import { buildGroupCards, type GroupCard } from "@/lib/ui/group-cards";
import { STAGE_GROUPS, groupOfStage, type DealStage } from "./stages";

export const BOARD_COLUMNS: { key: string; label: string; stages: DealStage[] }[] = [
  ...STAGE_GROUPS.map((g) => ({ key: g.key, label: g.label, stages: g.stages as DealStage[] })),
  { key: "perdido", label: "Perdido", stages: ["perdido"] as DealStage[] },
];

/** Quadro + Concluído. */
export const CARD_COLUMNS: { key: string; label: string }[] = [
  ...BOARD_COLUMNS.map((c) => ({ key: c.key, label: c.label })),
  { key: "concluido", label: "Concluído" },
];

export function dealGroupCards<T extends { stage: string }>(visiveis: T[]): GroupCard<T>[] {
  const ativos = visiveis.filter((d) => d.stage !== "concluido" && d.stage !== "perdido");
  return buildGroupCards(
    CARD_COLUMNS.map((g) => ({
      key: g.key,
      label: g.label,
      items:
        g.key === "perdido" || g.key === "concluido"
          ? visiveis.filter((d) => d.stage === g.key)
          : ativos.filter((d) => groupOfStage(d.stage) === g.key),
    })),
  );
}
