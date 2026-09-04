// Golden — itens por resolver nunca são silenciados nem tapados por recibos.
//
// Caso real de 4/9/2026: "amanhã às 20:15 ver o FCP, apresentar proposta à
// Joana e call Matosinhos". O compromisso foi escrito; os dois seguimentos
// ficaram à espera de confirmação (contacto e imóvel). A resposta que saiu foi
// "Guardei o compromisso ... Guardei o seguimento em Seguimentos." — as duas
// perguntas desapareceram e o consultor pensou que estava tudo tratado.

import { describe, it, expect } from "vitest";
import { composeAsksReply, askLabel, type PendingAskItem } from "./pending-asks";
import { describeWrites, enforceTransparentConfirmation, isRealWrite } from "./write-receipt";

const JOANA_QUESTION =
  'Ainda não tenho nenhum contacto "Joana". Crio um contacto novo com esse nome ou avanço sem associar?';
const MATOSINHOS_QUESTION =
  "O imóvel é a Moradia V3 na Rua do Sol, Matosinhos? Se não for, diz-me qual é.";

const TURN_TOOLS = [
  { name: "create_event", ok: true, data: { event: { title: "Ver o FCP" } } },
  {
    name: "create_follow_up",
    ok: true,
    data: {
      needsPersonConfirmation: true,
      mode: "new",
      personName: "Joana",
      suggestions: [],
      incoming: { title: "Apresentar proposta à Joana" },
    },
  },
  {
    name: "create_follow_up",
    ok: true,
    data: {
      needsPropertyConfirmation: true,
      mode: "confirm_partial",
      question: MATOSINHOS_QUESTION,
      incoming: { title: "Call Matosinhos" },
    },
  },
];

const TURN_ASKS: PendingAskItem[] = [
  { kind: "person", label: "Apresentar proposta à Joana", question: JOANA_QUESTION },
  { kind: "property", label: "Call Matosinhos", question: MATOSINHOS_QUESTION },
];

describe("golden 1 — mensagem literal com três itens", () => {
  const receipt = describeWrites(TURN_TOOLS as any);
  const composed = composeAsksReply(receipt, TURN_ASKS);
  const final = enforceTransparentConfirmation(composed, TURN_TOOLS as any, {
    executedOk: true,
    pendingAsk: true,
  });

  it("confirma apenas o compromisso, que foi mesmo escrito", () => {
    expect(receipt).toContain("Ver o FCP");
    expect(receipt).not.toContain("seguimento");
  });

  it("enumera explicitamente os dois itens à espera", () => {
    expect(final).toContain("Apresentar proposta à Joana");
    expect(final).toContain("Call Matosinhos");
    expect(final).toContain("Ficaram dois por resolver");
  });

  it("mantém as duas perguntas intactas", () => {
    expect(final).toContain(JOANA_QUESTION);
    expect(final).toContain(MATOSINHOS_QUESTION);
  });

  it("nunca troca a resposta por um recibo falso", () => {
    expect(final).not.toBe(receipt);
    expect(final).not.toMatch(/Guardei o seguimento/i);
  });
});

describe("golden 2 — pergunta com verbo na 1.ª pessoa", () => {
  it('"Crio um contacto novo...?" sobrevive ao recibo de escrita', () => {
    const out = enforceTransparentConfirmation(JOANA_QUESTION, TURN_TOOLS as any, {
      executedOk: true,
      pendingAsk: true,
    });
    expect(out).toBe(JOANA_QUESTION);
  });

  it("sem pendente, o comportamento antigo mantém-se", () => {
    const tools = [{ name: "create_event", ok: true, data: { event: { title: "Ver o FCP" } } }];
    const out = enforceTransparentConfirmation("Crio já o compromisso.", tools as any, {
      executedOk: true,
    });
    expect(out).toContain("Guardei o compromisso");
  });
});

describe("golden 3 — recibo só para escritas reais", () => {
  it("needsPersonConfirmation não conta como escrita", () => {
    const pending = [TURN_TOOLS[1]!];
    expect(isRealWrite(pending[0] as any)).toBe(false);
    expect(describeWrites(pending as any)).toBeNull();
  });

  it("needsPropertyConfirmation não conta como escrita", () => {
    expect(describeWrites([TURN_TOOLS[2]!] as any)).toBeNull();
  });

  it("uma escrita verdadeira continua a ser confirmada", () => {
    expect(describeWrites([TURN_TOOLS[0]!] as any)).toContain("Ver o FCP");
  });

  it("não corta o terceiro item quando há três escritas reais", () => {
    const three = [
      { name: "create_event", ok: true, data: { event: { title: "A" } } },
      { name: "create_follow_up", ok: true, data: { follow_up: { title: "B" } } },
      { name: "save_miscellaneous", ok: true, data: { item: { title: "C" } } },
    ];
    const out = describeWrites(three as any) ?? "";
    expect(out).toContain("A");
    expect(out).toContain("B");
    expect(out).toContain("C");
  });
});

describe("golden 4 — vários pendentes no mesmo turno", () => {
  it("três pendentes aparecem todos", () => {
    const asks: PendingAskItem[] = [
      ...TURN_ASKS,
      { kind: "person", label: "Ligar ao Rui", question: "Qual dos Ruis é?" },
    ];
    const out = composeAsksReply(null, asks);
    expect(out).toContain("Ficaram 3 por resolver");
    for (const a of asks) expect(out).toContain(a.question);
    expect(out.split("•").length - 1).toBe(3);
  });

  it("um único pendente mantém a frase natural de sempre", () => {
    const out = composeAsksReply("Guardei o compromisso em Calendário.", [TURN_ASKS[0]!]);
    expect(out).toBe(`Guardei o compromisso em Calendário. ${JOANA_QUESTION}`);
  });

  it("o rótulo do item sai do título que ia ser escrito", () => {
    expect(askLabel("create_follow_up", { incoming: { title: "Call Matosinhos" } })).toBe(
      "Call Matosinhos",
    );
    expect(askLabel("create_follow_up", {})).toBe("o seguimento");
  });
});
