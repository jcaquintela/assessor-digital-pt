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

        // Assim que o template de convite fica aprovado, os convites que
        // ficaram presos à espera dele saem sozinhos — sem o admin ter de
        // voltar a esta página.
        let convites: { tentados: number; enviados: number; falhados: number } | null = null;
        const { isTemplateApproved } = await import("@/lib/whatsapp/template-status.server");
        const { TEMPLATE_INVITE } = await import("@/lib/whatsapp/invite-template");
        if (await isTemplateApproved(TEMPLATE_INVITE)) {
          const { retryPendingInvites } = await import("@/lib/admin/invite-retry.server");
          convites = await retryPendingInvites(supabaseAdmin as any);
        }

        return new Response(JSON.stringify({ ok: true, ...result, convites }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});