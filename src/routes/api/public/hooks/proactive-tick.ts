// Cron público: gera e envia nudges proativos aos consultores.
// Autenticado via header `apikey` com a chave anon do Supabase.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/proactive-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? "";
        const expected =
          process.env.SUPABASE_PUBLISHABLE_KEY ??
          process.env.SUPABASE_ANON_KEY ??
          "";
        if (!apikey || !expected || apikey !== expected) {
          return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
            status: 401, headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { generateNudgesForUser, persistNudges, dispatchPendingNudges } =
          await import("@/lib/assessor/v3/proactivity.server");

        // Só corre para utilizadores com v3 activa.
        const { data: v3Users } = await supabaseAdmin
          .from("feature_flag_users")
          .select("user_id")
          .eq("flag_key", "assessor.engine.v3");
        const userIds = ((v3Users as any[]) ?? []).map((r) => r.user_id);

        let generated = 0;
        for (const uid of userIds) {
          const drafts = await generateNudgesForUser(supabaseAdmin as any, uid);
          if (drafts.length) {
            const created = await persistNudges(supabaseAdmin as any, uid, drafts);
            generated += created.length;
          }
        }
        const dispatched = await dispatchPendingNudges(supabaseAdmin as any, {});

        return new Response(
          JSON.stringify({ ok: true, users: userIds.length, generated, ...dispatched }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});