import { describe, expect, it } from "vitest";
import { buildSparringSuppressionLog } from "./sparring-audit";

const base = { userId: "u1", channel: "dashboard", reason: "sparring_active" as const };

describe("auditoria do guard de treino", () => {
  it("registra ferramentas bloqueadas com a mensagem original", () => {
    const row = buildSparringSuppressionLog({
      ...base,
      message: "permita-me mostrar o que posso fazer por si e pelo seu apartamento",
      toolCalls: [{ name: "search_properties", args: { query: "apartamento" } }],
      memoryWrites: 1,
      action: "act",
      turns: 3,
    });
    expect(row?.action).toBe("sparring_blocked_tools");
    expect(row?.metadata["blocked_tools"]).toEqual(["search_properties"]);
    expect(row?.metadata["blocked_memory_writes"]).toBe(1);
    expect(row?.metadata["original_message"]).toContain("apartamento");
    expect(row?.metadata["guard_reason"]).toBe("sparring_active");
    expect(row?.reason).toContain("search_properties");
  });

  it("não escreve nada quando não houve supressão", () => {
    expect(buildSparringSuppressionLog({ ...base, message: "olá", toolCalls: [] })).toBeNull();
  });

  it("registra escritas de memória mesmo sem ferramentas", () => {
    const row = buildSparringSuppressionLog({ ...base, message: "o dono aceita 250 mil", memoryWrites: 2 });
    expect(row?.metadata["blocked_memory_writes"]).toBe(2);
    expect(row?.reason).toContain("escritas bloqueadas");
  });

  it("trunca mensagens longas e sinaliza-o", () => {
    const row = buildSparringSuppressionLog({
      ...base, message: "a".repeat(900), memoryWrites: 1,
    });
    expect(String(row?.metadata["original_message"]).length).toBe(500);
    expect(row?.metadata["original_message_truncated"]).toBe(true);
  });
});
