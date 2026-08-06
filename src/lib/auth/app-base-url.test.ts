import { describe, expect, it, afterEach } from "vitest";
import {
  appBaseUrl,
  assertPublicLoginUrl,
  isInternalPreviewUrl,
  PRODUCTION_APP_URL,
} from "./dashboard-login.server";

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

describe("assertPublicLoginUrl", () => {
  it("recusa links de preview/staging do Lovable", () => {
    for (const url of [
      "https://assessor-digital-pt.lovable.app/entrar?token=lg_x",
      "https://id-preview--abc.lovable.app/entrar?token=lg_x",
      "https://project--x-dev.lovable.app/entrar?token=lg_x",
      "https://foo.lovable.dev/entrar?token=lg_x",
    ]) {
      expect(isInternalPreviewUrl(url)).toBe(true);
      expect(() => assertPublicLoginUrl(url)).toThrow(/domínio interno/);
    }
  });

  it("deixa passar o domínio de produção", () => {
    const url = `${PRODUCTION_APP_URL}/entrar?token=lg_x`;
    expect(isInternalPreviewUrl(url)).toBe(false);
    expect(assertPublicLoginUrl(url)).toBe(url);
  });
});
