// Cron público: janela de conversa ativa do plano Base (21 dias) e
// retenção de documentos do plano Base (7 dias / 100 MB).
// Autenticado via header `apikey` com a chave anon do Supabase.

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/telegram-retention")({
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
        const { runTelegramRetention } = await import("@/lib/retention/telegram-retention.server");
        const { runDocumentsRetention } = await import("@/lib/retention/documents.server");
        const result = await runTelegramRetention(supabaseAdmin);
        const docs = await runDocumentsRetention(supabaseAdmin);
        return new Response(JSON.stringify({ ok: true, ...result, ...docs }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});