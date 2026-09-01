import { it, expect } from "vitest";
import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";
import { dispatchToolCall } from "@/lib/assessor/v2/domain.server";
it("dbg", async () => {
  const s = makeFakeSupabase({ routines: [], prospecting_leads: [] });
  const r = await dispatchToolCall({ supabase: s, userId: "11111111-1111-4111-8111-111111111111" } as any, "create_routine", JSON.stringify({ title: "X", frequency: "daily", time_of_day: "18:00", kind: "digest", digest_query: "leads" }));
  console.log(JSON.stringify(r));
  expect(1).toBe(1);
});
