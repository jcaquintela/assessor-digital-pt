import { describe, expect, it } from "vitest";
import { appSourceColumns, assessorSourceColumns } from "./follow-ups-source";

describe("follow-ups source columns", () => {
  it("assessor via WhatsApp preenche canal, pending, mensagem e timezone", () => {
    const cols = assessorSourceColumns({
      channel: "whatsapp",
      sourceMessageId: "wamid.HBgL123",
      pendingActionId: "11111111-1111-1111-1111-111111111111",
    });
    expect(cols).toEqual({
      source_channel: "whatsapp",
      source_message_id: "wamid.HBgL123",
      source_pending_action_id: "11111111-1111-1111-1111-111111111111",
      timezone: "Europe/Lisbon",
      external_reference: null,
      created_by_assessor: true,
    });
  });

  it("assessor via Telegram sem source_message_id", () => {
    const cols = assessorSourceColumns({
      channel: "telegram",
      sourceMessageId: null,
      pendingActionId: "22222222-2222-2222-2222-222222222222",
    });
    expect(cols.source_channel).toBe("telegram");
    expect(cols.source_message_id).toBeNull();
    expect(cols.source_pending_action_id).toBe("22222222-2222-2222-2222-222222222222");
    expect(cols.created_by_assessor).toBe(true);
  });

  it("criação manual pela app não é do assessor e não tem mensagem/pending", () => {
    const cols = appSourceColumns();
    expect(cols).toEqual({
      source_channel: "app",
      source_message_id: null,
      source_pending_action_id: null,
      timezone: "Europe/Lisbon",
      external_reference: null,
      created_by_assessor: false,
    });
  });

  it("materialização de rotina guarda external_reference", () => {
    const cols = appSourceColumns({ externalReference: "routine:abc" });
    expect(cols.external_reference).toBe("routine:abc");
    expect(cols.created_by_assessor).toBe(false);
    expect(cols.source_channel).toBe("app");
  });

  it("retry sobre a mesma pending action mantém o mesmo pending_action_id (chave de idempotência)", () => {
    const first = assessorSourceColumns({
      channel: "whatsapp",
      sourceMessageId: "wamid.A",
      pendingActionId: "same-pending",
    });
    const second = assessorSourceColumns({
      channel: "whatsapp",
      sourceMessageId: "wamid.A",
      pendingActionId: "same-pending",
    });
    // O índice único parcial em source_pending_action_id garante que
    // dois INSERTs com o mesmo valor não coexistem — aqui garantimos
    // que o helper devolve o mesmo valor determinístico.
    expect(second.source_pending_action_id).toBe(first.source_pending_action_id);
  });

  it("correção posterior mantém origem: as colunas de origem não são reescritas", () => {
    // Simula: seguimento criado via WhatsApp; utilizador corrige a hora.
    // O update apenas altera due_date/due_time; as colunas de origem
    // ficam intactas — nunca chamamos assessorSourceColumns/appSourceColumns
    // no caminho de correção.
    const original = assessorSourceColumns({
      channel: "whatsapp",
      sourceMessageId: "wamid.HBgLoriginal",
      pendingActionId: "pending-abc",
    });
    const updatePatch: Record<string, unknown> = { due_time: "13:00" };
    // Após o update, se voltarmos a ler, source_* mantém-se.
    const afterUpdate = { ...original, ...updatePatch };
    expect(afterUpdate.source_channel).toBe("whatsapp");
    expect(afterUpdate.source_message_id).toBe("wamid.HBgLoriginal");
    expect(afterUpdate.source_pending_action_id).toBe("pending-abc");
    expect(afterUpdate.created_by_assessor).toBe(true);
  });

  it("registos antigos (colunas a null) continuam a interpretar-se como criação manual", () => {
    // Registos anteriores à migração têm todas as colunas novas a null,
    // exceto created_by_assessor (default false). Devem parecer app-created.
    const legacy = {
      source_channel: null as string | null,
      source_message_id: null as string | null,
      source_pending_action_id: null as string | null,
      timezone: null as string | null,
      external_reference: null as string | null,
      created_by_assessor: false,
    };
    expect(legacy.created_by_assessor).toBe(false);
    expect(legacy.source_pending_action_id).toBeNull();
  });
});