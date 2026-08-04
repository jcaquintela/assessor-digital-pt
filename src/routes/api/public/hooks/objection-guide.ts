// Cron (a cada 5 minutos): guião de objeções 10 min antes de uma reunião de
// angariação. Autenticado via header `x-cron-secret`.

import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/security/cron-auth";

export const Route = createFileRoute("/api/public/hooks/objection-guide")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const body = (await request.json().catch(() => ({}))) as { userId?: string };
        const { runObjectionGuideTick } = await import(
          "@/lib/assessor/proactive/objection-guide.server"
        );
        const result = await runObjectionGuideTick(supabaseAdmin as any, {
          ...(body?.userId ? { userId: body.userId } : {}),
        });
        return new Response(JSON.stringify({ ok: true, result }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});