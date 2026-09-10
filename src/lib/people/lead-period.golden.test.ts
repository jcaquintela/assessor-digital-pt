import { describe, it, expect } from "vitest";
import { personPeriodReference, mentionsUnnamedLead } from "./period-reference";
import { resolvePersonForWrite, personResolutionQuestion } from "./resolve-person.server";
import { leadNameFromAnswer } from "@/lib/assessor/v3/pending-resolvers/lead-identity.server";
import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";

// Caso real (Iolanda, 30-31/08): "a lead do fim de semana" não é um nome — é
// um período. Sem ninguém registado, o Afonso escrevia mensagens genéricas.

const MONDAY = new Date("2026-08-31T09:00:00Z"); // segunda-feira
const SAT = "2026-08-29T11:00:00Z";
const SUN = "2026-08-30T18:00:00Z";

function ctxWith(people: any[]) {
  return { supabase: makeFakeSupabase({ people, person_phones: [] }), userId: "u1", channel: "whatsapp" } as any;
}

describe("período temporal em referências a leads", () => {
  it("reconhece 'lead do fim de semana' como período (sábado+domingo mais recentes)", () => {
    const p = personPeriodReference("Segunda tenho de ligar à lead do fim de semana", MONDAY);
    expect(p?.expression).toBe("fim de semana");
    expect(p!.fromIso.slice(0, 10)).toBe("2026-08-29");
    expect(p!.toIso.slice(0, 10)).toBe("2026-08-31");
  });

  it("não confunde datas soltas com período", () => {
    expect(personPeriodReference("Marca visita dia 12 às 10h", MONDAY)).toBeNull();
    expect(personPeriodReference("Preciso de descansar no fim de semana", MONDAY)).toBeNull();
  });

  it("G1 — uma pessoa registada no período resolve directamente (com confirmação)", async () => {
    const ctx = ctxWith([
      { id: "p1", user_id: "u1", name: "Maria Manuela", phone: "912 345 678", created_at: SUN },
      { id: "p2", user_id: "u1", name: "João Antigo", created_at: "2026-07-01T10:00:00Z" },
    ]);
    const res = await resolvePersonForWrite(ctx, "Ligar à lead do fim de semana", { now: MONDAY });
    expect(res.status).toBe("confirm_exact");
    expect(res.personId).toBe("p1");
    expect(personResolutionQuestion(res)).toContain("Maria Manuela");
    expect(personResolutionQuestion(res)).toContain("fim de semana");
  });

  it("G2 — várias pessoas no período → pergunta qual", async () => {
    const ctx = ctxWith([
      { id: "p1", user_id: "u1", name: "Maria Manuela", phone: "912 345 678", created_at: SUN },
      { id: "p2", user_id: "u1", name: "Rui Costa", phone: "933 111 222", created_at: SAT },
    ]);
    const res = await resolvePersonForWrite(ctx, "Prepara mensagem para a lead do fim de semana", { now: MONDAY });
    expect(res.status).toBe("choose");
    expect(res.candidates).toHaveLength(2);
    const q = personResolutionQuestion(res);
    expect(q).toContain("Maria Manuela");
    expect(q).toContain("Rui Costa");
    expect(q).toMatch(/Qual deles é\?/);
  });

  it("G3 — ninguém no período → diz claramente que não encontra", async () => {
    const ctx = ctxWith([{ id: "p2", user_id: "u1", name: "João Antigo", created_at: "2026-07-01T10:00:00Z" }]);
    const res = await resolvePersonForWrite(ctx, "Ligar à lead do fim de semana", { now: MONDAY });
    expect(res.status).toBe("period_none");
    const q = personResolutionQuestion(res);
    expect(q).toContain("Não encontro nenhuma lead do fim de semana");
    expect(q).toMatch(/nome e o contacto/);
  });

  it("G4 — lead sem nome nenhum é detectada para pedir o essencial", () => {
    expect(mentionsUnnamedLead("Amanhã ligar à lead")).toBe(true);
    expect(mentionsUnnamedLead("Ligar ao Rui Costa")).toBe(false);
    const q = personResolutionQuestion({ status: "lead_identity", personId: null, name: null, candidates: [] });
    expect(q).toMatch(/nome/);
    expect(q).toMatch(/seguimento/);
  });

  it("G4b — resposta com nome e número é lida como identidade da lead", () => {
    expect(leadNameFromAnswer("É a Maria Manuela, 912 345 678")).toBe("Maria Manuela");
    expect(leadNameFromAnswer("maria manuela")).toBe("Maria Manuela");
    expect(leadNameFromAnswer("não sei ainda quem é essa pessoa toda")).toBeNull();
  });

  it("G5 — fluxo da Iolanda: com a lead registada, 'preparar mensagem' já tem nome e número", async () => {
    // 30/08: a lead ficou registada com nome e contacto (correcção b).
    const ctx = ctxWith([
      { id: "p1", user_id: "u1", name: "Maria Manuela", phone: "912 345 678", created_at: SUN },
    ]);
    // 31/08: "prepara uma mensagem para a lead do fim de semana".
    const res = await resolvePersonForWrite(ctx, "Prepara uma mensagem para a lead do fim de semana", { now: MONDAY });
    expect(res.personId).toBe("p1");
    expect(res.candidates[0]!.phone).toBe("912 345 678");
  });
});
