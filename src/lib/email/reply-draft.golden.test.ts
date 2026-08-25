// Golden Tests — rascunho de resposta a email (fase 1, sem envio automático).
// Cobrem as 8 situações exigidas antes de publicar.

import { describe, expect, it } from "vitest";
import {
  AMBIGUOUS_REPLY,
  classifyDraftReply,
  isAlreadySent,
  isDraftExpired,
  iterationExhausted,
  DRAFT_TTL_MS,
  draftConfirmationQuestion,
  draftPresentationIntro,
  isDraftCancelled,
  cancelledReply,
} from "./reply-draft";
import { addressOf, rankEmailCandidates, replySubject } from "./reply-draft.server";
import { confirmAndSendDraft } from "./gmail/gmail.server";
import type { MailMessageHead } from "./message";

function head(p: Partial<MailMessageHead>): MailMessageHead {
  return {
    id: p.id ?? "m1",
    threadId: p.threadId ?? "t1",
    from: p.from ?? null,
    to: [],
    subject: p.subject ?? null,
    snippet: null,
    sentAt: null,
    isRead: true,
  };
}

describe("rascunho de resposta a email", () => {
  it("1. fluxo feliz: apresenta o rascunho e 'enviar' autoriza", () => {
    const intro = draftPresentationIntro({
      toLabel: "Paulo Lopes",
      subject: "Proposta Rua X",
      manualSend: true,
    });
    expect(intro).toContain("Paulo Lopes");
    expect(draftConfirmationQuestion({ draftId: "d1", manualSend: true })).toContain(
      "/comunicacao/rascunho/d1",
    );
    expect(classifyDraftReply("enviar")).toBe("send");
    expect(classifyDraftReply("podes enviar o email")).toBe("send");
    expect(classifyDraftReply("manda")).toBe("send");
    expect(replySubject("Proposta Rua X")).toBe("Re: Proposta Rua X");
    expect(replySubject("Re: Proposta")).toBe("Re: Proposta");
    expect(addressOf("Paulo Lopes <paulo@exemplo.pt>")).toBe("paulo@exemplo.pt");
  });

  it("2. confirmação ambígua não envia e pede reformulação", () => {
    for (const t of ["sim", "ok", "boa", "certo", "perfeito", "👍", "sim, boa"]) {
      expect(classifyDraftReply(t)).toBe("ambiguous");
    }
    expect(AMBIGUOUS_REPLY).toContain("enviar");
  });

  it("3. 'envia mas muda a data' itera em vez de enviar", () => {
    expect(classifyDraftReply("envia mas muda a data")).toBe("edit");
    expect(classifyDraftReply("envia, mas primeiro acrescenta o valor")).toBe("edit");
    expect(classifyDraftReply("não envies ainda")).toBe("reject");
  });

  it("4. rascunho com mais de 6 horas não é enviado", () => {
    const old = new Date(Date.now() - DRAFT_TTL_MS - 1000).toISOString();
    expect(isDraftExpired(old)).toBe(true);
    expect(isDraftExpired(new Date(Date.now() + 60_000).toISOString())).toBe(false);
  });

  it("5. quarta iteração encaminha para o dashboard", () => {
    expect(iterationExhausted(0)).toBe(false);
    expect(iterationExhausted(2)).toBe(false);
    expect(iterationExhausted(3)).toBe(true);
  });

  it("6. segunda confirmação sobre rascunho enviado não duplica", () => {
    expect(isAlreadySent({ status: "sent" })).toBe(true);
    expect(isAlreadySent({ status: "pending", sent_at: new Date().toISOString() })).toBe(true);
    expect(isAlreadySent({ status: "pending", sent_at: null })).toBe(false);
  });

  it("7. mais de um candidato devolve todos, nunca adivinha", () => {
    const items = [
      head({ id: "a", from: "Paulo Lopes <p@x.pt>", subject: "Proposta Rua X" }),
      head({ id: "b", from: "Paulo Lopes <p@x.pt>", subject: "Proposta Rua Y" }),
      head({ id: "c", from: "Ana Sousa <a@x.pt>", subject: "Escritura" }),
    ];
    const c = rankEmailCandidates(items, "paulo proposta");
    expect(c.map((m) => m.id).sort()).toEqual(["a", "b"]);
    expect(rankEmailCandidates(items, "escritura").map((m) => m.id)).toEqual(["c"]);
  });

  it("8. no Gmail o envio rebenta sem confirmed=true", async () => {
    await expect(confirmAndSendDraft("chave", "d1", false)).rejects.toThrow(/não confirmado/i);
  });
});

// --- Cancelamento (estado terminal) --------------------------------------
describe("cancelamento de rascunho", () => {
  it("reconhece rascunho cancelado por status", () => {
    expect(isDraftCancelled({ status: "cancelled" })).toBe(true);
  });
  it("reconhece rascunho cancelado por cancelled_at", () => {
    expect(isDraftCancelled({ status: "pending", cancelled_at: new Date().toISOString() })).toBe(
      true,
    );
  });
  it("rascunho pendente não conta como cancelado", () => {
    expect(isDraftCancelled({ status: "pending", cancelled_at: null })).toBe(false);
  });
  it("recusa explícita continua a ser classificada como reject", () => {
    expect(classifyDraftReply("cancela isso")).toBe("reject");
    expect(classifyDraftReply("não envies")).toBe("reject");
  });
  it("resposta de cancelado não convida a reenviar", () => {
    expect(cancelledReply()).toMatch(/cancelado/i);
  });
});
