// Cron horário: push da manhã (prioridades) e check-in da tarde (resultados).
// Autenticado via header `apikey` com a chave anon.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/proactive-push")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? "";
        const expected =
          process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        if (!apikey || !expected || apikey !== expected) {
          return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
            status: 401, headers: { "Content-Type": "application/json" },
          });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const body = (await request.json().catch(() => ({}))) as {
          userId?: string; mode?: "morning" | "checkin"; force?: boolean;
        };
        const {
          runProactivePushTick, sendMorningPush, sendEveningCheckin,
        } = await import("@/lib/assessor/proactive/push.server");

        // Modo de teste dirigido (usado para validar numa conta específica).
        if (body?.userId) {
          const force = body.force === true;
          const result = body.mode === "checkin"
            ? await sendEveningCheckin(supabaseAdmin as any, body.userId, { force })
            : await sendMorningPush(supabaseAdmin as any, body.userId, { force });
          return new Response(JSON.stringify({ ok: true, mode: body.mode ?? "morning", result }), {
            headers: { "Content-Type": "application/json" },
          });
        }

        const result = await runProactivePushTick(supabaseAdmin as any, {});
        return new Response(JSON.stringify({ ok: true, ...result }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});