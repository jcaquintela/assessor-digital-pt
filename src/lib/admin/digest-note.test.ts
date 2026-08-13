import { describe, it, expect } from "vitest";
import { digestFailure } from "./digest-note";

describe("digestFailure", () => {
  it("sem nota não inventa motivo", () => {
    expect(digestFailure(null)).toBeNull();
    expect(digestFailure("   ")).toBeNull();
  });
  it("domínio por verificar", () => {
    const f = digestFailure("Resend 403: The meuafonso.com domain is not verified. Please, add …")!;
    expect(f.label).toBe("O domínio de envio não está verificado");
    expect(f.hint).toMatch(/Verifica o domínio/);
  });
  it("provider não ligado", () => {
    expect(digestFailure("provider de email não ligado")!.label).toBe("Serviço de email não está ligado");
  });
  it("sem destinatários", () => {
    expect(digestFailure("sem beta testers ativos")!.label).toBe("Não havia ninguém para receber");
  });
  it("nota desconhecida fica visível mas enquadrada", () => {
    const f = digestFailure("qualquer coisa estranha")!;
    expect(f.label).toBe("O envio falhou");
    expect(f.hint).toBe("qualquer coisa estranha");
  });
});
