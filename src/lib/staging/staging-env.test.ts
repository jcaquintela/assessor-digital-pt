import { describe, expect, it } from "vitest";
import { checkStagingIsolation, deploymentEnv, isStagingRecipientAllowed } from "./staging-env";
import {
  STAGING_DB_PREFLIGHT_SQL,
  STAGING_SANITIZE_SQL,
  buildSyntheticDataset,
  syntheticViolations,
} from "./synthetic-fixtures";

const good = {
  APP_ENV: "staging",
  SUPABASE_URL: "https://stagingref000000000.supabase.co",
  VITE_SUPABASE_PROJECT_ID: "stagingref000000000",
  STRIPE_SANDBOX_API_KEY: "sk_test_x",
  TELEGRAM_BOT_USERNAME: "AfonsoStagingBot",
  WHATSAPP_PHONE_NUMBER_ID: "111",
  STAGING_WHATSAPP_PHONE_NUMBER_ID: "111",
  STAGING_ALLOWED_RECIPIENTS: "9990000001, 9000000000001",
  STAGING_APP_URL: "https://afonso-staging.lovable.app",
};
const status = (env: Record<string, string | undefined>, id: string) =>
  checkStagingIsolation(env).checks.find((c) => c.id === id)?.status;

describe("staging — isolamento", () => {
  it("sem APP_ENV=staging é produção e não está isolado", () => {
    expect(deploymentEnv({})).toBe("production");
    expect(checkStagingIsolation({}).isolated).toBe(false);
  });

  it("o ambiente atual (backend da produção) nunca passa como staging", () => {
    const env = { ...good, SUPABASE_URL: "https://ydwthwusdlxlgyreulsd.supabase.co" };
    expect(status(env, "backend_separado")).toBe("fail");
    expect(checkStagingIsolation(env).isolated).toBe(false);
  });

  it("credencial Stripe de produção bloqueia", () => {
    expect(status({ ...good, STRIPE_SANDBOX_API_KEY: "sk_live_x" }, "stripe_so_teste")).toBe("fail");
    expect(status({ ...good, STRIPE_LIVE_API_KEY: "whatever" }, "stripe_so_teste")).toBe("fail");
  });

  it("bot Telegram de produção ou por definir bloqueia", () => {
    expect(status({ ...good, TELEGRAM_BOT_USERNAME: "@AfonsoAIbot" }, "telegram_bot_teste")).toBe("fail");
    expect(status({ ...good, TELEGRAM_BOT_USERNAME: undefined }, "telegram_bot_teste")).toBe("fail");
  });

  it("número WhatsApp não declarado como de teste bloqueia; declarado exige confirmação manual", () => {
    expect(status({ ...good, STAGING_WHATSAPP_PHONE_NUMBER_ID: "222" }, "whatsapp_numero_teste")).toBe("fail");
    expect(status(good, "whatsapp_numero_teste")).toBe("manual");
  });

  it("endereço da app de produção bloqueia", () => {
    expect(status({ ...good, STAGING_APP_URL: "https://app.meuafonso.com" }, "url_staging")).toBe("fail");
  });

  it("configuração completa de teste passa (com o WhatsApp a confirmar manualmente)", () => {
    expect(checkStagingIsolation(good).isolated).toBe(true);
  });

  it("em staging só sai para destinatários de teste; em produção nada muda", () => {
    expect(isStagingRecipientAllowed(good, "+999 000 0001")).toBe(true);
    expect(isStagingRecipientAllowed(good, "351910000000")).toBe(false);
    expect(isStagingRecipientAllowed({ ...good, STAGING_ALLOWED_RECIPIENTS: "" }, "9990000001")).toBe(false);
    expect(isStagingRecipientAllowed({}, "351910000000")).toBe(true);
  });
});

describe("staging — dados sintéticos", () => {
  it("todos os valores são sintéticos", () => {
    const ds = buildSyntheticDataset();
    expect(ds.consultants).toHaveLength(3);
    expect(syntheticViolations(ds)).toEqual([]);
  });

  it("deteta um número português real misturado", () => {
    const ds = buildSyntheticDataset();
    ds.people[0].phone = "351912345678";
    expect(syntheticViolations(ds).length).toBeGreaterThan(0);
  });

  it("a limpeza só corre depois da barreira que recusa bases com contas reais", () => {
    expect(STAGING_DB_PREFLIGHT_SQL).toContain("RAISE EXCEPTION");
    expect(STAGING_SANITIZE_SQL.indexOf("RAISE EXCEPTION")).toBeLessThan(STAGING_SANITIZE_SQL.indexOf("DELETE"));
  });
});
