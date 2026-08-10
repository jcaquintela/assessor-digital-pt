import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveInviteTarget, sendInvite } from "./invite-send.server";

const sendPayload = vi.fn();
const sendText = vi.fn();
const approved = vi.fn();
const within = vi.fn();

vi.mock("@/lib/whatsapp/send.server", () => ({
  sendWhatsAppPayload: (...a: any[]) => sendPayload(...a),
  sendWhatsAppText: (...a: any[]) => sendText(...a),
}));
vi.mock("@/lib/whatsapp/template-status.server", () => ({
  isTemplateApproved: (...a: any[]) => approved(...a),
}));
vi.mock("@/lib/assessor/proactive/push.server", () => ({
  isWithin24hWindow: (...a: any[]) => within(...a),
}));

function db(rows: { link?: string | null; phone?: string | null }) {
  return {
    from: (t: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: rows.link ? { external_id: rows.link } : null }) }),
          maybeSingle: async () => ({ data: { phone: rows.phone ?? null } }),
        }),
      }),
    }),
  } as any;
}

const base = { userId: "u1", canal: "whatsapp" as const, nome: "Júlio", texto: "Olá", url: "https://app.meuafonso.com/entrar?token=tok1" };

beforeEach(() => {
  vi.clearAllMocks();
  within.mockResolvedValue(false);
  approved.mockResolvedValue(true);
});

describe("golden — envio do convite pelo Afonso", () => {
  it("1) telefone válido fora da janela → sai por template aprovado e confirma o número", async () => {
    sendPayload.mockResolvedValue({ ok: true, messageId: "wamid.1", telemetry: {} });
    const r = await sendInvite(db({ phone: "+351 912 345 678" }), base);
    expect(r).toMatchObject({ enviado: true, via: "template", destino: "+351 9XX XXX 678" });
    const [, payload, opts] = sendPayload.mock.calls[0];
    expect((payload as any).template.name).toBe("afonso_convite_painel");
    expect(opts.meta).toMatchObject({ purpose: "invite_access", outsideWindow: true });
  });

  it("2) sem telefone → nenhuma chamada à API e aviso claro", async () => {
    const r = await sendInvite(db({ phone: null }), base);
    expect(r.enviado).toBe(false);
    expect(r.erro).toBe("Sem número de telefone — adiciona o número primeiro ou usa Gerar link.");
    expect(sendPayload).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
  });

  it("2b) número mal formado → bloqueado antes da Meta", async () => {
    const alvo = await resolveInviteTarget(db({ phone: "912345" }), "u1", "whatsapp");
    expect(alvo.externalId).toBeNull();
    expect(alvo.motivo).toContain("formato internacional");
  });

  it("3) falha da Meta (número inválido) → erro legível, nunca sucesso", async () => {
    sendPayload.mockResolvedValue({
      ok: false,
      error: "x",
      telemetry: { errorCode: 131026, errorMessage: "Receiver is incapable" },
    });
    const r = await sendInvite(db({ phone: "351912345678" }), base);
    expect(r.enviado).toBe(false);
    expect(r.erro).toContain("não tem WhatsApp");
  });

  it("3b) template ainda por aprovar → não improvisa texto livre", async () => {
    approved.mockResolvedValue(false);
    const r = await sendInvite(db({ phone: "351912345678" }), base);
    expect(r.enviado).toBe(false);
    expect(r.erro).toContain("ainda não está aprovado");
    expect(sendPayload).not.toHaveBeenCalled();
  });

  it("4) dentro das 24h → texto livre com a mensagem completa (reenvio após novo link)", async () => {
    within.mockResolvedValue(true);
    sendText.mockResolvedValue({ ok: true, messageId: "wamid.2", telemetry: {} });
    const r = await sendInvite(db({ link: "351912345678" }), { ...base, url: "https://app.meuafonso.com/entrar?token=tok2" });
    expect(r).toMatchObject({ enviado: true, via: "texto" });
    expect(sendText.mock.calls[0][1]).toBe("Olá");
  });
});
