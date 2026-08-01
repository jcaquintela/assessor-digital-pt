import { createFileRoute } from "@tanstack/react-router";

/**
 * Beacon da landing page. Sem cookies, sem IP, sem identificadores:
 * só data, hora, domínio de origem e caminho. Serve para termos o primeiro
 * passo do funil de aquisição ("visitou a landing") com dados reais.
 *
 * Uso na landing:
 *   navigator.sendBeacon("https://<dominio>/api/public/beacon",
 *     JSON.stringify({ path: location.pathname, referrer: document.referrer }))
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

function hostOf(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  try {
    return new URL(value).hostname.slice(0, 120);
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/public/beacon")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let body: any = {};
        try {
          body = JSON.parse(await request.text());
        } catch {
          body = {};
        }
        const path = typeof body.path === "string" ? body.path.slice(0, 200) : "/";
        const referrerHost = hostOf(body.referrer) ?? hostOf(request.headers.get("referer"));
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin
            .from("landing_page_visits")
            .insert({ path, referrer_host: referrerHost } as never);
        } catch {
          // O beacon nunca deve partir a landing page.
        }
        return new Response(null, { status: 204, headers: CORS });
      },
    },
  },
});