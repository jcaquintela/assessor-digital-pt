// Documentos no plano Base: 100 MB de espaço e 7 dias de janela.
// Confirma que nada disto se aplica a planos pagos nem a contas em arquivo
// de leitura (90 dias após descida de plano).

import { describe, it, expect, vi } from "vitest";
import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";

vi.mock("@/lib/assessor/primary-channel.server", () => ({
  sendOutbound: async () => ({ ok: true, channel: "telegram" }),
}));

import {
  canStoreDocument,
  documentsUsage,
  warnExpiringDocuments,
  archiveExpiredDocuments,
  BASE_DOCS_QUOTA_BYTES,
} from "./documents.server";

const USER = "33333333-3333-3333-3333-333333333333";
const NOW = new Date("2026-08-02T10:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 864e5).toISOString();

function seed(profile: Record<string, any> = {}, files: any[] = []) {
  return makeFakeSupabase({
    profiles: [{
      id: USER, subscription_tier: "base", readonly_until: null,
      docs_retention_warned_at: null, ...profile,
    }],
    uploaded_files: files,
    admin_audit_logs: [],
    people: [{ id: "p1", user_id: USER }],
  });
}

describe("documentos do plano Base", () => {
  it("bloqueia acima de 100 MB apenas no plano Base", async () => {
    const db = seed({}, [
      { id: "f1", user_id: USER, size_bytes: BASE_DOCS_QUOTA_BYTES, created_at: daysAgo(1), deleted_at: null },
    ]);
    expect((await documentsUsage(db as any, USER)).usedBytes).toBe(BASE_DOCS_QUOTA_BYTES);

    const blocked = await canStoreDocument(db as any, USER, 1024, "base");
    expect(blocked.ok).toBe(false);

    const paid = await canStoreDocument(db as any, USER, 1024, "pro");
    expect(paid.ok).toBe(true);
  });

  it("avisa ao 5.º dia e arquiva ao 7.º, sem tocar em registos", async () => {
    const db = seed({}, [
      { id: "f-old", user_id: USER, size_bytes: 10, created_at: daysAgo(9), deleted_at: null },
      { id: "f-new", user_id: USER, size_bytes: 10, created_at: daysAgo(1), deleted_at: null },
    ]);
    expect((await warnExpiringDocuments(db as any, { now: NOW })).warned).toEqual([USER]);

    const r = await archiveExpiredDocuments(db as any, { now: NOW });
    expect(r.archived).toBe(1);
    expect(db.state.uploaded_files.find((f: any) => f.id === "f-old")!.deleted_at).toBeTruthy();
    expect(db.state.uploaded_files.find((f: any) => f.id === "f-new")!.deleted_at).toBeNull();
    expect(db.state.people).toHaveLength(1);
  });

  it("não arquiva planos pagos nem contas em arquivo de leitura", async () => {
    const paid = seed({ subscription_tier: "pro" }, [
      { id: "f", user_id: USER, size_bytes: 10, created_at: daysAgo(30), deleted_at: null },
    ]);
    expect((await archiveExpiredDocuments(paid as any, { now: NOW })).archived).toBe(0);

    const readonly = seed({ readonly_until: new Date(NOW.getTime() + 60 * 864e5).toISOString() }, [
      { id: "f", user_id: USER, size_bytes: 10, created_at: daysAgo(30), deleted_at: null },
    ]);
    expect((await archiveExpiredDocuments(readonly as any, { now: NOW })).archived).toBe(0);
  });
});