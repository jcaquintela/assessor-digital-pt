import { appTitle } from "@/lib/brand";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CreditCard, MessageCircle, Plug, ShieldCheck, Sparkles, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PortalShell } from "@/components/v2/portal-shell";
import { V2_POSITIONING } from "@/lib/v2/portal-scope";

const DESC = "A tua conta do Afonso: subscrição, canais, integrações, privacidade e exportação dos teus dados.";

export const Route = createFileRoute("/_authenticated/conta")({
  head: () => ({
    meta: [
      { title: appTitle("Conta") },
      { name: "description", content: DESC },
      { property: "og:title", content: appTitle("Conta") },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContaPage,
});

const AREAS = [
  { to: "/subscricao", icon: CreditCard, title: "Subscrição", text: "Plano, pagamentos e faturas." },
  { to: "/ligar-canal", icon: MessageCircle, title: "Canais", text: "WhatsApp e Telegram ligados à tua conta." },
  { to: "/definicoes", icon: Plug, title: "Integrações", text: "Calendário e email, só com a tua autorização." },
  { to: "/privacidade", icon: ShieldCheck, title: "Privacidade e dados", text: "Ver, corrigir, exportar ou pedir para apagar." },
  { to: "/sobre-a-ia", icon: Sparkles, title: "Sobre a IA", text: "Como o Afonso decide e o que nunca faz sem ti." },
] as const;

function ContaPage() {
  const navigate = useNavigate();
  return (
    <PortalShell title="A tua conta" subtitle={`${V2_POSITIONING}. O trabalho acontece na conversa, no WhatsApp ou no Telegram; aqui só tratas da conta.`}>
      <ul className="grid gap-3 sm:grid-cols-2">
        {AREAS.map(({ to, icon: Icon, title, text }) => (
          <li key={to}>
            <Link to={to} className="flex h-full gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="block font-medium">{title}</span>
                <span className="block text-sm text-muted-foreground">{text}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-8">
        <Button variant="outline" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}>
          <LogOut className="mr-2 h-4 w-4" aria-hidden /> Terminar sessão
        </Button>
      </div>
    </PortalShell>
  );
}
