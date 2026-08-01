import { describe, expect, it } from "vitest";
import { humanizeMiscText, humanizeMiscTitle, sanitizeMiscFields } from "./misc-text";

describe("misc-text", () => {
  it("converte JSON em texto português", () => {
    const out = humanizeMiscText('{"title":"Casa Final A","phone":"912345678"}');
    expect(out).toContain("Assunto: Casa Final A");
    expect(out).toContain("Telefone: 912345678");
    expect(out).not.toContain("{");
  });

  it("aceita objetos diretamente", () => {
    expect(humanizeMiscText({ name: "Ana", price: "250000" })).toContain("Nome: Ana");
  });

  it("deixa texto normal intacto", () => {
    expect(humanizeMiscText("Ligar à Ana amanhã")).toBe("Ligar à Ana amanhã");
  });

  it("nunca deixa chavetas em JSON partido", () => {
    expect(humanizeMiscText('{"title":"x",')).not.toMatch(/[{}"]/);
  });

  it("sanitiza campos de escrita", () => {
    const f = sanitizeMiscFields({
      title: '{"title":"Casa Teste","phone":"911"}',
      original_content: '{"notes":"sem interesse"}',
      summary: "",
    });
    expect(f.title).toBe("Assunto: Casa Teste");
    expect(f.original_content).toContain("Notas: sem interesse");
    expect(f.summary).toBeNull();
  });

  it("título tem fallback", () => {
    expect(humanizeMiscTitle("")).toBe("Nota sem título");
  });
});
