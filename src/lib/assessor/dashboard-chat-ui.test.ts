import { describe, it, expect } from "vitest";
import {
  makePending,
  reconcilePending,
  isSettled,
  withTimeout,
} from "./dashboard-chat-ui";
import { resolveCommand, HELP_REPLY, UNKNOWN_COMMAND_REPLY } from "./commands";
import { dashboardAdapter } from "./channel-gateway/dashboard-adapter";
import { whatsappAdapter } from "./channel-gateway/whatsapp-adapter";

describe("conversa do painel — mensagem do consultor visível de imediato", () => {
  it("a pendente mantém-se enquanto a linha real não chega", () => {
    const p = makePending("Marca visita amanhã");
    expect(isSettled(p, [])).toBe(false);
    expect(reconcilePending([p], [])).toHaveLength(1);
  });

  it("a pendente sai quando a mesma mensagem chega da base de dados", () => {
    const p = makePending("Marca visita amanhã");
    const msgs = [
      { id: "1", role: "user", content: "Marca visita amanhã", created_at: new Date().toISOString() },
    ];
    expect(isSettled(p, msgs)).toBe(true);
    expect(reconcilePending([p], msgs)).toHaveLength(0);
  });

  it("uma pendente falhada fica à vista para o consultor tentar de novo", () => {
    const p = { ...makePending("Olá"), failed: true };
    const msgs = [{ id: "1", role: "user", content: "Olá", created_at: new Date().toISOString() }];
    expect(reconcilePending([p], msgs)).toHaveLength(1);
  });
});

describe("nunca um spinner sem fim", () => {
  it("resolve quando o servidor responde", async () => {
    const r = await withTimeout(Promise.resolve("ok"), 50);
    expect(r).toEqual({ ok: true, value: "ok" });
  });

  it("desiste quando o servidor não responde", async () => {
    const r = await withTimeout(new Promise(() => {}), 20);
    expect(r).toEqual({ ok: false, timedOut: true });
  });
});

describe("comandos de barra no painel", () => {
  it("/start dá a ajuda, /novo e /starr dizem que não são reconhecidos", () => {
    const start = resolveCommand("/start");
    expect(start).toEqual({ kind: "reply", reply: HELP_REPLY, command: "start" });
    for (const c of ["/novo", "/starr"]) {
      const r = resolveCommand(c);
      expect(r.kind).toBe("unknown");
      if (r.kind === "unknown") expect(r.reply).toBe(UNKNOWN_COMMAND_REPLY);
    }
    // Nunca a mesma resposta para os três.
    expect(resolveCommand("/start")).not.toEqual(resolveCommand("/novo"));
  });

  it("comandos colados deixavam de ser comandos — por isso o painel não junta rajadas", () => {
    // Colados, os três viram um só turno e perdem-se: só o primeiro conta.
    expect(resolveCommand("/novo\n/starr\n/start")).toMatchObject({
      kind: "unknown",
      command: "novo",
    });
    expect(dashboardAdapter.coalesceBursts).toBe(false);
    // WhatsApp mantém a junção de rajadas — pipeline intocado.
    expect(whatsappAdapter.coalesceBursts).not.toBe(false);
  });
});
