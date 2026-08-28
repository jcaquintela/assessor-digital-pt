// Golden — resolução de contacto no Processador de Áudio Imobiliário.
//
// Regressão real: um áudio que diz "Manuel", havendo "Manuel Silva" e
// "Manuela Dias" na conta, ligava o seguimento à Manuela (pesquisa por
// substring, limit 1). A regra passa a ser a mesma do resto do produto:
// ou é inequívoco, ou pergunta-se.

import { describe, it, expect } from "vitest";
import { resolveBreakdownPeople } from "./audio-breakdown.server";
import { pendingPersonAmbiguities, formatBreakdownProposal } from "./audio-breakdown";
import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";

const MANUEL = "11111111-1111-4111-8111-111111111111";
const MANUELA = "22222222-2222-4222-8222-222222222222";

function ctxFor(people: any[]) {
  return {
    supabase: makeFakeSupabase({ people, person_phones: [] }),
    userId: "u1",
    channel: "whatsapp",
    sourceMessageId: null,
  } as any;
}

const item = (person_name: string) => ({
  kind: "follow_up" as const,
  text: "Ligar amanhã de manhã",
  person_name,
  property_hint: null,
  due_date: null,
  due_time: null,
  confidential: false,
});

describe("Golden 1 — nome com match exato único liga automaticamente", () => {
  it("liga sem perguntar", async () => {
    const ctx = ctxFor([{ id: MANUEL, user_id: "u1", name: "Manuel Silva" }]);
    const breakdown = { items: [item("Manuel Silva")], subject: null };
    const links = await resolveBreakdownPeople(ctx, breakdown);
    expect(links[0]!.person_id).toBe(MANUEL);
    expect(pendingPersonAmbiguities({ ...breakdown, links })).toHaveLength(0);
  });
});

describe("Golden 2 — 'Manuel' com Manuel Silva e Manuela Dias na base", () => {
  it("não liga sozinho e levanta a dúvida na confirmação do áudio", async () => {
    const ctx = ctxFor([
      { id: MANUEL, user_id: "u1", name: "Manuel Silva", phone: "911 111 111" },
      { id: MANUELA, user_id: "u1", name: "Manuela Dias", phone: "922 222 222" },
    ]);
    const breakdown = { items: [item("Manuel")], subject: null };
    const links = await resolveBreakdownPeople(ctx, breakdown);
    expect(links[0]!.person_id).toBeNull();
    // Nunca a Manuela por engano.
    expect(links[0]!.candidates.map((c) => c.id)).not.toContain(MANUELA);

    const amb = pendingPersonAmbiguities({ ...breakdown, links });
    expect(amb).toHaveLength(1);

    // A pergunta sai na MESMA confirmação, não numa segunda interação.
    const proposal = formatBreakdownProposal({ ...breakdown, links });
    expect(proposal).toContain("Manuel");
    expect(proposal).toMatch(/1\. Manuel Silva/);
  });
});

describe("Golden 3 — nome parcial sem match exato", () => {
  it("levanta a dúvida em vez de tratar como contacto novo", async () => {
    const ctx = ctxFor([{ id: MANUEL, user_id: "u1", name: "Manuel Silva", phone: "911 111 111" }]);
    const breakdown = { items: [item("Manuel")], subject: null };
    const links = await resolveBreakdownPeople(ctx, breakdown);
    expect(links[0]!.person_id).toBeNull();
    expect(links[0]!.candidates.map((c) => c.id)).toEqual([MANUEL]);
    expect(pendingPersonAmbiguities({ ...breakdown, links })).toHaveLength(1);
  });
});

describe("Golden 4 — pipeline duplicado removido", () => {
  it("resolvePersonFromText/ResolvedPerson já não existem", async () => {
    const domain: Record<string, unknown> = await import("../v2/domain.server");
    expect(domain["resolvePersonFromText"]).toBeUndefined();
  });
});
