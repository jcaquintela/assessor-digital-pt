import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { data: p } = await sb.from("profiles").select("id").eq("email","julio.quintela@saguii.com").single();
const userId = (p as any).id;
const { processAssessorMessage } = await import("./src/lib/assessor/engine.server");
const out = await processAssessorMessage({ supabase: sb as any, userId, channel: "web", content: "nota solta: o predio da avenida central vai ter pinturas nas escadas em outubro", receivedAt: new Date() } as any);
console.log("REPLY:", out.reply);
const { data } = await sb.from("miscellaneous_items").select("created_at,status,category,title").order("created_at",{ascending:false}).limit(3);
console.log(data);
