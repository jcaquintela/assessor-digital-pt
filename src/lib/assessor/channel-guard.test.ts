import { describe, it, expect } from "vitest";
import { blockedChannelReason, isRealChannel, isTestChannel } from "./channel-guard";

describe("isolamento de canais de teste", () => {
  it("aceita os canais reais do produto", () => {
    for (const c of ["whatsapp", "telegram", "dashboard", "app", "web", "WhatsApp"]) {
      expect(isRealChannel(c)).toBe(true);
      expect(blockedChannelReason(c)).toBeNull();
    }
  });

  it("bloqueia os canais improvisados de CI que causaram as comissões fantasma", () => {
    for (const c of [
      "web-ci-commission-1785347706379-0",
      "ci-smoke",
      "e2e-test",
      "",
      null,
    ]) {
      expect(isTestChannel(c as string)).toBe(true);
      expect(blockedChannelReason(c as string)).toMatch(/^test_channel_blocked:/);
    }
  });
});
