import { describe, it, expect } from "vitest";
import { personNameFromEventText } from "./name-match";
import { matchPersonChoice } from "./person-choice";
import { executeToolCalls } from "@/lib/assessor/v3/act.server";
import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";

const PROP_ID = "11111111-1111-4111-8111-111111111111";
const PES1 = "22222222-2222-4222-8222-222222222222";
const PES2 = "33333333-3333-4333-8333-333333333333";

// Casos reais que caíram em Diversos como "falha de interpretação".

describe("Golden 1 — rejeição explícita de candidato não é falha", () => {
  const candidatos = [{ id: "p1", name: "Ana Silva", phone: "912 000 111" }];
  it("'Não, é outra pessoa' é lida como recusa (kind: none)", () => {
    expect(matchPersonChoice("Não, é outra pessoa", candidatos as any).kind).toBe("none");
  });
  it("o motor trata-a como rejeição e por isso não arquiva em Diversos", async () => {
    const { personChoiceIsNone } = await import("@/lib/assessor/v3/reasoning-engine.server");
    const pending = { structured_payload: { suggestions: candidatos } };
    expect(personChoiceIsNone("Não, é outra pessoa", pending)).toBe(true);
    expect(personChoiceIsNone("Marca visita amanhã às 10h", pending)).toBe(false);
  });
});

describe("Golden 2 — honorífico com nome em minúsculas (transcrição de áudio)", () => {
  it("'dona maria Manuel' → Maria Manuel", () => {
    expect(personNameFromEventText("Seguimento à dona maria Manuel")).toBe("Maria Manuel");
  });
  it("continua a exigir duas palavras: 'a dona casa' não é nome", () => {
    expect(personNameFromEventText("Passei pela dona casa")).toBe(null);
  });
});

function ctxFor(people: any[]) {
  const supabase = makeFakeSupabase({
    people,
    properties: [{ id: PROP_ID, user_id: "u1", title: "T2 Canelas", owner_person_id: null }],
    pending_actions: [],
    person_phones: [],
  });
  return { supabase, userId: "u1", channel: "whatsapp", sourceMessageId: null } as any;
}

describe("Golden 3 — associar proprietário a imóvel existente", () => {
  it("uma só Isabel Martins → owner_person_id actualizado", async () => {
    const ctx = ctxFor([{ id: PES1, user_id: "u1", name: "Isabel Martins", phone: "911 111 111" }]);
    const res = await executeToolCalls(ctx, [
      { name: "update_property", arguments: { id: PROP_ID, owner_name: "Isabel Martins" } } as any,
    ]);
    expect(res[0].ok).toBe(true);
    expect((res[0].data as any)?.needsPersonConfirmation).toBeUndefined();
    const prop = (ctx.supabase as any).__state?.properties?.[0];
    if (prop) expect(prop.owner_person_id).toBe(PES1);
  });

  it("duas Isabel Martins → pergunta em vez de escrever", async () => {
    const ctx = ctxFor([
      { id: PES1, user_id: "u1", name: "Isabel Martins", phone: "911 111 111" },
      { id: PES2, user_id: "u1", name: "Isabel Martins", phone: "922 222 222" },
    ]);
    const res = await executeToolCalls(ctx, [
      { name: "update_property", arguments: { id: PROP_ID, owner_name: "Isabel Martins" } } as any,
    ]);
    expect(res[0].ok).toBe(true);
    expect((res[0].data as any)?.needsPersonConfirmation).toBe(true);
    expect((res[0].data as any)?.mode).toBe("choose");
    expect(((res[0].data as any)?.suggestions ?? []).length).toBe(2);
  });
});
