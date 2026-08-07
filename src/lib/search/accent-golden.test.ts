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

describe("golden — sem acentos com correspondência parcial (substring)", () => {
  it("Pessoas: primeiro nome parcial 'serg' encontra 'Sérgio Canelas'", async () => {
    const sb = pgFake({
      people: [
        { id: "p1", user_id: "u1", name: "Sérgio Canelas" },
        { id: "p2", user_id: "u1", name: "Ana Costa" },
      ],
    });
    const r: any = await dispatchToolCall(ctx(sb) as any, "search_people", JSON.stringify({ query: "serg" }));
    expect(r.data.results.map((p: any) => p.id)).toEqual(["p1"]);
  });

  it("Pessoas: apelido parcial 'canel' encontra o registo acentuado", async () => {
    const sb = pgFake({ people: [{ id: "p1", user_id: "u1", name: "Sérgio Canelas" }] });
    const r: any = await dispatchToolCall(ctx(sb) as any, "search_people", JSON.stringify({ query: "canel" }));
    expect(r.data.results).toHaveLength(1);
  });

  it("Pessoas: substring no meio do nome ('conceicao') encontra 'Maria da Conceição Sá'", async () => {
    const sb = pgFake({ people: [{ id: "p1", user_id: "u1", name: "Maria da Conceição Sá" }] });
    const r: any = await dispatchToolCall(ctx(sb) as any, "search_people", JSON.stringify({ query: "conceicao" }));
    expect(r.data.results).toHaveLength(1);
  });

  it("Imóveis: 'estacao' (parcial, sem acento) encontra 'Rua da Estação'", async () => {
    const sb = pgFake({
      properties: [
        { id: "i1", user_id: "u1", title: "T3", address: "Rua da Estação", city: "Aveiro" },
        { id: "i2", user_id: "u1", title: "T2", address: "Rua do Sol", city: "Braga" },
      ],
    });
    const r: any = await dispatchToolCall(ctx(sb) as any, "search_properties", JSON.stringify({ query: "estacao" }));
    expect(r.data.results.map((p: any) => p.id)).toEqual(["i1"]);
  });

  it("Imóveis: 'sao joao' encontra cidade acentuada por substring", async () => {
    const sb = pgFake({
      properties: [{ id: "i1", user_id: "u1", title: "Apartamento T2", city: "São João da Madeira" }],
    });
    const r: any = await dispatchToolCall(ctx(sb) as any, "search_properties", JSON.stringify({ query: "sao joao" }));
    expect(r.data.results).toHaveLength(1);
  });

  it("Imóveis: substring que não existe não devolve nada", async () => {
    const sb = pgFake({
      properties: [{ id: "i1", user_id: "u1", title: "T3", address: "Rua da Estação", city: "Aveiro" }],
    });
    const r: any = await dispatchToolCall(ctx(sb) as any, "search_properties", JSON.stringify({ query: "matosinhos" }));
    expect(r.data.results).toHaveLength(0);
  });
});

describe("golden — pedaços de palavras diferentes", () => {
  it("Pessoas: 'sergio can' encontra 'Sérgio Canelas'", async () => {
    const sb = pgFake({
      people: [
        { id: "p1", user_id: "u1", name: "Sérgio Canelas" },
        { id: "p2", user_id: "u1", name: "Ana Costa" },
      ],
    });
    const r: any = await dispatchToolCall(ctx(sb) as any, "search_people", JSON.stringify({ query: "sergio can" }));
    expect(r.data.results.map((p: any) => p.id)).toEqual(["p1"]);
  });

  it("Pessoas: ordem invertida 'canelas serg' também encontra", async () => {
    const sb = pgFake({
      people: [
        { id: "p1", user_id: "u1", name: "Sérgio Canelas" },
        { id: "p2", user_id: "u1", name: "Sérgio Matos" },
      ],
    });
    const r: any = await dispatchToolCall(ctx(sb) as any, "search_people", JSON.stringify({ query: "canelas serg" }));
    expect(r.data.results[0].id).toBe("p1");
  });

  it("Pessoas: nome do meio omitido — 'maria sa' encontra 'Maria da Conceição Sá'", async () => {
    const sb = pgFake({ people: [{ id: "p1", user_id: "u1", name: "Maria da Conceição Sá" }] });
    const r: any = await dispatchToolCall(ctx(sb) as any, "search_people", JSON.stringify({ query: "maria sa" }));
    expect(r.data.results).toHaveLength(1);
  });

  it("Pessoas: pedaços que não batem em ninguém devolvem vazio", async () => {
    const sb = pgFake({ people: [{ id: "p1", user_id: "u1", name: "Sérgio Canelas" }] });
    const r: any = await dispatchToolCall(ctx(sb) as any, "search_people", JSON.stringify({ query: "joaquim pereira" }));
    expect(r.data.results).toHaveLength(0);
  });

  it("Imóveis: 'rua sol matos' encontra 'Moradia V3 na Rua do Sol, Matosinhos'", async () => {
    const sb = pgFake({
      properties: [
        { id: "i1", user_id: "u1", title: "Moradia V3 na Rua do Sol", city: "Matosinhos" },
        { id: "i2", user_id: "u1", title: "T2 Centro", city: "Braga" },
      ],
    });
    const r: any = await dispatchToolCall(ctx(sb) as any, "search_properties", JSON.stringify({ query: "rua sol matos" }));
    expect(r.data.results.map((p: any) => p.id)).toEqual(["i1"]);
  });

  it("Imóveis: 'sao joao estacao' (sem acentos, pedaços) encontra o imóvel certo", async () => {
    const sb = pgFake({
      properties: [
        { id: "i1", user_id: "u1", title: "T2", address: "Rua da Estação", city: "São João da Madeira" },
        { id: "i2", user_id: "u1", title: "T1", address: "Rua Nova", city: "Braga" },
      ],
    });
    const r: any = await dispatchToolCall(ctx(sb) as any, "search_properties", JSON.stringify({ query: "sao joao estacao" }));
    expect(r.data.results[0].id).toBe("i1");
  });
});

describe("golden — Drive com pedaços sem acentos", () => {
  const seed = () => ({
    uploaded_files: [
      {
        id: "f1", user_id: "u1", deleted_at: null, archived_at: null,
        original_file_name: "Caderneta Predial — São Brás.pdf",
        document_type: "caderneta_predial",
        ai_summary: "Prédio urbano em São Brás",
        doc_morada: "Rua da Estação, São Brás",
        mime_type: "application/pdf",
      },
      {
        id: "f2", user_id: "u1", deleted_at: null, archived_at: null,
        original_file_name: "Contrato Braga.pdf", document_type: "contrato", ai_summary: null, doc_morada: null,
      },
    ],
  });

  it("'cad sao bras' (pedaços, sem acentos) encontra a caderneta", async () => {
    const r: any = await dispatchToolCall(ctx(pgFake(seed())) as any, "search_files", JSON.stringify({ query: "cad sao bras" }));
    expect(r.ok).toBe(true);
    expect(r.data.results.map((f: any) => f.id)).toEqual(["f1"]);
  });

  it("pedaço da morada associada ('estacao bras') encontra o ficheiro", async () => {
    const r: any = await dispatchToolCall(ctx(pgFake(seed())) as any, "search_files", JSON.stringify({ query: "estacao bras" }));
    expect(r.data.results.map((f: any) => f.id)).toEqual(["f1"]);
  });

  it("pedaço do resumo ('predio urbano') encontra o ficheiro", async () => {
    const r: any = await dispatchToolCall(ctx(pgFake(seed())) as any, "search_files", JSON.stringify({ query: "predio urbano" }));
    expect(r.data.results).toHaveLength(1);
  });

  it("não devolve a morada interna nos resultados", async () => {
    const r: any = await dispatchToolCall(ctx(pgFake(seed())) as any, "search_files", JSON.stringify({ query: "cad sao bras" }));
    expect(r.data.results[0]).not.toHaveProperty("doc_morada");
  });

  it("pedaços sem correspondência devolvem lista vazia", async () => {
    const r: any = await dispatchToolCall(ctx(pgFake(seed())) as any, "search_files", JSON.stringify({ query: "certidao energetica" }));
    expect(r.data.results).toHaveLength(0);
  });
});

// Ordenação: mais pedaços primeiro; com o mesmo número de pedaços, ganha o
// registo onde os pedaços aparecem mais juntos (contexto mais próximo).
describe("golden — ordenação de correspondências parciais", () => {
  it("Pessoas: mais pedaços encontrados vem primeiro", async () => {
    const sb = pgFake({
      people: [
        { id: "p1", user_id: "u1", name: "Sérgio Matos" },
        { id: "p2", user_id: "u1", name: "Sérgio Canelas Nogueira" },
        { id: "p3", user_id: "u1", name: "Canelas Lda" },
      ],
    });
    const r: any = await dispatchToolCall(ctx(sb) as any, "search_people", JSON.stringify({ query: "sergio can nog" }));
    expect(r.data.results[0].id).toBe("p2");
  });

  it("Pessoas: com os mesmos pedaços, ganha o nome onde ficam mais juntos", async () => {
    const sb = pgFake({
      people: [
        { id: "p1", user_id: "u1", name: "Sérgio Alberto Nogueira da Silva Canelas" },
        { id: "p2", user_id: "u1", name: "Sérgio Canelas" },
      ],
    });
    const r: any = await dispatchToolCall(ctx(sb) as any, "search_people", JSON.stringify({ query: "canelas sergio" }));
    expect(r.data.results.map((p: any) => p.id)).toEqual(["p2", "p1"]);
  });

  it("Pessoas: ordem da pesquisa não altera o vencedor", async () => {
    const sb = pgFake({
      people: [
        { id: "p1", user_id: "u1", name: "Sérgio Alberto Nogueira da Silva Canelas" },
        { id: "p2", user_id: "u1", name: "Sérgio Canelas" },
      ],
    });
    const r: any = await dispatchToolCall(ctx(sb) as any, "search_people", JSON.stringify({ query: "can sergio" }));
    expect(r.data.results[0].id).toBe("p2");
  });

  it("Imóveis: mais pedaços encontrados vem primeiro", async () => {
    const sb = pgFake({
      properties: [
        { id: "i1", user_id: "u1", title: "Apartamento T2", location: "Rua do Sol", city: "Porto" },
        { id: "i2", user_id: "u1", title: "Moradia V3 na Rua do Sol", location: "Matosinhos", city: "Matosinhos" },
      ],
    });
    const r: any = await dispatchToolCall(ctx(sb) as any, "search_properties", JSON.stringify({ query: "rua sol matos" }));
    expect(r.data.results[0].id).toBe("i2");
  });

  it("Imóveis: com os mesmos pedaços, ganha o contexto mais próximo", async () => {
    const sb = pgFake({
      properties: [
        {
          id: "i1", user_id: "u1", title: "Moradia na Rua da Estação com vista para o mar e jardim amplo",
          location: "Matosinhos Sul", city: "Matosinhos",
        },
        { id: "i2", user_id: "u1", title: "T3 Rua da Estação Matosinhos", location: "Matosinhos", city: "Matosinhos" },
      ],
    });
    const r: any = await dispatchToolCall(ctx(sb) as any, "search_properties", JSON.stringify({ query: "matos estacao" }));
    expect(r.data.results.map((p: any) => p.id)).toEqual(["i2", "i1"]);
  });

  it("Imóveis: um só pedaço nunca ultrapassa dois pedaços", async () => {
    const sb = pgFake({
      properties: [
        { id: "i1", user_id: "u1", title: "Loja Rua da Estação", location: "Braga", city: "Braga" },
        { id: "i2", user_id: "u1", title: "T2 Estação", location: "Matosinhos", city: "Matosinhos" },
      ],
    });
    const r: any = await dispatchToolCall(ctx(sb) as any, "search_properties", JSON.stringify({ query: "matos estacao" }));
    expect(r.data.results[0].id).toBe("i2");
  });
});

// Peso dos campos: nome e título contam mais do que morada, zona ou resumo.
describe("golden — peso do título/nome acima da morada e resumo", () => {
  it("Imóveis: pedaço no título ganha ao mesmo pedaço só na morada", async () => {
    const sb = pgFake({
      properties: [
        { id: "i1", user_id: "u1", title: "Apartamento T2", address: "Rua do Sol", city: "Braga" },
        { id: "i2", user_id: "u1", title: "Moradia Rua do Sol", address: "Rua Nova", city: "Braga" },
      ],
    });
    const r: any = await dispatchToolCall(ctx(sb) as any, "search_properties", JSON.stringify({ query: "rua sol" }));
    expect(r.data.results.map((p: any) => p.id)).toEqual(["i2", "i1"]);
  });

  it("Drive: pedaço no nome do ficheiro ganha ao mesmo pedaço só no resumo", async () => {
    const sb = pgFake({
      uploaded_files: [
        {
          id: "f1", user_id: "u1", deleted_at: null, archived_at: null,
          original_file_name: "Documento.pdf", ai_summary: "Caderneta predial de São Brás",
        },
        {
          id: "f2", user_id: "u1", deleted_at: null, archived_at: null,
          original_file_name: "Caderneta São Brás.pdf", ai_summary: null,
        },
      ],
    });
    const r: any = await dispatchToolCall(ctx(sb) as any, "search_files", JSON.stringify({ query: "caderneta sao bras" }));
    expect(r.data.results.map((f: any) => f.id)).toEqual(["f2", "f1"]);
  });
});

// Estabilidade: com muitos empates, a lista não pode dançar entre execuções.
// A ordenação é estável (JS `sort`), por isso empates mantêm a ordem de entrada.
describe("golden — ordenação estável com empates", () => {
  const empatadas = () => ({
    people: [
      { id: "p1", user_id: "u1", name: "Sérgio Canelas" },
      { id: "p2", user_id: "u1", name: "Sérgio Canelas" },
      { id: "p3", user_id: "u1", name: "Sérgio Canelas" },
      { id: "p4", user_id: "u1", name: "Sérgio Canelas" },
      { id: "p5", user_id: "u1", name: "Sérgio Canelas" },
    ],
  });

  it("Pessoas: dez execuções da mesma pesquisa devolvem a mesma ordem", async () => {
    const corridas: string[][] = [];
    for (let i = 0; i < 10; i++) {
      const r: any = await dispatchToolCall(
        ctx(pgFake(empatadas())) as any, "search_people", JSON.stringify({ query: "sergio can" }),
      );
      corridas.push(r.data.results.map((p: any) => p.id));
    }
    expect(corridas.every((c) => c.join() === corridas[0].join())).toBe(true);
    expect(corridas[0]).toHaveLength(5);
  });

  it("Pessoas: empate mantém a ordem de entrada (sem baralhar)", async () => {
    const r: any = await dispatchToolCall(
      ctx(pgFake(empatadas())) as any, "search_people", JSON.stringify({ query: "sergio can" }),
    );
    expect(r.data.results.map((p: any) => p.id)).toEqual(["p1", "p2", "p3", "p4", "p5"]);
  });

  it("Imóveis: empates repetidos não mudam de ordem entre execuções", async () => {
    const seed = () => ({
      properties: [
        { id: "i1", user_id: "u1", title: "T2 Rua da Estação", location: "Matosinhos", city: "Matosinhos" },
        { id: "i2", user_id: "u1", title: "T2 Rua da Estação", location: "Matosinhos", city: "Matosinhos" },
        { id: "i3", user_id: "u1", title: "T2 Rua da Estação", location: "Matosinhos", city: "Matosinhos" },
        { id: "i4", user_id: "u1", title: "T2 Rua da Estação", location: "Matosinhos", city: "Matosinhos" },
      ],
    });
    const corridas: string[][] = [];
    for (let i = 0; i < 10; i++) {
      const r: any = await dispatchToolCall(
        ctx(pgFake(seed())) as any, "search_properties", JSON.stringify({ query: "matos estacao" }),
      );
      corridas.push(r.data.results.map((p: any) => p.id));
    }
    expect(corridas.every((c) => c.join() === corridas[0].join())).toBe(true);
    expect(corridas[0]).toEqual(["i1", "i2", "i3", "i4"]);
  });

  it("Drive: mesma pesquisa, mesma ordem em execuções repetidas", async () => {
    const seed = () => ({
      uploaded_files: [
        { id: "f1", user_id: "u1", original_file_name: "Caderneta Predial — São Brás.pdf", deleted_at: null },
        { id: "f2", user_id: "u1", original_file_name: "Caderneta Predial — São Brás.pdf", deleted_at: null },
        { id: "f3", user_id: "u1", original_file_name: "Caderneta Predial — São Brás.pdf", deleted_at: null },
      ],
    });
    const corridas: string[][] = [];
    for (let i = 0; i < 10; i++) {
      const r: any = await dispatchToolCall(
        ctx(pgFake(seed())) as any, "search_files", JSON.stringify({ query: "cad sao bras" }),
      );
      corridas.push(r.data.results.map((f: any) => f.id));
    }
    expect(corridas.every((c) => c.join() === corridas[0].join())).toBe(true);
  });
});
