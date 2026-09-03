// Golden tests — eliminação permanente (Fase 1: Seguimentos e Diversos).
import { describe, it, expect, vi } from "vitest";
import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";
import { permanentlyDeleteRecord } from "./permanent-delete.server";
import { canConfirmPermanentDelete, PERMANENT_DELETE_DELAY_MS } from "./permanent-delete";

const USER = "df098797-b532-40bb-a298-003ef99fe81a";
const FU = "1903df4f-dd3e-4388-9d62-636bd2048ef5";
const MISC = "2b0f7a11-1c2e-4d55-9f66-77aa88bb99cc";

function baseDb(over: Record<string, any[]> = {}) {
  return makeFakeSupabase({
    follow_ups: [
      {
        id: FU,
        user_id: USER,
        title: "Visita com Sr. Almeida",
        type: "evento",
        status: "cancelado",
        archived_at: "2026-09-01T10:00:00.000Z",
      },
    ],
    reminders: [
      { id: "rem-1", user_id: USER, related_resource_type: "follow_up", related_resource_id: FU, status: "scheduled" },
    ],
    calendar_event_links: [
      { id: "lnk-1", user_id: USER, follow_up_id: FU, provider: "google", external_event_id: "ext-1" },
    ],
    miscellaneous_items: [
      { id: MISC, user_id: USER, title: "Ideia solta", status: "archived" },
    ],
    admin_audit_logs: [],
    ...over,
  });
}

describe("1. seguimento arquivado", () => {
  it("elimina, cancela o evento externo e remove lembretes", async () => {
    const sb = baseDb();
    const cancelExternal = vi.fn(async () => {});
    const res = await permanentlyDeleteRecord(
      sb as any,
      { userId: USER, type: "follow_up", id: FU, reason: "duplicado" },
      { cancelExternal },
    );
    expect(res.deleted).toBe(true);
    expect(cancelExternal).toHaveBeenCalledWith(USER, FU);
    expect(sb.state.follow_ups).toHaveLength(0);
    expect(sb.state.reminders).toHaveLength(0);
    expect(sb.state.calendar_event_links).toHaveLength(0);
  });
});

describe("2. nota arquivada em Diversos", () => {
  it("elimina o registo", async () => {
    const sb = baseDb();
    await permanentlyDeleteRecord(sb as any, {
      userId: USER,
      type: "miscellaneous",
      id: MISC,
      reason: "nota sem valor",
    });
    expect(sb.state.miscellaneous_items).toHaveLength(0);
  });
});

describe("3. registo não arquivado", () => {
  it("bloqueia sem exceção", async () => {
    const sb = baseDb({
      follow_ups: [{ id: FU, user_id: USER, title: "Ativo", status: "pendente", archived_at: null }],
      miscellaneous_items: [{ id: MISC, user_id: USER, title: "Nota ativa", status: "inbox" }],
    });
    await expect(
      permanentlyDeleteRecord(sb as any, { userId: USER, type: "follow_up", id: FU, reason: "engano" }),
    ).rejects.toThrow(/arquivado/i);
    await expect(
      permanentlyDeleteRecord(sb as any, { userId: USER, type: "miscellaneous", id: MISC, reason: "engano" }),
    ).rejects.toThrow(/arquivado/i);
    expect(sb.state.follow_ups).toHaveLength(1);
    expect(sb.state.miscellaneous_items).toHaveLength(1);
    expect(sb.state.admin_audit_logs).toHaveLength(0);
  });
});

describe("4. confirmação do modal", () => {
  it("sem checkbox ou antes dos 3 segundos não executa", () => {
    expect(canConfirmPermanentDelete({ acknowledged: false, elapsedMs: 10_000 })).toBe(false);
    expect(canConfirmPermanentDelete({ acknowledged: true, elapsedMs: 1_500 })).toBe(false);
    expect(canConfirmPermanentDelete({ acknowledged: true, elapsedMs: PERMANENT_DELETE_DELAY_MS })).toBe(true);
  });

  it("sem motivo o servidor recusa", async () => {
    const sb = baseDb();
    await expect(
      permanentlyDeleteRecord(sb as any, { userId: USER, type: "follow_up", id: FU, reason: " " }),
    ).rejects.toThrow(/motivo/i);
    expect(sb.state.follow_ups).toHaveLength(1);
  });
});

describe("5. auditoria", () => {
  it("grava o retrato completo e o motivo antes do delete", async () => {
    const sb = baseDb();
    await permanentlyDeleteRecord(
      sb as any,
      { userId: USER, type: "follow_up", id: FU, reason: "criado por engano" },
      { cancelExternal: async () => {} },
    );
    const logs = sb.state.admin_audit_logs as any[];
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe("registo.eliminacao_permanente.follow_up");
    expect(logs[0].reason).toBe("criado por engano");
    expect(logs[0].resource_id).toBe(FU);
    expect(logs[0].metadata.snapshot.title).toBe("Visita com Sr. Almeida");
    expect(logs[0].metadata.children.reminders).toHaveLength(1);
    expect(logs[0].metadata.children.calendar_event_links).toHaveLength(1);
  });
});
