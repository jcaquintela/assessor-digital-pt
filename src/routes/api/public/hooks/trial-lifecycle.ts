// Cron público: avisos e fim do período experimental de 14 dias.
// Autenticado via header `apikey` com a chave anon do Supabase.

import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/security/cron-auth";

export const Route = createFileRoute("/api/public/hooks/trial-lifecycle")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runTrialLifecycle } = await import("@/lib/subscription/trial.server");
        const result = await runTrialLifecycle(supabaseAdmin);
        return new Response(JSON.stringify({ ok: true, ...result }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});