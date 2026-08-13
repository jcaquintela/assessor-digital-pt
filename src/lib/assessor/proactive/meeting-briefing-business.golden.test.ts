// Golden tests da cartela de briefing automática (só compromissos de negócio).
import { describe, expect, it } from "vitest";
import {
  formatEventContext,
  formatMeetingBriefing,
  hasAnyBriefingContent,
  isBriefingDue,
  isBriefingEligible,
  wasCreatedTooLate,
  type BriefingEvent,
} from "./meeting-briefing";

const NOW = new Date("2026-08-13T14:16:00Z").getTime();

const negocio: BriefingEvent = {
  id: "e1",
  title: "Visita T2 Conselhas",
  due_date: "2026-08-13T14:30:00Z",
  due_time: null,
  status: "Pendente",
  person_id: "p1",
  related_property_id: "im1",
  opportunity_id: "op1",
  event_class: null,
  created_at: "2026-08-12T09:00:00Z",
  briefing_sent_at: null,
};

const brief = {
  name: "Vasco",
  relationship: "comprador",
  phone: "351912345678",
  lastInteraction: { when: "2026-08-10T10:00:00Z", text: "Quer ver o T2 esta semana." },
  properties: [],
  deals: [],
  nextAction: null,
} as any;

const ctx = {
  property: { title: "T2 Conselhas", address: "Rua das Conselhas", typology: "T2", price: 280000 },
  deal: { label: "Venda T2", stage: "visitas" },
};

describe("cartela automática — só negócio", () => {
  it("1. evento de negócio daqui a 15 min → cartela com dados reais", () => {
    expect(isBriefingDue(negocio, NOW)).toBe(true);
    const text = formatMeetingBriefing(negocio, brief, NOW, ctx);
    expect(text).toContain("Visita T2 Conselhas");
    expect(text).toContain("Vasco");
    expect(text).toContain("T2 Conselhas");
    expect(text).toContain("280");
    expect(text).toContain("Negócio:");
    // Sem campos inventados.
    expect(text).not.toMatch(/undefined|null|NaN/);
  });

  it("2. reunião interna não gera cartela", () => {
    const interno: BriefingEvent = {
      ...negocio, id: "e2", title: "Reunião de equipa",
      person_id: null, related_property_id: null, opportunity_id: null, event_class: "interno",
    };
    expect(isBriefingEligible(interno)).toBe(false);
    expect(isBriefingDue(interno, NOW)).toBe(false);
  });

  it("3. evento sem qualquer associação não gera cartela", () => {
    const solto: BriefingEvent = {
      ...negocio, id: "e3", title: "Almoço",
      person_id: null, related_property_id: null, opportunity_id: null, event_class: null,
    };
    expect(isBriefingDue(solto, NOW)).toBe(false);
  });

  it("4. criado com menos de 15 min de antecedência não dispara", () => {
    const tardio: BriefingEvent = { ...negocio, id: "e4", created_at: "2026-08-13T14:20:00Z" };
    expect(wasCreatedTooLate(tardio)).toBe(true);
    expect(isBriefingDue(tardio, NOW)).toBe(false);
  });

  it("5. dois eventos de negócio seguidos não cruzam dados", () => {
    const segundo: BriefingEvent = {
      ...negocio, id: "e5", title: "Reunião Manuel", due_date: "2026-08-13T14:45:00Z",
    };
    const t1 = formatMeetingBriefing(negocio, brief, NOW, ctx);
    const t2 = formatMeetingBriefing(
      segundo,
      { ...brief, name: "Manuel", lastInteraction: null },
      new Date("2026-08-13T14:31:00Z").getTime(),
      { property: { title: "T3 Areeiro", typology: "T3", price: 350000 }, deal: null },
    );
    expect(t1).toContain("Conselhas");
    expect(t1).not.toContain("Areeiro");
    expect(t2).toContain("Areeiro");
    expect(t2).not.toContain("Conselhas");
    expect(t2).not.toContain("Vasco");
  });

  it("evento só com imóvel (sem pessoa) continua a ter conteúdo", () => {
    const soImovel: BriefingEvent = { ...negocio, person_id: null, opportunity_id: null };
    expect(isBriefingDue(soImovel, NOW)).toBe(true);
    expect(hasAnyBriefingContent(null, { property: ctx.property })).toBe(true);
    const text = formatMeetingBriefing(soImovel, null, NOW, { property: ctx.property });
    expect(text).toContain("Imóvel:");
    expect(text).not.toContain(", com ");
  });

  it("não escreve linhas vazias quando não há dados", () => {
    expect(formatEventContext({})).toBe("");
    expect(hasAnyBriefingContent(null, {})).toBe(false);
  });
});
