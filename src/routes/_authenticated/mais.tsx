import { appTitle } from "@/lib/brand";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight } from "lucide-react";
import { NAV_MAIS_PAGE, visibleNav } from "@/lib/nav/nav-items";
import { useEffectiveTier } from "@/lib/subscription/use-effective-tier";

export const Route = createFileRoute("/_authenticated/mais")({
  head: () => ({
    meta: [
      { title: appTitle("Mais") },
      { name: "description", content: "Aceda a mais áreas do Afonso." },
      { property: "og:title", content: appTitle("Mais") },
      { property: "og:description", content: "Aceda a mais áreas do Afonso." },
    ],
  }),
  component: MaisPage,
});

function MaisPage() {
  // Mesmo gate da barra lateral: consolidar o menu não pode expor módulos
  // que o plano do consultor não inclui.
  const { data: tierData } = useEffectiveTier();
  const items = visibleNav(NAV_MAIS_PAGE, tierData?.tier ?? "base");
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