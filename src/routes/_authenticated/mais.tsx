import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { MODULE_NAME } from "@/lib/seo/module-names";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, CalendarDays, ChevronRight, CreditCard, FolderOpen, Inbox, MapPin, MessagesSquare, Repeat, Settings, Sparkles, Users, Wallet, Briefcase } from "lucide-react";

export const Route = createFileRoute("/_authenticated/mais")({
  head: () => ({
    meta: [
      { title: "Mais — Afonso" },
      { name: "description", content: "Aceda a mais áreas do assessor." },
      { property: "og:title", content: "Mais — Afonso" },
      { property: "og:description", content: "Aceda a mais áreas do assessor." },
    ],
  }),
  component: MaisPage,
});

const items = [
  { to: "/pessoas", label: "Pessoas", icon: Users },
  { to: "/negocios", label: "Negócios", icon: Briefcase },
  { to: "/imoveis", label: "Imóveis", icon: Building2 },
  { to: "/oportunidades/prospecao", label: "Prospeção", icon: MapPin },
  { to: "/calendario", label: "Calendário", icon: CalendarDays },
  { to: "/rotinas", label: "Rotinas", icon: Repeat },
  { to: "/interacoes", label: "Interações", icon: MessagesSquare },
  { to: "/drive", label: MODULE_NAME.drive, icon: FolderOpen },
  { to: "/diversos", label: "Diversos", icon: Inbox },
  { to: "/negocio", label: "Faturação", icon: Wallet },
  { to: "/subscricao", label: "Subscrição", icon: CreditCard },
  { to: "/definicoes", label: "Definições", icon: Settings },
  { to: "/sobre-a-ia", label: "Sobre a IA", icon: Sparkles },
] as const;

function MaisPage() {
  return (
    <AppShell>
      <PageHeader title="Mais" />
      <Card>
        <CardContent className="divide-y divide-border p-0">
          {items.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className="flex items-center justify-between px-4 py-3 hover:bg-muted/50">
              <div className="flex items-center gap-3">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{label}</span>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          ))}
        </CardContent>
      </Card>
    </AppShell>
  );
}