// Atalho de navegação: /s/<code> → caminho real da aplicação.
//
// Não dá acesso a nada: quem abrir sem sessão vai parar ao ecrã de entrada e
// quem não for dono do registo vê a mensagem normal de "registo noutra conta".
import { createFileRoute } from "@tanstack/react-router";
import { resolveShortLink } from "@/lib/nav/short-link.server";

export const Route = createFileRoute("/s/$code")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const path = await resolveShortLink(supabaseAdmin, String((params as any).code ?? ""));
        if (!path) return new Response(null, { status: 302, headers: { Location: "/hoje" } });
        return new Response(null, { status: 302, headers: { Location: path } });
      },
    },
  },
});
