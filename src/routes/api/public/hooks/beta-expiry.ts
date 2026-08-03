// Cron público: termina períodos de teste expirados e devolve as contas a Base.
// Autenticado via header `x-cron-secret` (segredo privado, nunca no browser).

import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/security/cron-auth";

export const Route = createFileRoute("/api/public/hooks/beta-expiry")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { expireDueBetaTesters } = await import("@/lib/admin/beta.server");
        const result = await expireDueBetaTesters(supabaseAdmin);
        return new Response(JSON.stringify({ ok: true, ...result }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
