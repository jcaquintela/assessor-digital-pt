import { describe, it, expect } from "vitest";
import { decideSync, profileLookupFromEvent } from "./billing-sync";

const stripeProfile = { id: "u1", billing_source: "stripe" as const, billing_manual_lock: false };
const manualProfile = { id: "u2", billing_source: "manual" as const, billing_manual_lock: true };

function subEvent(type: string, status: string, priceId = "pro_monthly") {
  return {
    type,
    object: {
      id: "sub_1",
      customer: "cus_1",
      status,
      metadata: { userId: "u1" },
      items: { data: [{ price: { lookup_key: priceId, id: "price_x" } }] },
    },
  };
}

describe("sincronização de subscrições", () => {
  it("1. checkout concluído adota a sincronização e guarda cliente/subscrição", () => {
    const d = decideSync(
      {
        type: "checkout.session.completed",
        object: { client_reference_id: "u1", customer: "cus_1", subscription: "sub_1" },
      },
      { id: "u1", billing_source: "manual", billing_manual_lock: false },
    );
    expect(d.action).toBe("update");
    if (d.action !== "update") return;
    expect(d.patch.billing_source).toBe("stripe");
    expect(d.patch.stripe_customer_id).toBe("cus_1");
    expect(d.patch.stripe_subscription_id).toBe("sub_1");
  });

  it("1b. subscrição ativa atualiza plano e estado", () => {
    const d = decideSync(subEvent("customer.subscription.updated", "active"), stripeProfile);
    if (d.action !== "update") throw new Error("esperava update");
    expect(d.patch.billing_status).toBe("active");
    expect(d.patch.subscription_tier).toBe("pro");
    expect(d.patch.stripe_price_id).toBe("pro_monthly");
  });

  it("1c. plano Team vem do preço anual", () => {
    const d = decideSync(subEvent("customer.subscription.updated", "active", "team_yearly"), stripeProfile);
    if (d.action !== "update") throw new Error("esperava update");
    expect(d.patch.subscription_tier).toBe("hub");
  });

  it("2. cancelamento volta ao plano Base", () => {
    const d = decideSync(subEvent("customer.subscription.deleted", "canceled"), stripeProfile);
    if (d.action !== "update") throw new Error("esperava update");
    expect(d.patch.billing_status).toBe("canceled");
    expect(d.patch.subscription_tier).toBe("base");
  });

  it("3. pagamento falhado assinala atraso sem cortar o plano", () => {
    const d = decideSync(
      { type: "invoice.payment_failed", object: { customer: "cus_1", subscription: "sub_1" } },
      stripeProfile,
    );
    if (d.action !== "update") throw new Error("esperava update");
    expect(d.patch.billing_status).toBe("past_due");
    expect(d.patch.subscription_tier).toBeUndefined();
  });

  it("3b. subscrição em atraso mantém o plano atual", () => {
    const d = decideSync(subEvent("customer.subscription.updated", "past_due"), stripeProfile);
    if (d.action !== "update") throw new Error("esperava update");
    expect(d.patch.subscription_tier).toBeUndefined();
  });

  it("4. a mesma decisão repetida produz o mesmo resultado (idempotente)", () => {
    const e = subEvent("customer.subscription.updated", "active");
    expect(decideSync(e, stripeProfile)).toEqual(decideSync(e, stripeProfile));
  });

  it("5. conta em gestão manual é ignorada e registada", () => {
    const d = decideSync(subEvent("customer.subscription.updated", "active"), manualProfile);
    expect(d).toEqual({ action: "skip", reason: "skipped: manual override" });
    const c = decideSync(
      { type: "checkout.session.completed", object: { client_reference_id: "u2" } },
      manualProfile,
    );
    expect(c.action).toBe("skip");
  });

  it("6. sem perfil correspondente nada é escrito", () => {
    expect(decideSync(subEvent("customer.subscription.updated", "active"), null).action).toBe("skip");
  });

  it("liga o evento ao consultor certo", () => {
    expect(
      profileLookupFromEvent({
        type: "checkout.session.completed",
        object: { client_reference_id: "u9", customer: "cus_9", subscription: "sub_9" },
      }),
    ).toEqual({ userId: "u9", customerId: "cus_9", subscriptionId: "sub_9" });
  });
});