import { describe, it, expect } from "vitest";
import { resolvePropertyForWrite, matchPropertyChoice } from "./resolve-property.server";

const props = [
  { id: "p1", title: "T3 Boavista", address: "Av. da Boavista, 12", location: "Porto", city: "Porto" },
  { id: "p2", title: "Loja Republica", address: "Alameda da República, 45", location: "Matosinhos", city: "Matosinhos" },
];

function ctx(rows = props) {
  return {
    userId: "u1",
    sourceMessageId: null,
    supabase: {
      from() {
        const q: any = {
          select: () => q,
          eq: () => q,
          limit: async () => ({ data: rows }),
          maybeSingle: async () => ({ data: null }),
        };
        return q;
      },
    },
  } as any;
}

describe("resolvePropertyForWrite (golden)", () => {
  it("morada igual liga direto", async () => {
    const r = await resolvePropertyForWrite(ctx(), "Visita à Av. da Boavista 12 amanhã");
    expect(r.status).toBe("linked");
    expect(r.propertyId).toBe("p1");
  });

  it("Boavista 120 não liga à Boavista 12 — pergunta", async () => {
    const r = await resolvePropertyForWrite(ctx(), "Visita à Boavista 120 amanhã");
    expect(r.status).toBe("confirm_partial");
    expect(r.propertyId).toBeNull();
    expect(r.candidates[0]!.id).toBe("p1");
  });

  it("morada sem número fica em provável", async () => {
    const r = await resolvePropertyForWrite(ctx(), "Visita à Alameda da República");
    expect(r.status).toBe("confirm_partial");
    expect(r.propertyId).toBeNull();
  });

  it("morada desconhecida não liga nada", async () => {
    const r = await resolvePropertyForWrite(ctx(), "Reunião na Rua do Ouro 3");
    expect(r.status).toBe("none");
  });

  it("escolha por número e recusa explícita", () => {
    const cands = [{ id: "p1", address: "Av. da Boavista, 12" }, { id: "p2", address: "Alameda da República, 45" }];
    expect(matchPropertyChoice("2", cands)).toMatchObject({ kind: "candidate", id: "p2" });
    expect(matchPropertyChoice("nenhum", cands)).toMatchObject({ kind: "skip" });
  });
});
