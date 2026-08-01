import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/tmp-template-test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        if (!apikey || apikey !== expected) return new Response("no", { status: 401 });
        const body = (await request.json()) as { userId: string; title: string };
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { resolveOutboundTarget } = await import("@/lib/assessor/primary-channel.server");
        const { checkinTemplatePayload } = await import("@/lib/assessor/proactive/templates");
        const { sendWhatsAppPayload } = await import("@/lib/whatsapp/send.server");
        const target = await resolveOutboundTarget(supabaseAdmin as any, body.userId);
        if (!target || target.channel !== "whatsapp") {
          return new Response(JSON.stringify({ ok: false, target }), { headers: { "Content-Type": "application/json" } });
        }
        const r = await sendWhatsAppPayload(target.externalId, checkinTemplatePayload(body.title), { kind: "auto" });
        return new Response(JSON.stringify({ ok: r.ok, r }), { headers: { "Content-Type": "application/json" } });
      },
    },
  },
});
