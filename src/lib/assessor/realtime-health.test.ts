import { describe, expect, it } from "vitest";
import {
  healthLabel,
  mapSubscribeStatus,
  pollIntervalMs,
  POLL_DEGRADED_MS,
  POLL_LIVE_IDLE_MS,
  POLL_PENDING_MS,
} from "./realtime-health";

describe("saúde do tempo real", () => {
  it("traduz os estados do canal", () => {
    expect(mapSubscribeStatus("SUBSCRIBED")).toBe("live");
    expect(mapSubscribeStatus("CHANNEL_ERROR")).toBe("degraded");
    expect(mapSubscribeStatus("TIMED_OUT")).toBe("degraded");
    expect(mapSubscribeStatus("CLOSED")).toBe("degraded");
    expect(mapSubscribeStatus("JOINING")).toBe("connecting");
  });

  it("consulta depressa sem websocket e devagar com websocket", () => {
    expect(pollIntervalMs("degraded", false)).toBe(POLL_DEGRADED_MS);
    expect(pollIntervalMs("live", false)).toBe(POLL_LIVE_IDLE_MS);
  });

  it("mensagens por resolver mandam sempre no ritmo", () => {
    expect(pollIntervalMs("live", true)).toBe(POLL_PENDING_MS);
    expect(pollIntervalMs("degraded", true)).toBe(POLL_PENDING_MS);
  });

  it("explica ao consultor em português", () => {
    expect(healthLabel("live")).toMatch(/tempo real/i);
    expect(healthLabel("degraded")).toMatch(/4 em 4 segundos/);
    expect(healthLabel("connecting")).toMatch(/ligar/i);
  });
});
