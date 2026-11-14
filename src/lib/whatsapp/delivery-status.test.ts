import { describe, it, expect, vi, afterEach } from "vitest";
import { applyDeliveryStatuses } from "./delivery-status.server";

function fakeDb(row: Record<string, unknown> | null) {
  const updates: Array<{ table: string; patch: any }> = [];
  const db = {
    from(table: string) {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle: async () => ({ data: row }),
        update(patch: any) {
          updates.push({ table, patch });
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  };
  return { db, updates };
}

afterEach(() => vi.restoreAllMocks());

describe("applyDeliveryStatuses", () => {
  it("guarda o código e o motivo da Meta quando a entrega falha", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { db, updates } = fakeDb({ id: "log-1", delivery_status: "sent", test_id: null });
    await applyDeliveryStatuses(db, [
      {
        id: "wamid.A",
        status: "failed",
        timestamp: "1794668400",
        errors: [{ code: 131047, title: "Re-engagement message", error_data: { details: "More than 24 hours have passed" } }],
      },
    ]);
    const p = updates[0].patch;
    expect(p.delivery_status).toBe("failed");
    expect(p.error_type).toBe("delivery_failed");
    expect(p.error_code).toBe(131047);
    expect(p.error_message).toContain("Re-engagement message");
    expect(p.error_message).toContain("2026-11-14T15:00:00.000Z");
  });

  it("entregue e lido ficam com a hora do fornecedor e sem campos de erro", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { db, updates } = fakeDb({ id: "log-1", delivery_status: "sent", test_id: null });
    await applyDeliveryStatuses(db, [{ id: "wamid.A", status: "read", timestamp: "1794668400" }]);
    expect(updates[0].patch).toEqual({ delivery_status: "read", read_at: "2026-11-14T15:00:00.000Z" });
  });

  it("nunca recua de lido para entregue", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const { db, updates } = fakeDb({ id: "log-1", delivery_status: "read", test_id: null });
    await applyDeliveryStatuses(db, [{ id: "wamid.A", status: "delivered", timestamp: "1794668400" }]);
    expect(updates).toHaveLength(0);
  });

  it("o registo estruturado não contém o número do destinatário", async () => {
    const lines: string[] = [];
    vi.spyOn(console, "error").mockImplementation((l: unknown) => { lines.push(String(l)); });
    const { db } = fakeDb({ id: "log-1", delivery_status: "sent", test_id: null });
    await applyDeliveryStatuses(db, [
      { id: "wamid.A", status: "failed", recipient_id: "351912345678", errors: [{ code: 131026, title: "Message undeliverable to 351912345678" }] } as any,
    ]);
    const ev = JSON.parse(lines[0]);
    expect(ev.stage).toBe("failed");
    expect(ev.provider_code).toBe(131026);
    expect(lines[0]).not.toContain("351912345678");
  });
});
