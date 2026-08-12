import { describe, expect, it } from "vitest";
import { classifyEvent, needsOutcomeFollowUp } from "@/lib/assessor/event-class";
import {
  countOverdueFollowUps,
  isOverdueFollowUp,
  requiresOutcome,
  fromSeguimento,
  type PendingFollowUp,
} from "./pending";

const NOW = new Date("2026-08-11T10:00:00Z");

const evento = (over: Partial<PendingFollowUp>): PendingFollowUp => ({
  type: "evento",
  due_time: "09:00",
  due_date: "2026-08-10",
  status: "agendado",
  ...over,
});

describe("Golden — reuniões internas não geram seguimento", () => {
  it("1. evento 'Reunião de equipa' sem pessoa/imóvel não gera seguimento", () => {
    const ev = evento({ title: "Reunião de equipa" });
    expect(classifyEvent(ev)).toBe("interno");
    expect(requiresOutcome(ev)).toBe(false);
    expect(isOverdueFollowUp(ev, NOW)).toBe(false);
  });

  it("1b. 'Hub Zome Porto Boavista' sem ligação comercial é interno por omissão", () => {
    const ev = evento({ title: "Hub Zome Porto Boavista" });
    expect(classifyEvent(ev)).toBe("interno");
    expect(requiresOutcome(ev)).toBe(false);
    expect(isOverdueFollowUp(ev, NOW)).toBe(false);
  });

  it("1c. qualquer título desconhecido sem pessoa, imóvel ou negócio é interno", () => {
    const ev = evento({ title: "Encontro XPTO" });
    expect(classifyEvent(ev)).toBe("interno");
    expect(needsOutcomeFollowUp(ev)).toBe(false);
  });

  it("2. 'Visita — Rua das Flores' com lead associado gera seguimento normalmente", () => {
    const ev = evento({ title: "Visita — Rua das Flores", person_id: "lead-1" });
    expect(classifyEvent(ev)).toBe("negocio");
    expect(requiresOutcome(ev)).toBe(true);
    expect(isOverdueFollowUp(ev, NOW)).toBe(true);
  });

  it("3. Level Up, Operações e Liderança (10/08) saem de prioridades, atenção e banner", () => {
    const rows = [
      evento({ title: "Reunião de equipa Level Up" }),
      evento({ title: "Reunião de Operações", due_time: "10:00" }),
      evento({ title: "Reunião Mensal Liderança", due_time: "11:00" }),
    ];
    expect(rows.every((r) => requiresOutcome(r))).toBe(false);
    expect(countOverdueFollowUps(rows, NOW)).toBe(0);
  });

  it("4. override manual para 'negocio' volta a gerar seguimento", () => {
    const ev = evento({ title: "Reunião de equipa", event_class: "negocio" });
    expect(classifyEvent(ev)).toBe("negocio");
    expect(needsOutcomeFollowUp(ev)).toBe(true);
    expect(isOverdueFollowUp(ev, NOW)).toBe(true);
  });

  it("4b. override manual para 'interno' silencia um evento comercial", () => {
    const ev = evento({ title: "Visita ao T3", person_id: "p1", event_class: "interno" });
    expect(requiresOutcome(ev)).toBe(false);
    expect(isOverdueFollowUp(ev, NOW)).toBe(false);
  });

  it("5. banner, atenção e prioridades leem a mesma contagem", () => {
    const seguimentos = [
      { id: "1", titulo: "Reunião de equipa Level Up", tipo: "Evento", data: "2026-08-10", hora: "09:00", estado: "Pendente" },
      { id: "2", titulo: "Reunião de Operações", tipo: "Evento", data: "2026-08-10", hora: "10:00", estado: "Pendente" },
      { id: "3", titulo: "Reunião Mensal Liderança", tipo: "Evento", data: "2026-08-10", hora: "11:00", estado: "Pendente" },
      { id: "4", titulo: "Visita — Rua das Flores", tipo: "Evento", data: "2026-08-10", hora: "15:00", estado: "Pendente", pessoaId: "p1" },
      { id: "5", titulo: "Ligar ao Paulo", tipo: "Tarefa", data: "2026-08-09", estado: "Pendente" },
    ].map(fromSeguimento);

    // Banner (contagem) e listas (itens) derivam do MESMO seletor.
    const banner = countOverdueFollowUps(seguimentos, NOW);
    const prioridades = seguimentos.filter((s) => isOverdueFollowUp(s, NOW));
    const atencao = prioridades.slice(0, 1);
    expect(banner).toBe(prioridades.length);
    expect(banner).toBe(2); // a visita e a tarefa; nenhuma reunião interna
    expect(atencao.every((a) => prioridades.includes(a))).toBe(true);

    // "Aguardam resultado" é um subconjunto: só compromissos de negócio.
    expect(prioridades.filter(requiresOutcome).map((p) => p.title)).toEqual(["Visita — Rua das Flores"]);
  });
});