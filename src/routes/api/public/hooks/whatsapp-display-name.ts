// Rotina: verifica se a revisão da Meta terminou e, nesse caso, submete
// automaticamente o pedido para o display name passar a "Afonso".
// Autenticado com CRON_SECRET.

import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/security/cron-auth";

export const Route = createFileRoute("/api/public/hooks/whatsapp-display-name")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { syncDisplayName } = await import("@/lib/whatsapp/display-name.server");
        const result = await syncDisplayName(supabaseAdmin as any);

        return new Response(JSON.stringify({ ok: result.outcome !== "submit_failed", ...result }), {
          headers: { "Content-Type": "application/json" },
          status: result.outcome === "submit_failed" ? 502 : 200,
        });
      },
    },
  },
});