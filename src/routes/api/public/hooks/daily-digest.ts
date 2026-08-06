// Cron público: envia o resumo diário de novidades aos beta testers ativos.
//
// Chamado de hora a hora pelo pg_cron; só age quando em Lisboa são 19h (isto
// resolve a mudança de hora sem mexer no agendamento). Se o rascunho do dia
// não estiver aprovado, ou não tiver texto, não sai email nenhum.

import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/security/cron-auth";

export const Route = createFileRoute("/api/public/hooks/daily-digest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const d = await import("@/lib/admin/digest.server");

        const hour = d.lisbonHour();
        if (hour !== d.DIGEST_HOUR) {
          return new Response(JSON.stringify({ ok: true, skipped: "fora_da_hora", hour }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        const result = await d.sendDigestForDate(supabaseAdmin, d.lisbonDate());
        return new Response(JSON.stringify({ ok: true, ...result }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
