import { describe, it, expect } from "vitest";
import { processStripeEvent } from "./webhook-process.server";
import { claimVerdict, WebhookInFlightError, WEBHOOK_PENDING_STALE_MS } from "./webhook-claim";

// Base de dados falsa mínima: stripe_webhook_events (event_id único) + profiles.
function fakeDb(opts: { failProfileUpdates?: number; insertError?: { code?: string; message: string }; testAccounts?: string[]; profile?: Record<string, any> } = {}) {
  const events: any[] = [];
  const testAccounts = (opts.testAccounts ?? []).map((user_id) => ({ user_id }));
  const profiles: Record<string, any> = {
    u1: { id: "u1", billing_source: "stripe", billing_manual_lock: false, subscription_tier: "base", billing_environment: "sandbox", billing_last_event_at: null, ...(opts.profile ?? {}) },
  };
  let profileFailures = opts.failProfileUpdates ?? 0;
  let profileWrites = 0;
  let seq = 0;

  function table(name: string) {
    const filters: [string, string, any][] = [];
    let op: "select" | "insert" | "update" = "select";
    let payload: any = null;
    const match = (r: any) => filters.every(([k, kind, v]) => (kind === "is" ? r[k] == null : r[k] === v));
    const run = async (mode: "many" | "one") => {
      if (name === "stripe_webhook_events") {
        if (op === "insert") {
          if (opts.insertError) return { data: null, error: opts.insertError };
          if (events.some((e) => e.event_id === payload.event_id))
            return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
          const row = { id: `r${++seq}`, processed_at: new Date().toISOString(), detail: null, ...payload };
          events.push(row);
          return { data: { id: row.id }, error: null };
        }
        if (op === "update") {
          const hit = events.filter(match);
          hit.forEach((r) => Object.assign(r, payload));
          return { data: hit.map((r) => ({ id: r.id })), error: null };
        }
        const hit = events.filter(match);
        return { data: mode === "one" ? hit[0] ?? null : hit, error: null };
      }
      if (name === "billing_test_accounts") {
        const hit = testAccounts.filter(match);
        return { data: mode === "one" ? hit[0] ?? null : hit, error: null };
      }
      // profiles
      if (op === "update") {
        if (profileFailures > 0) { profileFailures--; return { data: null, error: { message: "db down" } }; }
        const hit = Object.values(profiles).filter(match);
        hit.forEach((r) => Object.assign(r, payload));
        profileWrites++;
        return { data: hit, error: null };
      }
      const hit = Object.values(profiles).filter(match);
      return { data: mode === "one" ? hit[0] ?? null : hit, error: null };
    };
    const q: any = {
      insert: (p: any) => { op = "insert"; payload = p; return q; },
      update: (p: any) => { op = "update"; payload = p; return q; },
      select: () => q,
      eq: (k: string, v: any) => { filters.push([k, "eq", v]); return q; },
      is: (k: string) => { filters.push([k, "is", null]); return q; },
      maybeSingle: () => run("one"),
      single: () => run("one"),
      then: (res: any, rej: any) => run("many").then(res, rej),
    };
    return q;
  }
  return { sa: { from: table }, events, profiles, writes: () => profileWrites };
}

const subUpdated = (id = "evt_1", created?: number, status = "active") => ({
  id,
  created,
  type: "customer.subscription.updated",
  data: { object: { id: "sub_1", customer: "cus_1", status, metadata: { userId: "u1" },
    items: { data: [{ price: { lookup_key: "pro_monthly" } }] } } },
});

describe("webhook de pagamentos — idempotência e reprocessamento", () => {
  it("primeira entrega aplica o plano e fica processed", async () => {
    const db = fakeDb();
    expect(await processStripeEvent(db.sa, subUpdated(), "live")).toBe("applied");
    expect(db.profiles.u1.subscription_tier).toBe("pro");
    expect(db.events[0].outcome).toBe("processed");
  });

  it("reenvio de evento já aplicado não volta a escrever", async () => {
    const db = fakeDb();
    await processStripeEvent(db.sa, subUpdated(), "live");
    expect(await processStripeEvent(db.sa, subUpdated(), "live")).toBe("duplicate");
    expect(db.writes()).toBe(1);
  });

  it("falha a meio fica failed e o reenvio do Stripe volta a aplicar (antes era ignorado)", async () => {
    const db = fakeDb({ failProfileUpdates: 1 });
    await expect(processStripeEvent(db.sa, subUpdated(), "live")).rejects.toThrow("db down");
    expect(db.events[0].outcome).toBe("failed");
    expect(db.profiles.u1.subscription_tier).toBe("base");
    expect(await processStripeEvent(db.sa, subUpdated(), "live")).toBe("applied");
    expect(db.profiles.u1.subscription_tier).toBe("pro");
    expect(db.events).toHaveLength(1);
    expect(db.events[0].outcome).toBe("processed");
  });

  it("entrega simultânea com outra ainda a tratar → em curso (409), sem escrita dupla", async () => {
    const db = fakeDb();
    db.events.push({ id: "r9", event_id: "evt_1", outcome: "pending", processed_at: new Date().toISOString() });
    await expect(processStripeEvent(db.sa, subUpdated(), "live")).rejects.toBeInstanceOf(WebhookInFlightError);
    expect(db.writes()).toBe(0);
  });

  it("pendente antigo (entrega anterior morreu) é retomado", async () => {
    const db = fakeDb();
    const old = new Date(Date.now() - WEBHOOK_PENDING_STALE_MS - 1000).toISOString();
    db.events.push({ id: "r9", event_id: "evt_1", outcome: "pending", processed_at: old });
    expect(await processStripeEvent(db.sa, subUpdated(), "live")).toBe("applied");
  });

  it("erro de gravação que não é duplicado deixa de ser tratado como repetido", async () => {
    const db = fakeDb({ insertError: { code: "08006", message: "connection failure" } });
    await expect(processStripeEvent(db.sa, subUpdated(), "live")).rejects.toThrow(/claim failed/);
    expect(db.writes()).toBe(0);
  });

  it("dois reenvios em paralelo de um evento falhado: só um reabre e aplica", async () => {
    const db = fakeDb();
    db.events.push({ id: "r9", event_id: "evt_1", outcome: "failed", processed_at: "2026-11-01T00:00:00.000Z" });
    const r = await Promise.allSettled([
      processStripeEvent(db.sa, subUpdated(), "live"),
      processStripeEvent(db.sa, subUpdated(), "live"),
    ]);
    const applied = r.filter((x) => x.status === "fulfilled" && x.value === "applied").length;
    expect(applied).toBe(1);
    expect(db.writes()).toBe(1);
  });

  it("claimVerdict: regras", () => {
    const now = Date.now();
    expect(claimVerdict({ id: "a", outcome: "processed", processed_at: null }, now)).toBe("done");
    expect(claimVerdict({ id: "a", outcome: "skipped", processed_at: null }, now)).toBe("done");
    expect(claimVerdict({ id: "a", outcome: "failed", processed_at: new Date(now).toISOString() }, now)).toBe("retry");
    expect(claimVerdict({ id: "a", outcome: "pending", processed_at: new Date(now - 1000).toISOString() }, now)).toBe("in_flight");
  });

  it("ambiente live grava billing_environment=live", async () => {
    const db = fakeDb();
    await processStripeEvent(db.sa, subUpdated(), "live");
    expect(db.profiles.u1.billing_environment).toBe("live");
  });
});

describe("pagamentos de teste nunca mexem em planos reais", () => {
  it("evento de teste numa conta real é ignorado e o plano não muda", async () => {
    const db = fakeDb();
    expect(await processStripeEvent(db.sa, subUpdated(), "sandbox")).toBe("skipped");
    expect(db.profiles.u1.subscription_tier).toBe("base");
    expect(db.events[0].detail).toMatch(/teste ignorado/);
    expect(db.writes()).toBe(0);
  });

  it("evento de teste numa conta da lista de teste aplica", async () => {
    const db = fakeDb({ testAccounts: ["u1"] });
    expect(await processStripeEvent(db.sa, subUpdated(), "sandbox")).toBe("applied");
    expect(db.profiles.u1.subscription_tier).toBe("pro");
  });

  it("evento de teste nunca toca numa conta com pagamentos reais, mesmo na lista de teste", async () => {
    const db = fakeDb({ testAccounts: ["u1"], profile: { billing_environment: "live" } });
    expect(await processStripeEvent(db.sa, subUpdated(), "sandbox")).toBe("skipped");
    expect(db.writes()).toBe(0);
  });
});

describe("ordem dos eventos", () => {
  const T = 1_800_000_000;
  it("updated antigo depois de deleted não reativa", async () => {
    const db = fakeDb();
    await processStripeEvent(db.sa, { id: "evt_del", type: "customer.subscription.deleted", created: T + 10,
      data: { object: { id: "sub_1", customer: "cus_1", metadata: { userId: "u1" } } } }, "live");
    expect(db.profiles.u1.subscription_tier).toBe("base");
    expect(await processStripeEvent(db.sa, subUpdated("evt_old", T), "live")).toBe("skipped");
    expect(db.profiles.u1.subscription_tier).toBe("base");
    expect(db.profiles.u1.billing_status).toBe("canceled");
  });

  it("eventos em ordem inversa acabam no estado mais recente", async () => {
    const db = fakeDb();
    await processStripeEvent(db.sa, subUpdated("evt_new", T + 5, "past_due"), "live");
    expect(await processStripeEvent(db.sa, subUpdated("evt_older", T, "active"), "live")).toBe("skipped");
    expect(db.profiles.u1.billing_status).toBe("past_due");
  });

  it("empate no mesmo segundo relê a subscrição no Stripe", async () => {
    const db = fakeDb({ profile: { billing_last_event_at: new Date(T * 1000).toISOString() } });
    let asked = 0;
    await processStripeEvent(db.sa, subUpdated("evt_tie", T, "active"), "live", Date.now(), {
      retrieveSubscription: async () => { asked++; return { id: "sub_1", customer: "cus_1", status: "canceled", metadata: { userId: "u1" }, items: { data: [] } }; },
    });
    expect(asked).toBe(1);
    expect(db.profiles.u1.billing_status).toBe("canceled");
  });
});
