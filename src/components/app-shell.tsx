import { Link, useRouterState } from "@tanstack/react-router";
import {
  CalendarDays,
  FileText,
  Home,
  ListChecks,
  MessageSquare,
  MoreHorizontal,
  Settings,
  Sparkles,
  Building2,
  Users,
  Wallet,
  Briefcase,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const desktopNav = [
  { to: "/hoje", label: "Hoje", icon: Home },
  { to: "/assessor", label: "Assessor", icon: MessageSquare },
  { to: "/pessoas", label: "Pessoas", icon: Users },
  { to: "/oportunidades", label: "Oportunidades", icon: Briefcase },
  { to: "/imoveis", label: "Imóveis", icon: Building2 },
  { to: "/seguimentos", label: "Seguimentos", icon: ListChecks },
  { to: "/calendario", label: "Calendário", icon: CalendarDays },
  { to: "/documentos", label: "Documentos", icon: FileText },
  { to: "/negocio", label: "O Meu Negócio", icon: Wallet },
  { to: "/definicoes", label: "Definições", icon: Settings },
] as const;

const mobileNav = [
  { to: "/assessor", label: "Assessor", icon: MessageSquare },
  { to: "/hoje", label: "Hoje", icon: Home },
  { to: "/seguimentos", label: "Seguimentos", icon: ListChecks },
  { to: "/mais", label: "Mais", icon: MoreHorizontal },
] as const;

export function AppShell({ children, fullBleed = false }: { children: ReactNode; fullBleed?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-border bg-card/60 px-4 py-6 md:flex">
        <Link to="/hoje" className="mb-8 flex items-center gap-2 px-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight">Assessor</div>
            <div className="truncate text-xs text-muted-foreground">do Consultor</div>
          </div>
        </Link>
        <nav className="flex flex-col gap-0.5">
          {desktopNav.map(({ to, label, icon: Icon }) => {
            const active = pathname === to || (to !== "/hoje" && pathname.startsWith(to));
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto rounded-xl border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          Modo demo — dados fictícios.
        </div>
      </aside>

      {/* Main */}
      {fullBleed ? (
        <main className="md:ml-64 md:pb-8">
          <div className="hidden md:block md:mx-auto md:max-w-6xl md:px-8 md:py-10">{children}</div>
          <div className="md:hidden">{children}</div>
        </main>
      ) : (
        <main className="pb-24 md:ml-64 md:pb-8">
          <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">{children}</div>
        </main>
      )}

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-4">
          {mobileNav.map(({ to, label, icon: Icon }) => {
            const active = pathname === to || (to !== "/hoje" && pathname.startsWith(to));
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px]",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}