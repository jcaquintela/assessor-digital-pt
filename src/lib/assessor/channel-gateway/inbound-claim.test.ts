import { describe, it, expect } from "vitest";
import { runInboundPipeline } from "./ingest.server";
import { claimInboundMessage } from "./inbound-claim.server";

// Simula a função atómica da base de dados (INSERT … ON CONFLICT).
function fakeSa(opts: { rpcError?: boolean } = {}) {
  const claims = new Set<string>();
  return {
    claims,
    rpc: async (_fn: string, a: any) => {
      await Promise.resolve();
      if (opts.rpcError) return { data: null, error: { code: "42883", message: "function does not exist" } };
      const k = `${a._channel}:${a._external_id}`;
      if (claims.has(k)) return { data: false, error: null };
      claims.add(k);
      return { data: true, error: null };
    },
    from: () => { throw new Error("not used"); },
  };
}

function adapter(counter: { n: number }) {
  return {
    channel: "whatsapp",
    replyUnassociated: "",
    isAlreadyProcessed: async () => { await new Promise((r) => setTimeout(r, 5)); return false; },
    interceptBeforeIngest: async () => { counter.n++; return { handled: true }; },
    persistInbound: async () => null,
    sendText: async () => ({ ok: true }),
  } as any;
}

const inbound = { channel: "whatsapp", externalMessageId: "wamid.X1", externalConversationId: "c", messageType: "text", text: "olá" } as any;

describe("mensagens recebidas — reserva atómica", () => {
  it("duas entregas simultâneas da mesma mensagem: só uma é tratada", async () => {
    const sa = fakeSa(); const c = { n: 0 };
    await Promise.all([runInboundPipeline(adapter(c), sa, inbound), runInboundPipeline(adapter(c), sa, inbound)]);
    expect(c.n).toBe(1);
  });

  it("mensagens diferentes não se bloqueiam", async () => {
    const sa = fakeSa(); const c = { n: 0 };
    await Promise.all([
      runInboundPipeline(adapter(c), sa, inbound),
      runInboundPipeline(adapter(c), sa, { ...inbound, externalMessageId: "wamid.X2" }),
    ]);
    expect(c.n).toBe(2);
  });

  it("mesmo id em canais diferentes não colide", async () => {
    const sa = fakeSa();
    expect(await claimInboundMessage(sa, "whatsapp", "1")).toBe("claimed");
    expect(await claimInboundMessage(sa, "telegram", "1")).toBe("claimed");
    expect(await claimInboundMessage(sa, "telegram", "1")).toBe("duplicate");
  });

  it("reserva indisponível nunca perde a mensagem (comportamento anterior)", async () => {
    const sa = fakeSa({ rpcError: true }); const c = { n: 0 };
    await runInboundPipeline(adapter(c), sa, inbound);
    expect(c.n).toBe(1);
    expect(await claimInboundMessage({}, "whatsapp", "x")).toBe("unavailable");
  });
});
