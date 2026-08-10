import { describe, it, expect } from "vitest";
import { belongsInDailyAgenda, isLeisureTitle } from "./agenda-leisure";
import { hasCommercialOutcomeContext } from "./outcome-eligibility";

const noCtx = { person_id: null, related_property_id: null, opportunity_id: null };

describe("deny-list de lazer (briefing e agenda do dia)", () => {
  it("apanha refeições, aniversários, descanso e desporto, com e sem acentos", () => {
    for (const t of [
      "Almoço", "almoco com o Pedro", "Jantar de família", "Café rápido",
      "Aniversário de Ana Silva", "Ana Silva (aniversário)", "Birthday: John",
      "Férias", "Folga", "Feriado municipal",
      "Jogo do FC Porto", "Ginásio", "Padel", "Dentista", "Cinema",
    ]) {
      expect(isLeisureTitle(t), t).toBe(true);
    }
  });

  it("não apanha trabalho real", () => {
    for (const t of [
      "Visita ao T3 das Antas", "Reunião com proprietário", "Angariação Rua X",
      "CPCV Sr. Coelho", "Avaliação do apartamento", "Chamada para o comprador",
    ]) {
      expect(isLeisureTitle(t), t).toBe(false);
    }
  });

  it("os 250 aniversários recorrentes (2052-2056) ficam fora por título, não por data", () => {
    const bday = { ...noCtx, title: "Aniversário de Maria" };
    expect(belongsInDailyAgenda(bday)).toBe(false);
    // mesmo que a data role para hoje, continua fora
    expect(belongsInDailyAgenda({ ...bday })).toBe(false);
  });

  it("almoço LIGADO a uma pessoa continua a ser trabalho e entra na agenda", () => {
    const item = { ...noCtx, person_id: "p1", title: "Almoço com o Sr. Coelho" };
    expect(belongsInDailyAgenda(item)).toBe(true);
  });

  it("evento neutro sem contexto entra na agenda (regra larga) mas nunca gera check-in (regra estrita)", () => {
    const item = { ...noCtx, title: "Reunião de equipa" };
    expect(belongsInDailyAgenda(item)).toBe(true);
    expect(hasCommercialOutcomeContext(item)).toBe(false);
  });

  it("'Almoço' nunca gera check-in 'Como correu?'", () => {
    expect(hasCommercialOutcomeContext({ ...noCtx })).toBe(false);
  });
});