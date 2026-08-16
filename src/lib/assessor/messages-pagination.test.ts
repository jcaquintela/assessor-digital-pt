import { describe, expect, it } from "vitest";
import { mergeMessages, type MensagemDb } from "./messages";

const m = (id: string, created_at: string): MensagemDb => ({
  id, created_at, role: "user", content: id,
  message_type: null, structured_payload: null, status: null,
});

describe("paginação do histórico", () => {
  it("cola as antigas antes das recentes, sem duplicar", () => {
    const older = [m("1", "2026-08-01T10:00:00Z"), m("2", "2026-08-02T10:00:00Z")];
    const recent = [m("2", "2026-08-02T10:00:00Z"), m("3", "2026-08-03T10:00:00Z")];
    expect(mergeMessages(older, recent).map((x) => x.id)).toEqual(["1", "2", "3"]);
  });

  it("nunca perde mensagens novas ao carregar antigas", () => {
    const recent = [m("9", "2026-08-16T08:00:00Z")];
    const older = [m("5", "2026-08-10T08:00:00Z")];
    expect(mergeMessages(older, recent).map((x) => x.id)).toEqual(["5", "9"]);
  });
});
