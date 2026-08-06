import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { getAdapter } from "@/lib/assessor/channel-gateway/adapter";
import { runInboundPipeline } from "@/lib/assessor/channel-gateway/ingest.server";

// Webhook público da Meta WhatsApp Cloud API.
// Caminho: /api/public/whatsapp-webhook (bypassa autenticação do site).
// GET  → verificação do webhook (hub.mode / hub.verify_token / hub.challenge).
// POST → valida HMAC; delega ao Channel Gateway (adapter + runInboundPipeline).
// Toda a lógica de negócio vive em src/lib/assessor/channel-gateway/*.

function verifySignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const provided = header.slice("sha256=".length).trim();
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  try { return timingSafeEqual(a, b); } catch { return false; }
}

export const Route = createFileRoute("/api/public/whatsapp-webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        const expected = process.env.WHATSAPP_VERIFY_TOKEN;
        if (!expected) {
          console.error("[whatsapp-webhook] WHATSAPP_VERIFY_TOKEN não configurado");
          return new Response("Server misconfigured", { status: 500 });
        }
        if (mode === "subscribe" && token && token === expected && challenge) {
          return new Response(challenge, {
            status: 200,
            headers: { "content-type": "text/plain; charset=utf-8" },
          });
        }
        return new Response("Forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        const appSecret = process.env.WHATSAPP_APP_SECRET;
        if (!appSecret) {
          console.error("[whatsapp-webhook] WHATSAPP_APP_SECRET não configurado");
          return new Response("Server misconfigured", { status: 500 });
        }
        const raw = await request.text();
        const signature = request.headers.get("x-hub-signature-256");
        if (!verifySignature(raw, signature, appSecret)) {
          console.warn("[whatsapp-webhook] assinatura inválida");
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: unknown;
        try { payload = JSON.parse(raw); } catch { return new Response("Bad Request", { status: 400 }); }

        try {
          const adapter = getAdapter("whatsapp");
          const inbounds = adapter.parseUpdate(payload);

          // Relatórios de entrega/leitura (sent → delivered → read).
          const statuses: any[] = [];
          for (const entry of ((payload as any)?.entry ?? [])) {
            for (const change of (entry?.changes ?? [])) {
              if (Array.isArray(change?.value?.statuses)) statuses.push(...change.value.statuses);
            }
          }
          if (statuses.length > 0) {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { applyDeliveryStatuses } = await import("@/lib/whatsapp/delivery-status.server");
            await applyDeliveryStatuses(supabaseAdmin, statuses);
          }

          if (inbounds.length > 0) {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const { markInboundReply } = await import("@/lib/whatsapp/delivery-status.server");
            for (const n of inbounds) {
              if (n.externalConversationId) {
                await markInboundReply(supabaseAdmin, n.externalConversationId);
              }
              await runInboundPipeline(adapter, supabaseAdmin, n);
            }
          }
        } catch (err) {
          console.error(
            "[whatsapp-webhook] erro a processar evento:",
            err instanceof Error ? err.message : err,
          );
        }

        // Sempre 200 para a Meta parar de reenviar quando a assinatura é válida.
        return new Response("OK", { status: 200 });
      },
    },
  },
});
