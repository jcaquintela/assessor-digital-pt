import { describe, it, expect } from "vitest";
import { resolveCommand, parseCommand, UNKNOWN_COMMAND_REPLY, HELP_REPLY } from "./commands";

describe("comandos de barra", () => {
  it("reconhece /ajuda e variantes", () => {
    for (const c of ["/ajuda", "/help", "/comandos", "/start", "/Ajuda", "/start@afonso_bot"]) {
      const r = resolveCommand(c);
      expect(r.kind).toBe("reply");
      if (r.kind === "reply") expect(r.reply).toBe(HELP_REPLY);
    }
  });

  it("reescreve comandos que equivalem a frases normais", () => {
    expect(resolveCommand("/novidades")).toMatchObject({ kind: "rewrite" });
    expect(resolveCommand("/agenda")).toMatchObject({ kind: "rewrite", content: "O que tenho hoje?" });
    expect(resolveCommand("/entrar")).toMatchObject({ kind: "rewrite", content: "entrar" });
  });

  // Golden: comando desconhecido nunca devolve eco genérico.
  it("comando desconhecido responde explicitamente que não é reconhecido", () => {
    for (const c of ["/novo", "/starr", "/xpto", "/start2"]) {
      const r = resolveCommand(c);
      expect(r.kind).toBe("unknown");
      if (r.kind === "unknown") {
        expect(r.reply).toBe(UNKNOWN_COMMAND_REPLY);
        expect(r.reply).toMatch(/não reconheço/i);
        expect(r.reply).toMatch(/\/ajuda/);
        expect(r.reply).not.toMatch(/estou aqui/i);
      }
    }
  });

  it("texto normal não é comando", () => {
    for (const t of ["olá", "Marca visita amanhã às 10h", "e/ou", ""]) {
      expect(resolveCommand(t)).toEqual({ kind: "none" });
      expect(parseCommand(t)).toBeNull();
    }
  });

  it("guarda argumentos do comando", () => {
    expect(parseCommand("/start ABC123")).toEqual({ name: "start", args: "ABC123" });
  });
});