import { describe, it, expect } from "vitest";
import { buildArchiveContent } from "./safety-net.server";
import { enforceSingleQuestion, enforceHumanTone } from "../culture/sanitize";
import { CreateEventArgs } from "../v2/tools";

describe("rede de segurança — não perde o contexto da conversa", () => {
  it("usa o conteúdo acumulado da acção pendente em vez da última mensagem", () => {
    const out = buildArchiveContent({
      trimmed: "09:30",
      pendingContent: "reservar bloco de agenda amanhã para chamadas à rede de contactos",
    });
    expect(out).toContain("bloco de agenda");
    expect(out).toContain("09:30");
  });

  it("sem pendente, reconstrói a partir do histórico recente", () => {
    const out = buildArchiveContent({
      trimmed: "09:30",
      pendingContent: null,
      recentRows: [
        { role: "assistant", content: "Queres que reserve um bloco na agenda de amanhã?" },
        { role: "user", content: "contactos da minha rede" },
        { role: "user", content: "Para amanhã preciso de um plano para lead gen" },
      ],
    });
    expect(out).toContain("lead gen");
    expect(out).toContain("contactos da minha rede");
    expect(out).toContain("09:30");
  });

  it("sem contexto nenhum, guarda a própria mensagem", () => {
    expect(buildArchiveContent({ trimmed: "xpto 44" })).toBe("xpto 44");
  });
});

describe("segundo pedido não desaparece", () => {
  const reply =
    "A que horas preferes reservar o bloco amanhã? Deixo-te uma sugestão: 'Olá, tudo bem? Estou a atualizar contactos.'";

  it("mantém o script sugerido e só uma pergunta ao consultor", () => {
    const out = enforceSingleQuestion(enforceHumanTone(reply));
    expect(out).toContain("A que horas");
    expect(out).toContain("sugestão");
    expect(out).toContain("Estou a atualizar contactos");
  });

  it("continua a cortar duas perguntas reais", () => {
    const out = enforceSingleQuestion("Para quando é? E com quem vais?");
    expect(out).toBe("Para quando é?");
  });
});

describe("create_event tolera tipos inventados pelo modelo", () => {
  it("'prospeccao' não faz a criação falhar", () => {
    const parsed = CreateEventArgs.parse({
      title: "Bloco de chamadas à rede de contactos",
      event_type: "prospeccao",
      date: "2026-07-30",
      start_time: "09:30",
    });
    expect(parsed.event_type).toBe("outro");
  });
});
