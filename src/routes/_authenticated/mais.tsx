import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, CalendarDays, ChevronRight, FileText, Inbox, Settings, Users, Wallet, Briefcase } from "lucide-react";

export const Route = createFileRoute("/_authenticated/mais")({
  head: () => ({
    meta: [
      { title: "Mais — Assessor do Consultor" },
      { name: "description", content: "Aceda a mais áreas do assessor." },
      { property: "og:title", content: "Mais — Assessor do Consultor" },
      { property: "og:description", content: "Aceda a mais áreas do assessor." },
    ],
  }),
  component: MaisPage,
});

const items = [
  { to: "/pessoas", label: "Pessoas", icon: Users },
  { to: "/oportunidades", label: "Oportunidades", icon: Briefcase },
  { to: "/imoveis", label: "Imóveis", icon: Building2 },
  { to: "/calendario", label: "Calendário", icon: CalendarDays },
  { to: "/documentos", label: "Documentos", icon: FileText },
  { to: "/diversos", label: "Diversos", icon: Inbox },
  { to: "/negocio", label: "O Meu Negócio", icon: Wallet },
  { to: "/definicoes", label: "Definições", icon: Settings },
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