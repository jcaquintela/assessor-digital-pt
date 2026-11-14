import { describe, expect, it } from "vitest";
import {
  emailFrom,
  ownAppHosts,
  panelUrlLabel,
  PRODUCTION_APP_URL,
  resolveAppBaseUrl,
  StagingConfigError,
  telegramBotUsername,
  touchesProductionResource,
} from "./app-url";
import { isAllowedReturnUrl } from "@/lib/subscription/checkout-policy";

const prod = {};
const staging = {
  APP_ENV: "staging",
  STAGING_APP_URL: "https://afonso-staging.lovable.app/",
  STAGING_EMAIL_FROM: "staging@example.test",
  TELEGRAM_BOT_USERNAME: "AfonsoStagingBot",
};

describe("produção: valores de sempre (V1 inalterada)", () => {
  it("endereço, painel, domínios próprios, remetente e bot", () => {
    expect(resolveAppBaseUrl(prod)).toBe("https://app.meuafonso.com");
    expect(panelUrlLabel(prod)).toBe("app.meuafonso.com/hoje");
    expect(ownAppHosts(prod)).toEqual(["app.meuafonso.com", "meuafonso.com"]);
    expect(emailFrom("Afonso", prod)).toBe("Afonso <ola@meuafonso.com>");
    expect(telegramBotUsername(prod)).toBe("AfonsoAIbot");
  });

  it("mantém a regra antiga de APP_PUBLIC_URL (preview ignorado)", () => {
    expect(resolveAppBaseUrl({ APP_PUBLIC_URL: "https://assessor-digital-pt.lovable.app" })).toBe(PRODUCTION_APP_URL);
    expect(resolveAppBaseUrl({ APP_PUBLIC_URL: "https://app.meuafonso.com/" })).toBe(PRODUCTION_APP_URL);
  });

  it("checkout continua a aceitar os regressos de produção", () => {
    expect(isAllowedReturnUrl("https://app.meuafonso.com/subscricao", prod)).toBe(true);
    expect(isAllowedReturnUrl("https://afonso-staging.lovable.app/subscricao", prod)).toBe(false);
  });
});

describe("staging: nunca usa recursos de produção", () => {
  it("usa só o endereço do staging", () => {
    expect(resolveAppBaseUrl(staging)).toBe("https://afonso-staging.lovable.app");
    expect(panelUrlLabel(staging)).toBe("afonso-staging.lovable.app/hoje");
    expect(ownAppHosts(staging)).toEqual(["afonso-staging.lovable.app"]);
    expect(panelUrlLabel(staging)).not.toContain("meuafonso");
  });

  it("falha fechado sem STAGING_APP_URL ou com endereço de produção", () => {
    expect(() => resolveAppBaseUrl({ APP_ENV: "staging" })).toThrow(StagingConfigError);
    for (const url of [
      "https://app.meuafonso.com",
      "https://meuafonso.com",
      "https://assessor-digital-pt.lovable.app",
      "https://id-preview--bf908ebc-1146-4c4f-a804-92bbc45c4e1a.lovable.app",
      "http://afonso-staging.lovable.app",
    ]) {
      expect(() => resolveAppBaseUrl({ APP_ENV: "staging", STAGING_APP_URL: url })).toThrow(StagingConfigError);
    }
  });

  it("checkout de staging só regressa ao staging", () => {
    expect(isAllowedReturnUrl("https://afonso-staging.lovable.app/subscricao", staging)).toBe(true);
    expect(isAllowedReturnUrl("https://app.meuafonso.com/subscricao", staging)).toBe(false);
    expect(isAllowedReturnUrl("https://assessor-digital-pt.lovable.app/subscricao", staging)).toBe(false);
    expect(isAllowedReturnUrl("https://afonso-staging.lovable.app/x", { APP_ENV: "staging" })).toBe(false);
  });

  it("remetente de email: obrigatório e fora de meuafonso.com", () => {
    expect(emailFrom("Afonso", staging)).toBe("Afonso (staging) <staging@example.test>");
    expect(() => emailFrom("Afonso", { APP_ENV: "staging" })).toThrow(StagingConfigError);
    expect(() => emailFrom("Afonso", { APP_ENV: "staging", STAGING_EMAIL_FROM: "ola@meuafonso.com" })).toThrow(StagingConfigError);
  });

  it("bot de Telegram: obrigatório e nunca o de produção", () => {
    expect(telegramBotUsername(staging)).toBe("AfonsoStagingBot");
    expect(() => telegramBotUsername({ APP_ENV: "staging" })).toThrow(StagingConfigError);
    expect(() => telegramBotUsername({ APP_ENV: "staging", TELEGRAM_BOT_USERNAME: "@AfonsoAIbot" })).toThrow(StagingConfigError);
  });

  it("deteta recursos de produção", () => {
    expect(touchesProductionResource("https://x.app.meuafonso.com")).toBe(true);
    expect(touchesProductionResource("https://ydwthwusdlxlgyreulsd.supabase.co")).toBe(true);
    expect(touchesProductionResource("https://app.meuafonso.com.evil.test")).toBe(false);
  });
});
