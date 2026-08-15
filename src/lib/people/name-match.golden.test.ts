// GOLDEN — "Manuel" não é "Manuela".
//
// Caso real (14/08): visita agendada "com o Manuel" ficou sem contacto
// ligado e, no dia seguinte, procurar "Manuel" devolvia "Manuela" e
// "Maria Manuela" como candidatos directos. Avisar a pessoa errada sobre o
// compromisso de outra é falha de confiança e de privacidade.
import { describe, it, expect, vi } from "vitest";
import {
  nameMatchQuality, classifyPeopleMatches, personNameFromEventText,
  noExactMatchReply, askLinkPersonQuestion,
} from "./name-match";
import { dispatchToolCall } from "@/lib/assessor/v2/domain.server";
import { formatQueryResults } from "@/lib/assessor/v3/query-results";

vi.mock("@/lib/calendar/sync.server", () => ({ pushEventToProviders: async () => {} }));

describe("comparação por limite de palavra", () => {
  it("distingue igual, palavra inteira e apenas parecido", () => {
    expect(nameMatchQuality("Manuel", "Manuel")).toBe("exact");
    expect(nameMatchQuality("Manuel Silva", "Manuel")).toBe("word");
    expect(nameMatchQuality("Manuela", "Manuel")).toBe("approx");
    expect(nameMatchQuality("Maria Manuela", "Manuel")).toBe("approx");
    expect(nameMatchQuality("Ana Costa", "Manuel")).toBe("none");
  });

  it("parecidos nunca entram nos resultados", () => {
    const { exact, suggestions } = classifyPeopleMatches("Manuel", [
      { id: "1", name: "Manuela" }, { id: "2", name: "Maria Manuela" },
    ]);
    expect(exact).toHaveLength(0);
    expect(suggestions.map((s) => s.name)).toEqual(["Manuela", "Maria Manuela"]);
  });
});

describe("nome mencionado ao agendar", () => {
  it("apanha o nome da pessoa e ignora ruído", () => {
    expect(personNameFromEventText("Visita com o Carlos amanhã às 9")).toBe("Carlos");
    expect(personNameFromEventText("Reunião com a Diana Costa")).toBe("Diana Costa");
    expect(personNameFromEventText("Visita associada a um lead Manuel")).toBe("Manuel");
    expect(personNameFromEventText("Reunião de equipa")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Golden 1 — agendar com nome inexistente pergunta antes de gravar.
// ---------------------------------------------------------------------------
function fakeSb(opts: { people?: any[]; events?: any[]; captured?: { insert?: any } }) {
  const build = (table: string) => {
    const state: any = { op: null, payload: null };
    const rowsFor = () =>
      table === "people" ? (opts.people ?? []) : table === "follow_ups" ? (opts.events ?? []) : [];
    const chain: any = {
      select: () => chain, eq: () => chain, ilike: () => chain, or: () => chain,
      in: () => chain, is: () => chain, gte: () => chain, lt: () => chain, lte: () => chain,
      order: () => chain, limit: () => chain,
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => {
        if (state.op === "insert" && table === "follow_ups" && opts.captured && !opts.captured.insert) {
          opts.captured.insert = state.payload;
        }
        return { data: { id: "f1", ...state.payload }, error: null };
      },
      insert: (row: any) => { state.op = "insert"; state.payload = row; return chain; },
      update: () => chain, upsert: () => chain,
    };
    chain.then = (resolve: any) => resolve({ data: state.op ? [] : rowsFor(), error: null });
    return chain;
  };
  return { from: (t: string) => build(t) } as any;
}

describe("golden 1 — agendar com nome que não existe", () => {
  it("pergunta se cria contacto novo em vez de gravar o evento solto", async () => {
    const captured: { insert?: any } = {};
    const r = await dispatchToolCall(
      { supabase: fakeSb({ people: [], captured }), userId: "u1", channel: "whatsapp" } as any,
      "create_event",
      JSON.stringify({ title: "Visita com o Carlos", event_type: "visita", date: "2026-08-20", start_time: "09:00" }),
    );
    expect(r.ok).toBe(true);
    expect((r.data as any).needsPersonConfirmation).toBe(true);
    expect((r.data as any).personName).toBe("Carlos");
    expect(captured.insert).toBeUndefined();
    expect(askLinkPersonQuestion("Carlos", [])).toContain("Crio um contacto novo");
  });

  it("valida o contacto proposto pelo modelo em vez de o aceitar às cegas", async () => {
    const captured: { insert?: any } = {};
    const r = await dispatchToolCall(
      { supabase: fakeSb({ captured, people: [{ id: "11111111-1111-4111-8111-111111111111", name: "Manuel" }] }), userId: "u1", channel: "whatsapp" } as any,
      "create_event",
      JSON.stringify({ title: "Visita com o Manuel", event_type: "visita", date: "2026-08-20", start_time: "09:00", person_id: "11111111-1111-4111-8111-111111111111" }),
    );
    expect(r.ok).toBe(true);
    expect((r.data as any).needsPersonConfirmation).toBe(true);
    expect((r.data as any).mode).toBe("confirm_exact");
    expect(captured.insert).toBeUndefined();
  });

  it("correspondência de palavra inteira pergunta, nunca liga sozinha", async () => {
    const captured: { insert?: any } = {};
    const r = await dispatchToolCall(
      { supabase: fakeSb({ people: [{ id: "p9", name: "Manuel Silva" }], captured }), userId: "u1", channel: "whatsapp" } as any,
      "create_event",
      JSON.stringify({ title: "Visita com o Manuel", event_type: "visita", date: "2026-08-20", start_time: "09:00" }),
    );
    expect(r.ok).toBe(true);
    expect((r.data as any).mode).toBe("confirm_partial");
    expect(captured.insert).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Golden 2 — busca por "Manuel" sem correspondência exacta.
// ---------------------------------------------------------------------------
describe("golden 2 — busca distingue exacto de parecido", () => {
  it("não apresenta Manuela/Maria Manuela como resultado directo", async () => {
    const r = await dispatchToolCall(
      { supabase: fakeSb({ people: [
        { id: "1", name: "Manuela", relationship_type: "potencial_cliente" },
        { id: "2", name: "Maria Manuela", relationship_type: "comprador" },
      ] }), userId: "u1", channel: "whatsapp" } as any,
      "search_people",
      JSON.stringify({ query: "Manuel" }),
    );
    expect(r.ok).toBe(true);
    expect((r.data as any).no_exact_match).toBe(true);
    expect((r.data as any).suggestions.map((x: any) => x.name)).toEqual(["Manuela", "Maria Manuela"]);
    const texto = formatQueryResults([{ name: "search_people", ok: true, latencyMs: 1, data: r.data }]);
    expect(texto).toContain('Não encontrei ninguém chamado exatamente "Manuel"');
    expect(texto).not.toContain("Encontrei 2 contactos");
    const reply = noExactMatchReply("Manuel", (r.data as any).suggestions);
    expect(reply).toContain('Não encontrei ninguém chamado exatamente "Manuel"');
    expect(reply).toContain("Manuela");
    expect(reply).toContain("contacto novo");
  });
});

// ---------------------------------------------------------------------------
// Golden 3 — o Manuel do compromisso de amanhã sem contacto ligado.
// ---------------------------------------------------------------------------
describe("golden 3 — compromisso sem contacto associado", () => {
  it("reconhece o compromisso e oferece criar/ligar", () => {
    const out = formatQueryResults([{
      name: "search_people", ok: true, latencyMs: 1,
      data: {
        results: [], no_exact_match: true, query: "Manuel",
        suggestions: [{ id: "1", name: "Manuela" }],
        unlinked_event: { id: "f1", title: "Visita com o Manuel", due_date: "2026-08-15T08:00:00.000Z", due_time: "09:00" },
      },
    }]);
    expect(out).toContain("Visita com o Manuel");
    expect(out).toContain("não tem contacto associado");
    expect(out).toContain("Queres que crie o contacto");
    expect(out).not.toContain("Maria Manuela");
  });
});
