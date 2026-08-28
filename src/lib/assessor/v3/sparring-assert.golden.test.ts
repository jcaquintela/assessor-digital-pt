// Golden: fonte única de verdade do modo treino.
// A decisão vive em resolveSparringTurn (1ª leitura). O ponto do meio do turno
// é só um assert defensivo — sem máquina de estados própria.

import { describe, expect, it } from "vitest";
import { resolveSparringTurn } from "./sparring-turn";
import { buildSparringLeakLog, detectSparringLeak } from "./sparring-assert";
import { SPARRING_PAUSED_TOPIC, SPARRING_TOPIC } from "./sparring";

const now = new Date("2026-08-28T10:00:00Z");
const fresh = new Date("2026-08-28T09:55:00Z").toISOString();
const old = new Date("2026-08-28T09:00:00Z").toISOString();

describe("sparring — fonte única + assert defensivo", () => {
  it("1) fluxo normal de treino resolve-se na 1ª leitura", () => {
    const start = resolveSparringTurn({ state: null, text: "vamos treinar objeções", now });
    expect(start.handleAsSparring).toBe(true);
    expect(start.startedNow).toBe(true);

    const inside = resolveSparringTurn({
      state: { active_topic: SPARRING_TOPIC, sparring_turns: 2, updated_at: fresh },
      text: "o teu preço é caro demais",
      now,
    });
    expect(inside.handleAsSparring).toBe(true);
    expect(inside.turns).toBe(3);
    expect(inside.ending).toBe(false);

    // Nada disto chega ao meio do turno.
    expect(detectSparringLeak({ active_topic: null }).anomaly).toBe(false);
  });

  it("2) staleness: 1ª leitura liberta, mas se o estado sobreviver o assert dispara", () => {
    const stale = resolveSparringTurn({
      state: { active_topic: SPARRING_TOPIC, sparring_turns: 3, updated_at: old },
      text: "marca reunião com o Nuno amanhã",
      now,
    });
    expect(stale.handleAsSparring).toBe(false);
    expect(stale.stale).toBe(true);

    // stopSparring falhou em silêncio → o estado ainda diz "sparring".
    const leak = detectSparringLeak({ active_topic: SPARRING_TOPIC });
    expect(leak.anomaly).toBe(true);
    const row = buildSparringLeakLog({
      userId: "u1", channel: "telegram", message: "marca reunião", topic: leak.topic,
    });
    expect(row.action).toBe("sparring_leak_detected");
    expect(row.target_user_id).toBe("u1");
  });

  it("3) fora de treino: nenhum sinal de sparring", () => {
    const turn = resolveSparringTurn({ state: null, text: "cria o imóvel na Rua A" });
    expect(turn.handleAsSparring).toBe(false);
    expect(detectSparringLeak(null).anomaly).toBe(false);
    expect(detectSparringLeak({ active_topic: "outro" }).anomaly).toBe(false);
    // Pausa não é anomalia: é estado legítimo lido pela fonte única.
    expect(detectSparringLeak({ active_topic: SPARRING_PAUSED_TOPIC }).anomaly).toBe(false);
  });
});
