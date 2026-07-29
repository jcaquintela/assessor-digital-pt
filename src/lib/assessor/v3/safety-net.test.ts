import { describe, it, expect, vi } from "vitest";
import {
  isDisposableMessage,
  shouldArchiveTurn,
  archiveToMiscellaneous,
  withSavedNote,
  applySafetyNet,
} from "./safety-net.server";

const PRO_MSG = "Fechei o negócio do terreno por 200.000€, comissão 5.000€";

function fakeCtx() {
  const inserts: any[] = [];
  const supabase = {
    from: (table: string) => ({
      insert: (row: any) => {
        inserts.push({ table, row });
        return Promise.resolve({ data: { id: "x" }, error: null });
      },
    }),
  };
  return { ctx: { supabase, userId: "u1", channel: "whatsapp", sourceMessageId: null } as any, inserts };
}

describe("safety net — o que é descartável", () => {
  it("confirmações, rejeições e saudações não vão para Diversos", () => {
    for (const t of ["sim", "Ok", "não", "bom dia", "obrigado", "👍"]) {
      expect(isDisposableMessage(t)).toBe(true);
    }
  });
  it("mensagem profissional não é descartável", () => {
    expect(isDisposableMessage(PRO_MSG)).toBe(false);
  });
});

describe("safety net — decisão", () => {
  it("ferramenta falhada grava", () => {
    expect(shouldArchiveTurn({ content: PRO_MSG, outcome: "tool_failed" })).toBe(true);
  });
  it("não compreendido grava", () => {
    expect(shouldArchiveTurn({ content: PRO_MSG, outcome: "not_understood" })).toBe(true);
  });
  it("sucesso não grava", () => {
    expect(shouldArchiveTurn({ content: PRO_MSG, outcome: "executed_ok" })).toBe(false);
  });
  it("duplicado não grava", () => {
    expect(shouldArchiveTurn({ content: PRO_MSG, outcome: "duplicate" })).toBe(false);
  });
  it("consulta não grava", () => {
    expect(shouldArchiveTurn({ content: "o que tenho hoje?", outcome: "query" })).toBe(false);
  });
  it("'sim' falhado não grava (sem conteúdo)", () => {
    expect(shouldArchiveTurn({ content: "sim", outcome: "tool_failed" })).toBe(false);
  });
});

describe("safety net — escrita e resposta", () => {
  it("escreve em miscellaneous_items com estado inbox e categoria Por tratar", async () => {
    const { ctx, inserts } = fakeCtx();
    const okSaved = await archiveToMiscellaneous(ctx, PRO_MSG, "financial_movements:erro");
    expect(okSaved).toBe(true);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].table).toBe("miscellaneous_items");
    expect(inserts[0].row.status).toBe("inbox");
    expect(inserts[0].row.category).toBe("Por tratar");
    expect(inserts[0].row.original_content).toBe(PRO_MSG);
    expect(inserts[0].row.user_id).toBe("u1");
  });

  it("applySafetyNet grava e diz ao consultor onde ficou", async () => {
    const { ctx, inserts } = fakeCtx();
    const reply = await applySafetyNet(ctx, {
      content: PRO_MSG,
      outcome: "not_understood",
      reason: null,
      reply: "Não percebi bem essa parte.",
    });
    expect(inserts).toHaveLength(1);
    expect(reply).toContain("Diversos");
  });

  it("applySafetyNet não grava nem altera a resposta em caso de sucesso", async () => {
    const { ctx, inserts } = fakeCtx();
    const reply = await applySafetyNet(ctx, {
      content: PRO_MSG,
      outcome: "executed_ok",
      reason: null,
      reply: "Feito. Registei a comissão de 5000 €.",
    });
    expect(inserts).toHaveLength(0);
    expect(reply).toBe("Feito. Registei a comissão de 5000 €.");
  });

  it("não duplica a menção a Diversos", () => {
    expect(withSavedNote("Deixei em Diversos para não se perder.", true))
      .toBe("Deixei em Diversos para não se perder.");
  });

  it("falha de escrita não parte a resposta", async () => {
    const supabase = { from: () => ({ insert: () => Promise.resolve({ data: null, error: { message: "rls" } }) }) };
    const ctx = { supabase, userId: "u1", channel: "web", sourceMessageId: null } as any;
    const reply = await applySafetyNet(ctx, {
      content: PRO_MSG, outcome: "tool_failed", reason: "x", reply: "Tentei mas não consegui.",
    });
    expect(reply).toBe("Tentei mas não consegui.");
  });
});
