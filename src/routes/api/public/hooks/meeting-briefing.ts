// Cron (a cada 5 minutos): cartela de briefing 15 min antes de um
// compromisso com pessoa associada. Autenticado via header `apikey`.

import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/security/cron-auth";

export const Route = createFileRoute("/api/public/hooks/meeting-briefing")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const body = (await request.json().catch(() => ({}))) as { userId?: string };
        const { runMeetingBriefingTick } = await import(
          "@/lib/assessor/proactive/meeting-briefing.server"
        );
        const result = await runMeetingBriefingTick(supabaseAdmin as any, {
          ...(body?.userId ? { userId: body.userId } : {}),
        });
        return new Response(JSON.stringify({ ok: true, result }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});