import { describe, it, expect, vi, afterEach } from "vitest";
import { summarizeForName, SHORT_NAME_MODEL } from "./short-name.server";
import { cleanShortName } from "../drive/short-name";

const AUDIO = "Bom dia, Afonso. Cancela os lembretes de contactar a Maria sobre a visita de amanhã.";

function mockGateway(content: string | null, finish = "stop") {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({
      choices: [{ finish_reason: finish, message: { content } }],
      usage: { prompt_tokens: 55, completion_tokens: 5 },
    }),
  })) as unknown as typeof fetch;
}

afterEach(() => vi.unstubAllGlobals());

describe("summarizeForName", () => {
  it("usa modelo sem raciocínio", () => {
    expect(SHORT_NAME_MODEL).toBe("google/gemini-2.5-flash-lite");
  });

  it("gera nome para o áudio de cancelar lembretes", async () => {
    process.env['LOVABLE_API_KEY'] ||= "test";
    vi.stubGlobal("fetch", mockGateway("Cancelar lembretes contacto Maria"));
    const r = await summarizeForName(AUDIO);
    expect(r.ok).toBe(true);
    if (r.ok) expect(cleanShortName(r.summary)).toBe("Cancelar lembretes contacto Maria");
  });

  it("recusa resposta truncada em vez de gravar lixo", async () => {
    process.env['LOVABLE_API_KEY'] ||= "test";
    vi.stubGlobal("fetch", mockGateway("Aqui estão algumas opções de títulos de 4 pala", "length"));
    const r = await summarizeForName(AUDIO);
    expect(r.ok).toBe(false);
  });

  it("recusa resposta vazia", async () => {
    process.env['LOVABLE_API_KEY'] ||= "test";
    vi.stubGlobal("fetch", mockGateway(null));
    expect((await summarizeForName(AUDIO)).ok).toBe(false);
  });
});
