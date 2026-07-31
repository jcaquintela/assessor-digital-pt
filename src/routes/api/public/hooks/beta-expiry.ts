// Cron público: termina períodos de teste expirados e devolve as contas a Base.
// Autenticado via header `apikey` com a chave anon do Supabase.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/beta-expiry")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? "";
        const expected =
          process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        if (!apikey || !expected || apikey !== expected) {
          return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { expireDueBetaTesters } = await import("@/lib/admin/beta.server");
        const result = await expireDueBetaTesters(supabaseAdmin);
        return new Response(JSON.stringify({ ok: true, ...result }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
