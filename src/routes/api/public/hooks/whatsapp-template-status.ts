// Corrida periódica: pergunta à Meta o estado dos templates e liga a flag
// `whatsapp.templates.approved` assim que ambos ficarem aprovados.
// Autenticado via header `apikey` com a chave anon.

import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/security/cron-auth";

export const Route = createFileRoute("/api/public/hooks/whatsapp-template-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { syncTemplateApproval } = await import("@/lib/whatsapp/template-status.server");
        const result = await syncTemplateApproval(supabaseAdmin as any);
        return new Response(JSON.stringify({ ok: true, ...result }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});