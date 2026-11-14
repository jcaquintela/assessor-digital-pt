import { describe, it, expect } from "vitest";
import { resolveIsolationTarget } from "./storage-isolation.guard";

const APP = {
  VITE_SUPABASE_URL: "https://appref123.supabase.co",
  VITE_SUPABASE_PROJECT_ID: "appref123",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_app",
  SUPABASE_SERVICE_ROLE_KEY: "app-service",
};

describe("resolveIsolationTarget", () => {
  it("fica desligado por omissão, mesmo com as credenciais da aplicação presentes", () => {
    const t = resolveIsolationTarget({ ...APP });
    expect(t.enabled).toBe(false);
  });

  it("nunca recorre ao URL nem às chaves da aplicação", () => {
    const t = resolveIsolationTarget({ ...APP, ALLOW_REMOTE_STORAGE_ISOLATION_TEST: "1" });
    expect(t.enabled).toBe(false);
    expect(t.enabled === false && t.misconfigured).toBe(true);
  });

  it("recusa um URL de teste igual ao da aplicação", () => {
    const t = resolveIsolationTarget({
      ...APP,
      ALLOW_REMOTE_STORAGE_ISOLATION_TEST: "1",
      TEST_SUPABASE_URL: "https://appref123.supabase.co/",
      TEST_SUPABASE_PUBLISHABLE_KEY: "k",
      TEST_SUPABASE_SERVICE_ROLE_KEY: "s",
    });
    expect(t.enabled).toBe(false);
  });

  it("recusa um URL que contenha a referência do projeto da aplicação", () => {
    const t = resolveIsolationTarget({
      ...APP,
      ALLOW_REMOTE_STORAGE_ISOLATION_TEST: "1",
      TEST_SUPABASE_URL: "https://proxy.example.com/appref123",
      TEST_SUPABASE_PUBLISHABLE_KEY: "k",
      TEST_SUPABASE_SERVICE_ROLE_KEY: "s",
    });
    expect(t.enabled).toBe(false);
  });

  it("não aceita a chave de serviço da aplicação como chave de teste", () => {
    const t = resolveIsolationTarget({
      ...APP,
      ALLOW_REMOTE_STORAGE_ISOLATION_TEST: "1",
      TEST_SUPABASE_URL: "https://testref999.supabase.co",
      TEST_SUPABASE_PUBLISHABLE_KEY: "k",
    });
    expect(t.enabled).toBe(false);
  });

  it("aceita apenas um backend de teste dedicado e explícito", () => {
    const t = resolveIsolationTarget({
      ...APP,
      ALLOW_REMOTE_STORAGE_ISOLATION_TEST: "1",
      TEST_SUPABASE_URL: "https://testref999.supabase.co",
      TEST_SUPABASE_PUBLISHABLE_KEY: "k",
      TEST_SUPABASE_SERVICE_ROLE_KEY: "s",
    });
    expect(t.enabled).toBe(true);
    expect(t.enabled && t.serviceKey).toBe("s");
  });
});

describe("resolveRemoteTestTarget (teste de códigos promocionais)", () => {
  it("fica desligado mesmo com SUPABASE_URL e a chave de serviço da aplicação", async () => {
    const { resolveRemoteTestTarget } = await import("./storage-isolation.guard");
    const t = resolveRemoteTestTarget(
      { SUPABASE_URL: "https://appref123.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "app-service" },
      "ALLOW_REMOTE_PROMO_E2E_TEST",
    );
    expect(t.enabled).toBe(false);
  });
});
