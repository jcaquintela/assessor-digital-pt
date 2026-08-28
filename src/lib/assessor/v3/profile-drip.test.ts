import { describe, expect, it } from "vitest";
import {
  composeDripReply,
  nextProfileQuestion,
  rankByWorkArea,
  readProfileAnswer,
  MAX_QUESTIONS_30D,
  PAUSE_DAYS,
  REFUSALS_BEFORE_PAUSE,
  TRANSITION_NOTICE,
  type ProfileDripState,
} from "./profile-drip";
import { teamTone, emptyFacts } from "../supreme/mentor-context";

const base: ProfileDripState = {
  workArea: null,
  teamContext: null,
  asked: [],
  lastQuestionAt: null,
  refusalStreak: 0,
  pausedUntil: null,
  noticeSentAt: null,
  isExistingConsultant: false,
};

const calm = { replyIsQuestion: false, busyWithTask: false, calmDay: true };

describe("perfil por gotas — fase 1", () => {
  it("1) consultor existente recebe o aviso de transição uma única vez, antes da 1ª pergunta nova", () => {
    const existing = { ...base, isExistingConsultant: true };
    const first = nextProfileQuestion(existing, calm)!;
    expect(first.key).toBe("work_area");
    expect(first.withNotice).toBe(true);
    const reply = composeDripReply("Feito.", first);
    expect(reply).toContain(TRANSITION_NOTICE);
    expect(reply.indexOf(TRANSITION_NOTICE)).toBeLessThan(reply.indexOf(first.question));

    // Aviso já enviado: a pergunta seguinte sai sem ele.
    const later = nextProfileQuestion(
      {
        ...existing,
        noticeSentAt: new Date().toISOString(),
        workArea: "Matosinhos",
        asked: [{ key: "work_area", at: new Date(Date.now() - 2 * 864e5).toISOString() }],
        lastQuestionAt: new Date(Date.now() - 2 * 864e5).toISOString(),
      },
      calm,
    )!;
    expect(later.key).toBe("team_context");
    expect(later.withNotice).toBe(false);

    // Consultor novo nunca vê o aviso.
    expect(nextProfileQuestion(base, calm)!.withNotice).toBe(false);
  });

  it("2) âncora contextual (placa registada) dispara a pergunta de zona, mesmo com trabalho no turno", () => {
    const offer = nextProfileQuestion(base, {
      replyIsQuestion: false,
      busyWithTask: true,
      calmDay: false,
      anchor: "work_area",
    });
    expect(offer?.key).toBe("work_area");
    expect(offer?.anchored).toBe(true);
    expect(offer?.question).toMatch(/zona principal/i);
  });

  it("3) sem âncora, a pergunta só sai em dia calmo", () => {
    expect(nextProfileQuestion(base, { ...calm, calmDay: false })).toBe(null);
    expect(nextProfileQuestion(base, calm)?.key).toBe("work_area");
    // Pergunta do Afonso no mesmo turno trava sempre.
    expect(nextProfileQuestion(base, { ...calm, replyIsQuestion: true })).toBe(null);
  });

  it("4) teto de 6 perguntas em 30 dias e pausa de 7 dias após 2 recusas seguidas", () => {
    const asked = Array.from({ length: MAX_QUESTIONS_30D }, (_, i) => ({
      key: `q${i}`,
      at: new Date(Date.now() - (i + 2) * 864e5).toISOString(),
    }));
    expect(nextProfileQuestion({ ...base, asked }, calm)).toBe(null);

    // Recusas seguidas → pausa (estado que o servidor grava).
    expect(REFUSALS_BEFORE_PAUSE).toBe(2);
    const paused = {
      ...base,
      pausedUntil: new Date(Date.now() + PAUSE_DAYS * 864e5).toISOString(),
    };
    expect(nextProfileQuestion(paused, calm)).toBe(null);
    const expired = { ...base, pausedUntil: new Date(Date.now() - 864e5).toISOString() };
    expect(nextProfileQuestion(expired, calm)?.key).toBe("work_area");
  });

  it("5) work_area enviesa a pesquisa de imóveis; sem work_area nada muda", () => {
    const rows = [
      { id: "1", title: "T2 Braga", city: "Braga" },
      { id: "2", title: "T3 Matosinhos", city: "Matosinhos" },
    ];
    expect(rankByWorkArea(rows, "Matosinhos e Leça").map((r) => r.id)).toEqual(["2", "1"]);
    expect(rankByWorkArea(rows, null).map((r) => r.id)).toEqual(["1", "2"]);
    expect(rankByWorkArea(rows, "  ").map((r) => r.id)).toEqual(["1", "2"]);
  });

  it("6) máximo 1 pergunta por dia, nunca 2 na mesma conversa, mesmo com várias âncoras", () => {
    const askedToday = { ...base, lastQuestionAt: new Date().toISOString() };
    expect(nextProfileQuestion(askedToday, { ...calm, anchor: "work_area" })).toBe(null);
    expect(
      nextProfileQuestion(base, { ...calm, anchor: "work_area", askedInThisConversation: true }),
    ).toBe(null);
    // Arranque leve por terminar bloqueia as gotas.
    expect(nextProfileQuestion(base, { ...calm, onboardingPending: true })).toBe(null);
  });

  it("lê respostas e recusas sem confundir com trabalho real", () => {
    expect(readProfileAnswer("work_area", "Matosinhos e Leça")).toEqual({
      kind: "value",
      text: "Matosinhos e Leça",
    });
    expect(readProfileAnswer("work_area", "agora não").kind).toBe("skip");
    expect(readProfileAnswer("team_context", "marca visita amanhã").kind).toBe("not_an_answer");
  });

  it("contexto de equipa ajusta o tom do Mentor sem virar motor de perfil", () => {
    expect(teamTone({ ...emptyFacts(), teamContext: "sozinho" })).toMatch(/sozinho/i);
    expect(teamTone({ ...emptyFacts(), teamContext: "tenho equipa de 3" })).toMatch(/equipa/i);
    expect(teamTone(emptyFacts())).toBe("");
  });
});
