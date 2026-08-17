import { BRAND_NAME } from "@/lib/brand";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { hasLinkedChannel } from "@/lib/telegram/link.functions";

export const Route = createFileRoute("/")({
  ssr: false,
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    if (typeof window === "undefined") return;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        navigate({ to: "/auth", replace: true });
        return;
      }
      try {
        const ch = await hasLinkedChannel();
        if (!ch.linked) {
          navigate({ to: "/ligar-canal", replace: true });
          return;
        }
      } catch {
        // segue para o painel — ligar o canal continua disponível em Definições
      }
      // O arranque é sempre "Hoje", em mobile e desktop. A conversa com o
      // Afonso só se abre explicitamente (botão "Falar com Afonso" ou "Mais").
      navigate({ to: "/hoje", replace: true });
    })();
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
      <p className="text-sm">A abrir o {BRAND_NAME}…</p>
    </div>
  );
}
