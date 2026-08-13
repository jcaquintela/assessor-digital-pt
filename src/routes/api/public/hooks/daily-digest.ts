// Cron público: envia o resumo diário de novidades aos beta testers ativos.
//
// Chamado de hora a hora pelo pg_cron; às 19h em Lisboa envia o resumo do dia
// (isto resolve a mudança de hora sem mexer no agendamento). Nas outras horas
// apanha aprovações tardias — aprovado depois das 19h, ainda por sair, com
// menos de 24h. Se o rascunho não estiver aprovado, ou não tiver texto, não
// sai email nenhum.

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
        if (hour === d.DIGEST_HOUR) {
          const result = await d.sendDigestForDate(supabaseAdmin, d.lisbonDate());
          return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
        }

        const pending = await d.findPendingApproved(supabaseAdmin);
        if (!pending.length) {
          return new Response(JSON.stringify({ ok: true, skipped: "fora_da_hora", hour }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        const late: Record<string, unknown>[] = [];
        for (const p of pending) {
          late.push({ date: p.digest_date, ...(await d.sendDigestForDate(supabaseAdmin, p.digest_date)) });
        }
        return new Response(JSON.stringify({ ok: true, late }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
