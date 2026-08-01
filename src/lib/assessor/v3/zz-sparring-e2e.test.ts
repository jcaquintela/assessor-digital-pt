import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { runReasoningEngine } from "@/lib/assessor/v3/reasoning-engine.server";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const CH = "e2e-sparring";

describe("sparring e2e", () => {
  it("nao cria registos durante a simulacao", async () => {
    const { data: prof } = await sb.from("profiles").select("id").eq("email", "julio.quintela@saguii.com").maybeSingle();
    const userId = (prof as any).id as string;
    const t0 = new Date().toISOString();

    const counts = async () => {
      const tables = ["people", "properties", "follow_ups", "reminders", "miscellaneous_items", "opportunities", "interactions", "prospecting_leads", "pending_actions"];
      const out: Record<string, number> = {};
      for (const t of tables) {
        const { count } = await sb.from(t as any).select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", t0);
        out[t] = count ?? 0;
      }
      return out;
    };

    const msgs = [
      "treina comigo uma objeção de preço",
      "O preço está de acordo com o mercado, tenho comparativos da zona.",
      "Posso mostrar-lhe os imóveis vendidos nos últimos 3 meses na freguesia.",
      "Percebo, mas a exclusividade permite-me investir mais na promoção.",
      "chega, obrigado",
    ];
    const replies: string[] = [];
    for (const m of msgs) {
      const r = await runReasoningEngine({ supabase: sb as any, userId, channel: CH, content: m });
      replies.push(r.reply);
    }
    console.log(JSON.stringify(replies, null, 2));
    const after = await counts();
    console.log("novos registos:", after);

    const { data: audit } = await sb.from("admin_audit_logs").select("action, metadata").in("action", ["sparring_started", "sparring_ended"]).gte("created_at", t0);
    console.log("auditoria:", audit);

    await sb.from("assessor_messages").delete().eq("user_id", userId).eq("channel", CH);
    await sb.from("conversation_states").delete().eq("user_id", userId).eq("channel", CH);

    expect(Object.values(after).every((n) => n === 0)).toBe(true);
    expect((audit ?? []).map((a: any) => a.action).sort()).toEqual(["sparring_ended", "sparring_started"]);
  }, 180000);
});
