import { it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { runGolden, type GoldenTurn } from "./golden.server";

it("suite golden ao vivo", async () => {
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await sb.from("assistant_golden_conversations").select("slug, turns").eq("active", true).order("slug");
  let pass = 0;
  for (const g of (data as any[]) ?? []) {
    const r = await runGolden(g.turns as GoldenTurn[]);
    if (r.passed) pass++;
    console.log(`${r.passed ? "PASS" : "FAIL"} ${g.slug}`);
    if (!r.passed) for (const t of r.turns) if (!t.passed) console.log(`   turno ${t.turn} "${t.user}" -> action=${t.action} tools=[${t.tools}] reply="${t.reply}" falhas=${t.failures.join(",")}`);
  }
  console.log(`RESULTADO ${pass}/${((data as any[]) ?? []).length}`);
}, 600000);
