import { describe, it, expect } from "vitest";
import { isAllowedReturnUrl, isCheckoutPriceAllowed, stripePriceProblem } from "./checkout-policy";

describe("checkout — lista fechada no servidor", () => {
  it("aceita só os preços que vendemos", () => {
    for (const p of ["consultor_monthly", "consultor_yearly", "pro_monthly", "pro_yearly", "team_monthly", "team_yearly"])
      expect(isCheckoutPriceAllowed(p)).toBe(true);
    for (const p of ["pro_monthly_free", "price_123", "", "enterprise_monthly"]) expect(isCheckoutPriceAllowed(p)).toBe(false);
  });

  it("recusa preço do Stripe diferente, inativo, não recorrente ou noutra moeda", () => {
    const ok = { active: true, lookup_key: "pro_monthly", type: "recurring", currency: "eur" };
    expect(stripePriceProblem(ok, "pro_monthly")).toBeNull();
    expect(stripePriceProblem(undefined, "pro_monthly")).toBe("Price not found");
    expect(stripePriceProblem({ ...ok, lookup_key: "x" }, "pro_monthly")).toBe("Price mismatch");
    expect(stripePriceProblem({ ...ok, active: false }, "pro_monthly")).toBe("Price inactive");
    expect(stripePriceProblem({ ...ok, type: "one_time" }, "pro_monthly")).toBe("Price is not a subscription");
    expect(stripePriceProblem({ ...ok, currency: "usd" }, "pro_monthly")).toBe("Price currency not allowed");
  });

  it("regresso só para a própria app", () => {
    expect(isAllowedReturnUrl("https://app.meuafonso.com/subscricao?checkout=done")).toBe(true);
    expect(isAllowedReturnUrl("https://assessor-digital-pt.lovable.app/subscricao")).toBe(true);
    expect(isAllowedReturnUrl("https://id-preview--bf908ebc-1146-4c4f-a804-92bbc45c4e1a.lovable.app/x")).toBe(true);
    expect(isAllowedReturnUrl("http://localhost:8080/subscricao")).toBe(true);
    expect(isAllowedReturnUrl("https://evil.example.com/phish")).toBe(false);
    expect(isAllowedReturnUrl("https://app.meuafonso.com.evil.com/")).toBe(false);
    expect(isAllowedReturnUrl("http://app.meuafonso.com/")).toBe(false);
    expect(isAllowedReturnUrl("https://user:pw@app.meuafonso.com/")).toBe(false);
    expect(isAllowedReturnUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedReturnUrl("https://other-project.lovable.app/")).toBe(false);
  });
});
