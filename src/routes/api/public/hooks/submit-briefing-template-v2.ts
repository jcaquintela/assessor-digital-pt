// Submete o template de briefing v2 (5 variáveis + botão) à Meta.
// O template atual mantém-se activo enquanto o v2 não for aprovado.

import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/security/cron-auth";

export const Route = createFileRoute("/api/public/hooks/submit-briefing-template-v2")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;

        const { submitMeetingBriefingTemplateV2 } = await import(
          "@/lib/whatsapp/template-status.server"
        );
        const result = await submitMeetingBriefingTemplateV2();
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
          status: result.ok ? 200 : 502,
        });
      },
    },
  },
});
