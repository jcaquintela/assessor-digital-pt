// TEMPORÁRIO — harness de teste do Ciclo 1 contra a BD real. Apagar após o teste.
import { createFileRoute } from "@tanstack/react-router";

const TOKEN = "ciclo1-e2e-3f9a2c";

export const Route = createFileRoute("/api/public/hooks/e2e-ciclo1")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as { token?: string; userId?: string; text?: string };
        if (body.token !== TOKEN) return new Response("no", { status: 401 });
        const userId = String(body.userId ?? "");
        const text = String(body.text ?? "");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runInboundPipeline } = await import("@/lib/assessor/channel-gateway/ingest.server");
        const { dashboardAdapter, buildDashboardInbound } = await import(
          "@/lib/assessor/channel-gateway/dashboard-adapter"
        );
        const since = new Date().toISOString();
        const inbound = buildDashboardInbound({
          userId,
          text,
          messageId: `e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        });
        await runInboundPipeline(dashboardAdapter, supabaseAdmin as any, inbound);
        const [{ data: msgs }, { data: misc }, { data: rem }, { data: pend }] = await Promise.all([
          (supabaseAdmin as any).from("assessor_messages").select("role,content,created_at")
            .eq("user_id", userId).gte("created_at", since).order("created_at", { ascending: true }),
          (supabaseAdmin as any).from("miscellaneous_items").select("id,title,original_content,summary,category")
            .eq("user_id", userId).gte("created_at", since),
          (supabaseAdmin as any).from("follow_ups").select("id,title,due_date,due_time")
            .eq("user_id", userId).gte("created_at", since),
          (supabaseAdmin as any).from("pending_actions").select("id,intent,status,original_content")
            .eq("user_id", userId).gte("created_at", since),
        ]);
        return Response.json({ since, msgs, misc, follow_ups: rem, pending: pend });
      },
    },
  },
});
