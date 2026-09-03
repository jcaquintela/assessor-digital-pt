import { it } from "vitest";
import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";
it("dbg", async () => {
  const sb:any = makeFakeSupabase({ assessor_nudges:[{id:"c",user_id:"u",status:"sent",sent_at:"x",dedupe_key:"supreme_cap_notice:2026-09-03"}] });
  console.log(await sb.from("assessor_nudges").select("id").eq("user_id","u").eq("dedupe_key","supreme_cap_notice:2026-09-03").limit(1));
});
