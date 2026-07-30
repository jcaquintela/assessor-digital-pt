import { createClient } from "@supabase/supabase-js";
import { runReasoningEngine } from "@/lib/assessor/v3/reasoning-engine.server";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data } = await sb.from("profiles").select("id").eq("email", "julio.quintela@saguii.com").maybeSingle();
const userId = (data as any).id;
for (const msg of ["Lista as placas que registei", "Que leads tenho por contactar?"]) {
  const out = await runReasoningEngine({ supabase: sb as any, userId, channel: "test-e2e", content: msg, sourceMessageId: null } as any);
  console.log("\n>>>", msg, "\n<<<", out.reply, "\n");
}
