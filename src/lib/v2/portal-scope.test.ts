import { describe, it, expect } from "vitest";
import { portalRedirectFor, isV2PortalPathAllowed, V2_PORTAL_HOME } from "./portal-scope";

describe("portal V2 mínimo — Afonso não é CRM", () => {
  it("V1 (interruptor desligado) nunca redireciona, nem páginas comerciais", () => {
    for (const p of ["/hoje", "/pessoas", "/imoveis/1", "/negocios", "/assessor"]) {
      expect(portalRedirectFor(p, "v1")).toBeNull();
    }
  });

  it("V2 bloqueia todas as áreas comerciais e envia para a conta", () => {
    for (const p of [
      "/hoje", "/pessoas", "/pessoas/abc", "/imoveis", "/negocios/1", "/oportunidades",
      "/oportunidades/prospecao/1", "/calendario", "/drive", "/assessor", "/seguimentos",
      "/negocio/comissoes", "/interacoes", "/diversos", "/rotinas", "/grupos/1", "/documentos", "/mais",
      "/comunicacao", "/briefing/detalhes",
    ]) {
      expect(portalRedirectFor(p, "v2_minimal"), p).toBe(V2_PORTAL_HOME);
    }
  });

  it("V2 deixa passar só conta, subscrição, canais, integrações, privacidade e sobre a IA", () => {
    for (const p of ["/conta", "/subscricao", "/subscricao?ok=1", "/ligar-canal", "/definicoes", "/privacidade", "/sobre-a-ia/"]) {
      expect(portalRedirectFor(p, "v2_minimal"), p).toBeNull();
    }
  });

  it("prefixo parecido não conta como permitido", () => {
    expect(isV2PortalPathAllowed("/contas-a-receber")).toBe(false);
    expect(isV2PortalPathAllowed("/privacidade-x")).toBe(false);
  });
});
