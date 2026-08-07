// Golden: pesquisar sem acentos tem de encontrar registos acentuados.
//
// Caso real (07/08): "Sergio Canelas" não encontrava "Sérgio Canelas".
// Estes testes correm as ferramentas reais de pesquisa contra um duplo do
// Postgres que reproduz as colunas geradas (`text_norm`) e o `ilike`.

import { describe, it, expect } from "vitest";
import { dispatchToolCall } from "@/lib/assessor/v2/domain.server";
import { foldText } from "@/lib/search/normalize";

type Row = Record<string, any>;

// Réplica das colunas geradas em produção (ver migração `text_norm`).
const GENERATED: Record<string, Record<string, (r: Row) => string>> = {
  people: { name_norm: (r) => foldText(r.name) },
  properties: {
    search_norm: (r) => foldText([r.title, r.location, r.city, r.address].map((v) => v ?? "").join(" ")),
  },
  uploaded_files: {
    search_norm: (r) =>
      foldText([r.original_file_name, r.ai_summary, r.document_type, r.doc_morada].map((v) => v ?? "").join(" ")),
  },
};

function pgFake(seed: Record<string, Row[]>) {
  const from = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    const value = (r: Row, col: string) => {
      const gen = GENERATED[table]?.[col];
      return gen ? gen(r) : (r[col] ?? null);
    };
    const like = (r: Row, col: string, pattern: string) =>
      String(value(r, col) ?? "").toLowerCase().includes(pattern.replace(/%/g, "").toLowerCase());
    const rows = () => (seed[table] ?? []).filter((r) => filters.every((f) => f(r)));
    const chain: any = {
      select: () => chain,
      eq: (c: string, v: any) => { filters.push((r) => value(r, c) === v); return chain; },
      is: (c: string, v: any) => { filters.push((r) => (r[c] ?? null) === v); return chain; },
      in: (c: string, v: any[]) => { filters.push((r) => v.includes(value(r, c))); return chain; },
      ilike: (c: string, p: string) => { filters.push((r) => like(r, c, p)); return chain; },
      or: (expr: string) => {
        const parts = expr.split(",").map((p) => p.split("."));
        filters.push((r) => parts.some(([col, op, ...rest]) => op === "ilike" && like(r, col, rest.join("."))));
        return chain;
      },
      order: () => chain,
      limit: () => chain,
      then: (ok: any, err: any) =>
        Promise.resolve({ data: rows(), error: null, count: rows().length }).then(ok, err),
    };
    return chain;
  };
  return { from } as any;
}

const ctx = (supabase: any) => ({ supabase, userId: "u1", channel: "web" as const });

describe("golden — pesquisa sem acentos", () => {
  it("Pessoas: 'Sergio Canelas' encontra 'Sérgio Canelas'", async () => {
    const sb = pgFake({
      people: [
        { id: "p1", user_id: "u1", name: "Sérgio Canelas", phone: "912000000", relationship_type: "client" },
        { id: "p2", user_id: "u1", name: "Ana Nogueira", relationship_type: "buyer" },
      ],
    });
    const r: any = await dispatchToolCall(ctx(sb) as any, "search_people", JSON.stringify({ query: "Sergio Canelas" }));
    expect(r.ok).toBe(true);
    expect(r.data.results.map((p: any) => p.name)).toEqual(["Sérgio Canelas"]);
  });

  it("Pessoas: com acento continua a encontrar (simétrico)", async () => {
    const sb = pgFake({ people: [{ id: "p1", user_id: "u1", name: "Sérgio Canelas" }] });
    const r: any = await dispatchToolCall(ctx(sb) as any, "search_people", JSON.stringify({ query: "Sérgio" }));
    expect(r.data.results).toHaveLength(1);
  });

  it("Imóveis: 'Sao Joao da Madeira' encontra morada acentuada", async () => {
    const sb = pgFake({
      properties: [
        {
          id: "i1", user_id: "u1", title: "Apartamento T2",
          address: "Rua da Estação", city: "São João da Madeira", location: "Centro", status: "angariado",
        },
        { id: "i2", user_id: "u1", title: "Moradia", city: "Braga", status: "angariado" },
      ],
    });
    const r: any = await dispatchToolCall(
      ctx(sb) as any, "search_properties", JSON.stringify({ query: "Sao Joao da Madeira" }),
    );
    expect(r.ok).toBe(true);
    expect(r.data.results.map((p: any) => p.id)).toEqual(["i1"]);
  });

  it("Imóveis: 'Rua da Estacao' (sem cedilha nem til) encontra a morada", async () => {
    const sb = pgFake({
      properties: [{ id: "i1", user_id: "u1", title: "T3", address: "Rua da Estação", city: "Aveiro" }],
    });
    const r: any = await dispatchToolCall(ctx(sb) as any, "search_properties", JSON.stringify({ query: "Rua da Estacao" }));
    expect(r.data.results).toHaveLength(1);
  });

  it("Drive: 'caderneta predial Sao Bras' encontra ficheiro acentuado", async () => {
    const sb = pgFake({
      uploaded_files: [
        {
          id: "f1", user_id: "u1", deleted_at: null, archived_at: null,
          original_file_name: "Caderneta Predial — São Brás.pdf",
          document_type: "caderneta_predial", ai_summary: "Prédio urbano em São Brás", mime_type: "application/pdf",
        },
        {
          id: "f2", user_id: "u1", deleted_at: null, archived_at: null,
          original_file_name: "Contrato Braga.pdf", document_type: "contrato", ai_summary: null,
        },
      ],
    });
    const r: any = await dispatchToolCall(ctx(sb) as any, "search_files", JSON.stringify({ query: "Sao Bras" }));
    expect(r.ok).toBe(true);
    expect(r.data.results.map((f: any) => f.id)).toEqual(["f1"]);
  });

  it("Drive: pesquisa vazia não filtra nada", async () => {
    const sb = pgFake({
      uploaded_files: [{ id: "f1", user_id: "u1", deleted_at: null, archived_at: null, original_file_name: "Certidão.pdf" }],
    });
    const r: any = await dispatchToolCall(ctx(sb) as any, "search_files", "{}");
    expect(r.data.results).toHaveLength(1);
  });
});
