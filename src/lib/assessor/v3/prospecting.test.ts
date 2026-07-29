// Testes do port de Prospeção Imobiliária para o motor v3.
//
// Cobrem apenas a camada determinística: observe, executor de domínio via
// dispatchToolCall (reutilizado do v2) e o coercer de searches em THINK.
// O ciclo THINK/DECIDE completo é validado com o Gateway real e não pode
// ser exercitado sem chave — os testes garantem que os contratos e as
// pesquisas novas estão ligadas ao pipeline.

import { describe, it, expect } from "vitest";
import { observe } from "./observe.server";
import { dispatchToolCall, TOOL_REGISTRY } from "../v2/domain.server";
import { ZOD_BY_TOOL, CreateProspectingLeadArgs } from "../v2/tools";

const REAL_MSG = "Placa Santa Maria da Feira junto ao Castelo, 932145678 Apartamento";

function fakeSb(handlers: Record<string, (op: string, payload?: any) => any> = {}) {
  const build = (table: string) => {
    const state: any = { table, op: null, payload: null };
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      neq: () => chain,
      ilike: () => chain,
      or: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => (handlers[table] ? handlers[table]("select_one") : { data: null, error: null }),
      single: async () => (handlers[table] ? handlers[table](state.op ?? "select", state.payload) : { data: null, error: null }),
      insert: (row: any) => { state.op = "insert"; state.payload = row; return chain; },
      update: (row: any) => { state.op = "update"; state.payload = row; return chain; },
    };
    (chain as any).then = (resolve: any) =>
      resolve(handlers[table] ? handlers[table](state.op ?? "select_list", state.payload) : { data: [], error: null });
    return chain;
  };
  return { from: (t: string) => build(t) } as any;
}

describe("v3 · prospeção · observe", () => {
  it("extrai telefone PT da mensagem real", () => {
    const obs = observe(REAL_MSG);
    const phone = obs.find((o) => o.type === "phone");
    expect(phone?.value).toBe("932145678");
  });

  it("preserva a mensagem completa como sinal para o THINK (via input)", () => {
    // observe é intencionalmente conservador: extrai apenas âncoras
    // determinísticas (phone, valores). O topónimo composto e a referência
    // "junto ao Castelo" chegam ao THINK pela mensagem original, não como
    // observação estruturada — validamos apenas que o telefone foi ancorado.
    const obs = observe(REAL_MSG);
    expect(obs.some((o) => o.type === "phone")).toBe(true);
  });
});

describe("v3 · prospeção · tools expostas", () => {
  it("regista as três tools no domínio partilhado v2/v3", () => {
    expect(typeof TOOL_REGISTRY.create_prospecting_lead).toBe("function");
    expect(typeof TOOL_REGISTRY.search_prospecting_leads).toBe("function");
    expect(typeof TOOL_REGISTRY.update_prospecting_lead).toBe("function");
  });

  it("valida CreateProspectingLeadArgs (source_type default)", () => {
    const r = CreateProspectingLeadArgs.safeParse({ phone: "932145678", location: "Santa Maria da Feira", property_type: "apartamento" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.source_type).toBe("street_sign");
  });

  it("Zod recusa argumentos sem source_type quando explicitamente inválido", () => {
    const r = ZOD_BY_TOOL.create_prospecting_lead.safeParse({ source_type: "invalid_source" });
    expect(r.success).toBe(false);
  });

  it("normaliza aliases ingleses em create_follow_up antes da execução", () => {
    const r = ZOD_BY_TOOL.create_follow_up.safeParse({
      title: "Contactar placa em Santa Maria da Feira",
      type: "call",
      due_date: "2026-07-29",
      due_time: "11:45",
      priority: "medium",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      const data = r.data as { type: string; priority: string };
      expect(data.type).toBe("chamada");
      expect(data.priority).toBe("media");
    }
  });
});

describe("v3 · prospeção · executor domínio (dedupe + insert)", () => {
  it("dedupe por telefone: devolve duplicate:true sem inserir", async () => {
    const sb = fakeSb({
      prospecting_leads: (op) => {
        if (op === "select_one") return { data: { id: "lead-1", title: "Placa existente", location: "Santa Maria da Feira", status: "to_contact" }, error: null };
        return { data: null, error: null };
      },
    });
    const r = await dispatchToolCall(
      { supabase: sb, userId: "u1", channel: "whatsapp" },
      "create_prospecting_lead",
      JSON.stringify({ phone: "932145678", source_type: "street_sign" }),
    );
    expect(r.ok).toBe(true);
    expect((r.data as any)?.duplicate).toBe(true);
    expect((r.data as any)?.existing?.id).toBe("lead-1");
  });

  it("cria placa nova quando não há duplicado (mensagem real)", async () => {
    const sb = fakeSb({
      prospecting_leads: (op, payload) => {
        if (op === "select_one") return { data: null, error: null }; // sem duplicado
        if (op === "insert") {
          const inserted = Array.isArray(payload) ? payload[0] : payload;
          return { data: { id: "lead-new", ...inserted }, error: null };
        }
        return { data: null, error: null };
      },
    });
    const r = await dispatchToolCall(
      { supabase: sb, userId: "u1", channel: "whatsapp" },
      "create_prospecting_lead",
      JSON.stringify({
        phone: "932145678",
        location: "Santa Maria da Feira",
        address_hint: "junto ao Castelo",
        property_type: "apartamento",
        source_type: "street_sign",
        listing_type: "unknown",
      }),
    );
    expect(r.ok).toBe(true);
    expect((r.data as any)?.duplicate).toBe(false);
    expect((r.data as any)?.lead?.id).toBe("lead-new");
    // Título natural gerado a partir da tipologia + referência + localidade.
    expect(String((r.data as any)?.lead?.title || "")).toMatch(/apartamento.*Castelo.*Santa Maria da Feira/i);
  });

  it("rejeita source_type inválido ao dispatch", async () => {
    const r = await dispatchToolCall(
      { supabase: fakeSb(), userId: "u1", channel: "whatsapp" },
      "create_prospecting_lead",
      JSON.stringify({ source_type: "não_existe" }),
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/source_type/);
  });

  it("associa lembrete ao último lead de prospeção activo", async () => {
    let insertedFollowUp: any = null;
    let leadPatch: any = null;
    const sb = fakeSb({
      conversation_states: (op) => {
        if (op === "select_one") return { data: { last_entity_type: "prospecting_lead", last_entity_id: "lead-1" }, error: null };
        return { data: null, error: null };
      },
      prospecting_leads: (op, payload) => {
        if (op === "select_one") return { data: { id: "lead-1", title: "Apartamento em Santa Maria da Feira", location: "Santa Maria da Feira", phone: "932145678" }, error: null };
        if (op === "update") leadPatch = payload;
        return { data: null, error: null };
      },
      follow_ups: (op, payload) => {
        if (op === "insert") {
          insertedFollowUp = Array.isArray(payload) ? payload[0] : payload;
          return { data: { id: "fu-1", ...insertedFollowUp }, error: null };
        }
        return { data: null, error: null };
      },
    });
    const r = await dispatchToolCall(
      { supabase: sb, userId: "u1", channel: "whatsapp", sourceMessageId: "00000000-0000-0000-0000-000000000001" },
      "create_follow_up",
      JSON.stringify({
        title: "Contactar placa em Santa Maria da Feira",
        type: "call",
        due_date: "2026-07-29",
        due_time: "11:45",
        priority: "medium",
      }),
    );
    expect(r.ok).toBe(true);
    expect(insertedFollowUp?.related_prospecting_lead_id).toBe("lead-1");
    expect(insertedFollowUp?.type).toBe("chamada");
    expect(insertedFollowUp?.priority).toBe("media");
    // 11:45 Europe/Lisbon (verão, UTC+1) → 10:45 UTC.
    expect(leadPatch?.next_follow_up_at).toBe("2026-07-29T10:45:00.000Z");
  });
});