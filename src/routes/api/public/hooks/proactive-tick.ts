// Cron público: gera e envia nudges proativos aos consultores.
// Autenticado via header `apikey` com a chave anon do Supabase.

import { createFileRoute } from "@tanstack/react-router";
import { requireCronSecret } from "@/lib/security/cron-auth";

export const Route = createFileRoute("/api/public/hooks/proactive-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireCronSecret(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { generateNudgesForUser, persistNudges, dispatchPendingNudges } =
          await import("@/lib/assessor/v3/proactivity.server");
        const { dispatchDueReminders } = await import("@/lib/assessor/v3/reminders.server");
        const { generateSupremeNudges } = await import("@/lib/assessor/supreme/briefing.server");
        const { generateOpportunityDigestNudges } = await import("@/lib/opportunities/digest.server");
        const { listSupremeUsers } = await import("@/lib/assessor/supreme/feature-flag.server");

        // Só corre para utilizadores com v3 activa.
        const { data: v3Users } = await supabaseAdmin
          .from("feature_flag_users")
          .select("user_id")
          .eq("flag_key", "assessor.engine.v3");
        const userIds = ((v3Users as any[]) ?? []).map((r) => r.user_id);

        let generated = 0;
        for (const uid of userIds) {
          const drafts = await generateNudgesForUser(supabaseAdmin as any, uid);
          if (drafts.length) {
            const created = await persistNudges(supabaseAdmin as any, uid, drafts);
            generated += created.length;
          }
        }

        // Daily Operating Loop — só utilizadores com Assessor Supremo v1.
        const supremeIds = await listSupremeUsers(supabaseAdmin as any);
        let supremeGenerated = 0;
        for (const uid of supremeIds) {
          const drafts = await generateSupremeNudges(supabaseAdmin as any, uid);
          if (drafts.length) {
            const created = await persistNudges(supabaseAdmin as any, uid, drafts);
            supremeGenerated += created.length;
          }
        }
        const dispatched = await dispatchPendingNudges(supabaseAdmin as any, {});

        // Resumo diário de oportunidades detetadas (agregado, nunca em tempo real).
        let digests = 0;
        for (const uid of userIds) {
          try {
            const drafts = await generateOpportunityDigestNudges(supabaseAdmin as any, uid);
            if (drafts.length) {
              digests += (await persistNudges(supabaseAdmin as any, uid, drafts)).length;
            }
          } catch { /* noop */ }
        }
        const reminders = await dispatchDueReminders(supabaseAdmin as any, {});

        // Rotinas (lembretes recorrentes) — materializa os que já venceram.
        const { materializeDueRoutinesServer } = await import("@/lib/assessor/routines-run.server");
        let routines = { created: 0, skipped: 0 };
        try { routines = await materializeDueRoutinesServer(supabaseAdmin as any); } catch { /* noop */ }

        return new Response(
          JSON.stringify({
            ok: true,
            users: userIds.length,
            generated,
            supremeUsers: supremeIds.length,
            supremeGenerated,
            opportunityDigests: digests,
            ...dispatched,
            remindersSent: reminders.sent,
            remindersFailed: reminders.failed,
            remindersSkipped: reminders.skipped,
            routinesCreated: routines.created,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});