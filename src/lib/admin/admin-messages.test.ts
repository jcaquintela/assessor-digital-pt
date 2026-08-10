import { describe, expect, it } from "vitest";
import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";
import {
  ADMIN_REPLY_ACK,
  effectiveState,
  isSessionOpen,
  pickPendingForConsultant,
  windowExpiryFrom,
  type AdminMessageRow,
} from "./admin-messages";
import { captureAdminReply, listAdminMessages } from "./admin-messages.server";

const H = 3_600_000;

function row(over: Partial<AdminMessageRow>): AdminMessageRow {
  const now = new Date();
  return {
    id: "m1",
    consultor_id: "c1",
    admin_id: "a1",
    pergunta: "qual o teu email Google?",
    enviado_em: now.toISOString(),
    resposta: null,
    respondido_em: null,
    estado: "pendente",
    janela_expira_em: windowExpiryFrom(now),
    resposta_lida_em: null,
    ...over,
  };
}

describe("canal admin → consultor", () => {
  it("1. dentro da janela de sessão WhatsApp o envio é permitido", () => {
    expect(isSessionOpen(3)).toBe(true);
  });

  it("2. fora da janela (ou sem contacto) o envio é travado", () => {
    expect(isSessionOpen(30)).toBe(false);
    expect(isSessionOpen(null)).toBe(false);
  });

  it("3. resposta dentro das 48 h fica ligada à pergunta certa e não vai ao motor", async () => {
    const db = makeFakeSupabase({ admin_messages: [row({})] });
    const r = await captureAdminReply(db, "c1", "  julio@gmail.com  ");
    expect(r.captured).toBe(true);
    expect(r.ack).toBe(ADMIN_REPLY_ACK);
    const lista = await listAdminMessages(db, "c1");
    expect(lista[0]?.resposta).toBe("julio@gmail.com");
    expect(lista[0]?.estado).toBe("respondida");
  });

  it("4. depois de a janela expirar a mensagem volta ao fluxo normal do Afonso", async () => {
    const velho = new Date(Date.now() - 60 * H);
    const db = makeFakeSupabase({
      admin_messages: [row({ enviado_em: velho.toISOString(), janela_expira_em: windowExpiryFrom(velho) })],
    });
    const r = await captureAdminReply(db, "c1", "olá");
    expect(r.captured).toBe(false);
    const lista = await listAdminMessages(db, "c1");
    expect(lista[0]?.estado).toBe("expirada");
    expect(lista[0]?.resposta).toBe(null);
  });

  it("5. perguntas a consultores diferentes não se cruzam", async () => {
    const db = makeFakeSupabase({
      admin_messages: [
        row({ id: "m1", consultor_id: "c1", admin_id: "a1", pergunta: "email?" }),
        row({ id: "m2", consultor_id: "c2", admin_id: "a2", pergunta: "telefone?" }),
      ],
    });
    await captureAdminReply(db, "c2", "912345678");
    const c1 = await listAdminMessages(db, "c1");
    const c2 = await listAdminMessages(db, "c2");
    expect(c1[0]?.resposta).toBe(null);
    expect(c1[0]?.estado).toBe("pendente");
    expect(c2[0]?.resposta).toBe("912345678");
  });

  it("sem pergunta pendente nada é capturado", async () => {
    const db = makeFakeSupabase({ admin_messages: [] });
    expect((await captureAdminReply(db, "c1", "marca visita amanhã")).captured).toBe(false);
  });

  it("escolhe sempre a pergunta pendente mais recente do próprio consultor", () => {
    const antiga = new Date(Date.now() - 2 * H);
    const rows = [
      row({ id: "velha", enviado_em: antiga.toISOString(), janela_expira_em: windowExpiryFrom(antiga) }),
      row({ id: "nova" }),
      row({ id: "outro", consultor_id: "c9" }),
    ];
    expect(pickPendingForConsultant(rows, "c1")?.id).toBe("nova");
    expect(effectiveState(row({ respondido_em: new Date().toISOString() }))).toBe("respondida");
  });
});