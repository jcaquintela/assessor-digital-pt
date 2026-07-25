import { createFileRoute } from "@tanstack/react-router";

// Webhook público da Meta WhatsApp Cloud API.
// Caminho: /api/public/whatsapp-webhook  (bypassa autenticação do site).
//
// GET  -> verificação do webhook (hub.mode / hub.verify_token / hub.challenge)
// POST -> receção de eventos; nesta fase apenas regista o payload nos logs.
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
        try {
          const raw = await request.text();
          // Nesta primeira fase apenas registamos o payload — sem processamento IA.
          console.log("[whatsapp-webhook] payload recebido:", raw);
        } catch (err) {
          console.error("[whatsapp-webhook] falha a ler payload:", err);
        }
        // A Meta espera 200 rápido, senão faz retry.
        return new Response("OK", { status: 200 });
      },
    },
  },
});