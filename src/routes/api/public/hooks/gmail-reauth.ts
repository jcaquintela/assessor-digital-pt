// Cron diário: avisa os consultores cuja autorização do Gmail está a expirar.
// Em modo Teste o Google corta o acesso de 7 em 7 dias — o Afonso avisa antes.

import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/security/cron-auth";

export const Route = createFileRoute("/api/public/hooks/gmail-reauth")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { warnExpiringGmailConnections } = await import("@/lib/email/gmail/reauth.server");
        const result = await warnExpiringGmailConnections(supabaseAdmin as any);
        return new Response(JSON.stringify({ ok: true, ...result }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});