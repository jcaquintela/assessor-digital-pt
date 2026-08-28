import { describe, it, expect } from "vitest";
import { DETERMINISTIC_ROUTER } from "./deterministic-router.server";

// A ordem é comportamento: fixa-la aqui evita reordenações acidentais.
describe("router determinístico — precedência", () => {
  it("mantém a ordem exacta dos casos", () => {
    expect(DETERMINISTIC_ROUTER.map((c) => c.name)).toEqual([
      "elliptic_entity",
      "person_brief",
      "drive_bulk_archive",
      "feedback_target",
      "feedback_announcement",
      "whats_new",
      "misc_query",
      "event_name",
      "agenda_date",
      "day_state",
      "agenda_period",
      "email_draft_confirmation",
      "awaiting_email_address",
      "elliptic_read",
      "drive_read",
      "open_question",
    ]);
  });
});
