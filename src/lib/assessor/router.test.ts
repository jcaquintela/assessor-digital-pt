import { describe, it, expect } from "vitest";
import { coerceDecision, ROUTER_MIN_CONFIDENCE } from "./router.server";

describe("router.coerceDecision", () => {
  it("returns safe defaults for empty input", () => {
    const d = coerceDecision({});
    expect(d.intent).toBe("none");
    expect(d.destination).toBe("none");
    expect(d.confidence).toBe(0);
    expect(d.references.property).toBeNull();
    expect(d.entities).toEqual({});
    expect(d.missing_fields).toEqual([]);
    expect(d.reply).toBeNull();
  });

  it("preserves valid fields and coerces booleans", () => {
    const d = coerceDecision({
      conversation_act: "question",
      intent: "query_agenda",
      destination: "agenda",
      confidence: 0.9,
      requires_database_lookup: 1,
      should_persist: 0,
      references: { property: "Canelas" },
      entities: { period: "week" },
      missing_fields: ["date"],
      reply_intent: "answer",
      reply: "",
    });
    expect(d.intent).toBe("query_agenda");
    expect(d.destination).toBe("agenda");
    expect(d.requires_database_lookup).toBe(true);
    expect(d.should_persist).toBe(false);
    expect(d.references.property).toBe("Canelas");
    expect(d.entities.period).toBe("week");
    expect(d.missing_fields).toEqual(["date"]);
    expect(d.reply).toBe("");
  });

  it("ignores malformed nested objects", () => {
    const d = coerceDecision({ references: "not-an-object", entities: 5 });
    expect(d.references.person).toBeNull();
    expect(d.entities).toEqual({});
  });

  it("exposes a sensible confidence threshold", () => {
    expect(ROUTER_MIN_CONFIDENCE).toBeGreaterThan(0.4);
    expect(ROUTER_MIN_CONFIDENCE).toBeLessThan(0.9);
  });
});
