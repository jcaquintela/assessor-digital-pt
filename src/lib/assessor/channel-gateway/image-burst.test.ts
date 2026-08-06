import { describe, expect, it } from "vitest";
import { decideImageBurstReply } from "./image-burst.server";
import { selectImageBurst, summariseImageBurst, hasNewerImage } from "./image-burst";

function rows(n: number, stepMs = 3000) {
  const t0 = Date.parse("2026-08-06T10:00:00.000Z");
  return Array.from({ length: n }, (_, i) => ({
    id: `img-${i + 1}`,
    role: "user",
    created_at: new Date(t0 + i * stepMs).toISOString(),
    message_type: "whatsapp_image",
  }));
}

function fakeSupabase(all: any[]) {
  const q: any = {
    select: () => q, eq: () => q, is: () => q, gte: () => q,
    order: () => q, limit: () => Promise.resolve({ data: all }),
    maybeSingle: () => Promise.resolve({ data: null }),
  };
  return { from: () => q } as any;
}

describe("rajada de imagens", () => {
  it("agrupa 30 fotos numa só rajada", () => {
    const burst = selectImageBurst(rows(30), "img-30");
    expect(burst).toHaveLength(30);
  });

  it("fotos anteriores calam-se; só a última responde", async () => {
    const all = rows(30);
    const sleep = () => Promise.resolve();
    let replies = 0;
    for (const r of all) {
      const d = await decideImageBurstReply(fakeSupabase(all), {
        userId: "u", channel: "whatsapp", currentMessageId: r.id, settleMs: 10, sleep,
      });
      if (d.answer) replies++;
    }
    // Golden test: 30 imagens → no máximo 1-2 respostas, nunca 30.
    expect(replies).toBeLessThanOrEqual(2);
    expect(replies).toBe(1);
  });

  it("a última foto não vê nada mais recente", () => {
    const all = rows(30);
    expect(hasNewerImage(all, all[29]!)).toBe(false);
    expect(hasNewerImage(all, all[0]!)).toBe(true);
  });

  it("uma frase só para a rajada inteira", () => {
    expect(
      summariseImageBurst({
        count: 30,
        docTypes: ["Caderneta Predial", "Certidão Energética"],
        linkedLabel: "T3 em Gaia",
      }),
    ).toBe(
      "Recebi 30 imagens — parecem ser páginas de 2 documentos (Caderneta Predial e Certidão Energética) do T3 em Gaia. Confirmas?",
    );
  });
});
