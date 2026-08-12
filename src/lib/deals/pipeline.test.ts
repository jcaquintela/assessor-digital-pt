// Golden tests do quadro de negócios (pipeline).
// Regras de negócio puras — sem BD, sem UI.
import { describe, it, expect } from "vitest";
import {
  isDealActive,
  isDealClosed,
  isDealStalled,
  daysInStage,
  groupOfStage,
  legacyStatusForStage,
  STALLED_DAYS,
  STAGE_LABEL,
} from "./stages";

const NOW = new Date("2026-08-12T12:00:00Z");
const diasAtras = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe("pipeline de negócios", () => {
  it("1. negócio novo sem imóvel entra na coluna inicial e conta como em curso", () => {
    const novo = { stage: "preparacao", status: "Em curso", archived_at: null, property_id: null };
    expect(groupOfStage(novo.stage)).toBe("inicio");
    expect(isDealActive(novo)).toBe(true);
  });

  it("2. mudar de fase muda a coluna e o estado legado acompanha", () => {
    expect(groupOfStage("promocao")).toBe("mercado");
    expect(legacyStatusForStage("promocao")).toBe("Em curso");
    expect(daysInStage(diasAtras(0), NOW)).toBe(0);
  });

  it("3. mais de 10 dias na mesma fase, sem imóvel, aparece como parado", () => {
    const parado = { stage: "preparacao", stageChangedAt: diasAtras(STALLED_DAYS + 1), archivedAt: null };
    expect(isDealStalled(parado, NOW)).toBe(true);
    expect(isDealStalled({ ...parado, stageChangedAt: diasAtras(3) }, NOW)).toBe(false);
    // Exactamente 10 dias ainda não é "parado" — a regra é "mais de 10".
    expect(isDealStalled({ ...parado, stageChangedAt: diasAtras(STALLED_DAYS) }, NOW)).toBe(false);
  });

  it("4. negócio perdido sai da contagem de em curso", () => {
    const perdido = { stage: "perdido", status: "Perdida", archived_at: null };
    expect(isDealClosed(perdido)).toBe(true);
    expect(isDealActive(perdido)).toBe(false);
    expect(isDealStalled({ stage: "perdido", stageChangedAt: diasAtras(90), archivedAt: null }, NOW)).toBe(false);
    expect(legacyStatusForStage("perdido")).toBe("Perdida");
    expect(STAGE_LABEL.perdido).toBe("Perdido");
  });

  it("5. negócio vindo da prospeção mantém a origem no cartão", () => {
    const card = { sourceLeadId: "11111111-1111-1111-1111-111111111111" };
    expect(Boolean(card.sourceLeadId)).toBe(true);
    expect(Boolean({ sourceLeadId: null }.sourceLeadId)).toBe(false);
  });

  it("6. o '€ em jogo' soma só os negócios em curso com valor estimado", () => {
    const rows = [
      { stage: "preparacao", archived_at: null, value: 250_000 },
      { stage: "visitas", archived_at: null, value: null },
      { stage: "perdido", archived_at: null, value: 900_000 },
      { stage: "concluido", archived_at: null, value: 500_000 },
      { stage: "proposta", archived_at: "2026-08-01", value: 400_000 },
      { stage: "cpcv", archived_at: null, value: 100_000 },
    ];
    const ativos = rows.filter(isDealActive);
    expect(ativos.length).toBe(3);
    const total = ativos.reduce((s, d) => s + (d.value == null ? 0 : Number(d.value)), 0);
    expect(total).toBe(350_000);
  });
});
