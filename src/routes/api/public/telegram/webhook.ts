// Webhook público do Telegram Bot API.
// Valida o secret_token e delega ao Channel Gateway (adapter + pipeline).
// Toda a lógica (parsing, onboarding por convite, media, motor v3) vive em
// src/lib/assessor/channel-gateway/*.

import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { deriveTelegramWebhookSecret } from "@/lib/telegram/provider.server";
import { getAdapter } from "@/lib/assessor/channel-gateway/adapter";
import { runInboundPipeline } from "@/lib/assessor/channel-gateway/ingest.server";

function safeEqStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  try { return timingSafeEqual(ab, bb); } catch { return false; }
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!process.env.TELEGRAM_API_KEY || !process.env.LOVABLE_API_KEY) {
          console.error("[telegram-webhook] secrets em falta");
          return new Response("Server misconfigured", { status: 500 });
        }

        let expectedSecret: string;
        try {
          expectedSecret = await deriveTelegramWebhookSecret();
        } catch (err) {
          console.error("[telegram-webhook] derive secret:", err);
          return new Response("Server misconfigured", { status: 500 });
        }

        const actual = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqStr(actual, expectedSecret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        let update: any;
        try { update = await request.json(); } catch { return new Response("Bad Request", { status: 400 }); }

        try {
          const adapter = getAdapter("telegram");
          const inbounds = adapter.parseUpdate(update);
          if (inbounds.length > 0) {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            for (const n of inbounds) {
              await runInboundPipeline(adapter, supabaseAdmin, n);
            }
          }
        } catch (err) {
          console.error("[telegram-webhook] erro:", err instanceof Error ? err.message : err);
        }
        return Response.json({ ok: true });
      },
    },
  },
});
