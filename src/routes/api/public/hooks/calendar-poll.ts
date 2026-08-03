// Ronda de polling Calendar -> Afonso, chamada pelo pg_cron.
import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/security/cron-auth";

export const Route = createFileRoute("/api/public/hooks/calendar-poll")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { pullAllUsers } = await import("@/lib/calendar/sync.server");
        const result = await pullAllUsers(supabaseAdmin);
        return Response.json({ ok: true, ...result });
      },
    },
  },
});