// Submete a versão corrigida do template de check-in (v2) à Meta.
// Mantém o template antigo activo enquanto o novo não for aprovado.
// Autenticado via header `apikey` com a chave anon.

import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/security/cron-auth";

export const Route = createFileRoute("/api/public/hooks/submit-checkin-template")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;

        const { submitCheckinTemplateV2 } = await import("@/lib/whatsapp/template-status.server");
        const result = await submitCheckinTemplateV2();
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
          status: result.ok ? 200 : 502,
        });
      },
    },
  },
});
