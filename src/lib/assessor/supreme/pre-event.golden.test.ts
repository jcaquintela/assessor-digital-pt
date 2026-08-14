// Golden: o aviso de compromisso diz o tempo real e não se sobrepõe à cartela.
import { describe, expect, it } from "vitest";
import { isBriefingDue, type BriefingEvent } from "../proactive/meeting-briefing";
import {
  formatPreEventNudge,
  isPreEventDue,
  shouldSuppressReminder,
} from "./pre-event";

// Evento às 09:00 de Lisboa (verão = 08:00 UTC).
const ev: BriefingEvent = {
  id: "e1",
  title: "Visita com Manuel",
  due_date: "2026-08-14T00:00:00Z",
  due_time: "09:00",
  status: "Pendente",
  person_id: "p1",
  related_property_id: null,
  opportunity_id: null,
  event_class: null,
  created_at: "2026-08-12T09:00:00Z",
  briefing_sent_at: null,
};

const at = (iso: string) => new Date(iso).getTime();

describe("pré-evento e cartela — horas coerentes", () => {
  it("1. cartela dispara aos 15 min antes (08:45), não às 09:00", () => {
    expect(isBriefingDue(ev, at("2026-08-14T07:45:00Z"))).toBe(true);
    expect(isBriefingDue(ev, at("2026-08-14T07:00:00Z"))).toBe(false);
    expect(isBriefingDue({ ...ev, briefing_sent_at: "2026-08-14T07:45:00Z" }, at("2026-08-14T08:00:00Z"))).toBe(false);
  });

  it("2. não há duas notificações no mesmo minuto para o mesmo evento", () => {
    const now = at("2026-08-14T08:00:03Z"); // hora do evento
    // O aviso antigo já não dispara à hora do evento…
    expect(isPreEventDue(ev, now)).toBe(false);
    // …nem sequer 1h antes, porque é evento de negócio (tem a cartela).
    expect(isPreEventDue(ev, at("2026-08-14T07:00:00Z"))).toBe(false);
    // E o lembrete clássico cala-se logo a seguir à cartela.
    expect(shouldSuppressReminder("2026-08-14T07:45:00Z", at("2026-08-14T07:46:00Z"))).toBe(true);
    expect(shouldSuppressReminder(null, now)).toBe(false);
  });

  it("3. o texto reflecte sempre o tempo real até ao evento", () => {
    const interno: BriefingEvent = { ...ev, person_id: null, event_class: "interno" };
    expect(isPreEventDue(interno, at("2026-08-14T07:00:00Z"))).toBe(true);
    expect(formatPreEventNudge(interno, null, at("2026-08-14T07:00:00Z")))
      .toBe("Daqui a 60 min tens Visita com Manuel. Queres que te prepare o contexto?");
    expect(formatPreEventNudge(interno, "Manuel", at("2026-08-14T07:12:00Z")))
      .toBe("Daqui a 48 min tens Visita com Manuel com Manuel. Queres que te prepare o contexto?");
    expect(formatPreEventNudge(interno, null, at("2026-08-14T08:00:00Z")))
      .not.toContain("uma hora");
  });
});

describe("texto dinâmico do aviso — todos os casos", () => {
  const interno: BriefingEvent = { ...ev, person_id: null, event_class: "interno" };
  it("minutos até 89; a partir daí horas", () => {
    expect(formatPreEventNudge(interno, null, at("2026-08-14T06:31:00Z")))
      .toContain("Daqui a 89 min");
    expect(formatPreEventNudge(interno, null, at("2026-08-14T06:30:00Z")))
      .toContain("Daqui a 2 horas");
  });
  it("uma hora no singular", () => {
    expect(formatPreEventNudge(interno, null, at("2026-08-14T06:35:00Z")))
      .toContain("Daqui a 1 hora");
  });
  it("evento já passado nunca diz 0 nem negativos", () => {
    const txt = formatPreEventNudge(interno, null, at("2026-08-14T09:00:00Z"));
    expect(txt).toContain("Daqui a 1 min");
    expect(txt).not.toMatch(/-\d/);
  });
  it("janela do aviso: 45–75 min, fora disso cala-se", () => {
    expect(isPreEventDue(interno, at("2026-08-14T06:44:00Z"))).toBe(false); // 76 min
    expect(isPreEventDue(interno, at("2026-08-14T06:45:00Z"))).toBe(true);  // 75 min
    expect(isPreEventDue(interno, at("2026-08-14T07:15:00Z"))).toBe(true);  // 45 min
    expect(isPreEventDue(interno, at("2026-08-14T07:16:00Z"))).toBe(false); // 44 min
  });
});
