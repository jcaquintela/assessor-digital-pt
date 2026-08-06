import { describe, expect, it, afterEach } from "vitest";
import { appBaseUrl, PRODUCTION_APP_URL } from "./dashboard-login.server";

const clear = () => {
  delete process.env.APP_PUBLIC_URL;
  delete process.env.SITE_URL;
};
afterEach(clear);

describe("appBaseUrl", () => {
  it("usa o domínio de produção por omissão", () => {
    clear();
    expect(appBaseUrl()).toBe(PRODUCTION_APP_URL);
  });

  it("ignora domínios de preview do Lovable", () => {
    process.env.APP_PUBLIC_URL = "https://assessor-digital-pt.lovable.app";
    expect(appBaseUrl()).toBe(PRODUCTION_APP_URL);
  });

  it("respeita um domínio próprio configurado", () => {
    process.env.APP_PUBLIC_URL = "https://app.meuafonso.com/";
    expect(appBaseUrl()).toBe("https://app.meuafonso.com");
  });
});
