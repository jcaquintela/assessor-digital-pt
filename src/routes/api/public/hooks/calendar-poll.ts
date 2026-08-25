// Ronda de polling Calendar -> Afonso, chamada pelo pg_cron a cada 2 minutos.
//
// Duas cadências independentes na mesma ronda:
//  - delta sync (barato: ~1 chamada por provider) corre sempre;
//  - verificação evento-a-evento corre só para 1/15 dos eventos (rotação
//    completa em ~30 min), para não estourar a quota da Google.
import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/security/cron-auth";
import { verifyPlanForNow } from "@/lib/calendar/verify-slice";

export const Route = createFileRoute("/api/public/hooks/calendar-poll")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { pullAllUsers, takeApiCallCounts } = await import("@/lib/calendar/sync.server");
        const { acquireRoundLock, recordApiCalls } = await import("@/lib/calendar/round-lock.server");

        const lock = await acquireRoundLock(supabaseAdmin);
        if (!lock) return Response.json({ ok: true, skipped: "ronda_anterior_em_curso" });
        try {
          const verify = verifyPlanForNow(Date.now());
          const result = await pullAllUsers(supabaseAdmin, { verify });
          const apiCalls = takeApiCallCounts();
          await recordApiCalls(supabaseAdmin, apiCalls);
          return Response.json({ ok: true, ...result, verifySlice: verify, apiCalls });
        } finally {
          await lock.release();
        }
      },
    },
  },
});
