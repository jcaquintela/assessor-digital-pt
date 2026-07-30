// Ronda de polling Calendar -> Afonso, chamada pelo pg_cron.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/calendar-poll")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!expected || apikey !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401, headers: { "Content-Type": "application/json" },
          });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { pullAllUsers } = await import("@/lib/calendar/sync.server");
        const result = await pullAllUsers(supabaseAdmin);
        return Response.json({ ok: true, ...result });
      },
    },
  },
});