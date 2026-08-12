import { describe, it, expect } from "vitest";
import {
  TEMPLATE_INVITE,
  inviteTemplatePayload,
  isSendablePhone,
  maskPhone,
  readableSendError,
  tokenFromUrl,
} from "./invite-template";

describe("convite pelo Afonso — template e destino", () => {
  it("valida números em formato internacional", () => {
    expect(isSendablePhone("351912345678")).toBe(true);
    expect(isSendablePhone("+351 912 345 678")).toBe(true);
    expect(isSendablePhone("912345")).toBe(false);
    expect(isSendablePhone("0912345678")).toBe(false);
    expect(isSendablePhone(null)).toBe(false);
  });

  it("mostra o destino sem expor o número inteiro", () => {
    expect(maskPhone("351912345678")).toBe("+351 9XX XXX 678");
  });

  it("monta o payload do template aprovado com nome, link, número e código", () => {
    const token = tokenFromUrl("https://app.meuafonso.com/entrar?token=abc123&x=1");
    expect(token).toBe("abc123");
    const p: any = inviteTemplatePayload("Júlio Quintela", "https://app.meuafonso.com/entrar?token=abc123", "+351912345678", "ABCD-1234");
    expect(p.template.name).toBe(TEMPLATE_INVITE);
    expect(p.template.components[0].parameters.map((x: any) => x.text)).toEqual([
      "Júlio",
      "https://app.meuafonso.com/entrar?token=abc123",
      "+351912345678",
      "ABCD-1234",
    ]);
    expect(p.template.components[1]).toMatchObject({ type: "button", sub_type: "url", index: "0" });
    expect(p.template.components[1].parameters[0].text).toBe("abc123");
  });

  it("traduz os erros da Meta para linguagem legível", () => {
    expect(readableSendError({ errorCode: 131047 })).toContain("24h");
    expect(readableSendError({ errorCode: 131026 })).toContain("não tem WhatsApp");
    expect(readableSendError({ errorCode: 999, errorMessage: "Invalid parameter" })).toContain("Invalid parameter");
  });
});

describe("nome do convite é sempre o do destinatário", () => {
  it("usa o nome do convidado, não o do admin que envia", () => {
    const admin = "Julio Quintela";
    const convidado = "Teste Beta";
    const p: any = inviteTemplatePayload(convidado, "https://app.meuafonso.com/entrar?token=tok123", "+351912345678", "ABCD-1234");
    expect(p.template.components[0].parameters[0].text).toBe("Teste");
    expect(JSON.stringify(p)).not.toContain(admin.split(" ")[0]);
  });

  it("mensagem de texto (dentro das 24h) usa voz do Afonso em primeira pessoa", async () => {
    const { formatInviteMessage } = await import("@/lib/admin/invite-message.server");
    const texto = formatInviteMessage({
      nome: "Teste Beta",
      url: "https://app.meuafonso.com/entrar?token=tok123",
      codigo: "LIGAR-1234",
      numeroAfonso: "+351912345678",
    });
    expect(texto).toContain("Olá Teste, bem-vindo ao Afonso.");
    expect(texto).toContain("Guarda o meu número, é por aqui que vamos falar");
    expect(texto).toContain("Manda-me este código de acesso");
    expect(texto).toContain("Depois disso é só falares comigo como agora.");
    expect(texto).not.toContain("Julio");
    expect(texto).not.toContain("do Afonso");
    expect(texto).not.toContain("falas comigo");
  });
});

describe("voz do template aprovada em primeira pessoa", () => {
  it("nunca usa terceira pessoa para falar do Afonso", () => {
    const p: any = inviteTemplatePayload("Teste Beta", "https://app.meuafonso.com/entrar?token=tok123", "+351912345678", "LIGAR-1234");
    expect(p.template.name).toBe("afonso_convite_painel_v2");
    expect(p.template.components[0].parameters[0].text).toBe("Teste");
  });
});
