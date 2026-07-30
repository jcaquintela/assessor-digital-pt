import { createClient } from "@supabase/supabase-js";
import { runReasoningEngine } from "@/lib/assessor/v3/reasoning-engine.server";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const userId = "08d24695-a12c-4954-887a-81a71215a87e";

async function turn(content: string) {
  const r = await runReasoningEngine({ supabase: supabase as never, userId, channel: "whatsapp", content });
  console.log(`> ${content}\n< ${r.reply}\n`);
}

await turn("Reunião de equipa amanhã às 15:00");
await turn("Sim");
const { data } = await supabase.from("follow_ups")
  .select("id,title,type,due_date,due_time,status,created_at")
  .eq("user_id", userId).ilike("title", "%euni%equipa%").order("created_at", { ascending: false });
console.log(JSON.stringify(data, null, 2));
