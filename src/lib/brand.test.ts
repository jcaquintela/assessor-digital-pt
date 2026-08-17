import { BRAND_NAME, adminTitle, appTitle } from "@/lib/brand";
import { describe, expect, it } from "vitest";
import { APP_NAME } from "@/lib/seo/module-names";
import { ASSESSOR_NAME_DEFAULT } from "@/lib/assessor/assessor-name";

describe("nome do assistente centralizado", () => {
  it("todas as constantes derivam de BRAND_NAME", () => {
    expect(APP_NAME).toBe(BRAND_NAME);
    expect(ASSESSOR_NAME_DEFAULT).toBe(BRAND_NAME);
  });

  it("títulos usam sempre o mesmo nome", () => {
    expect(appTitle("Planos")).toBe(`Planos — ${BRAND_NAME}`);
    expect(adminTitle("Custos")).toBe(`Custos — ${BRAND_NAME} admin`);
  });
});
