import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useEffectiveTier } from "@/lib/subscription/use-effective-tier";
import { isModuleVisible } from "@/lib/subscription/tiers";
import {
  CalendarDays,
  Home,
  Inbox,
  MoreHorizontal,
  Settings,
  Sparkles,
  Building2,
  Users,
  Wallet,
  FolderOpen,
  Handshake,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { GlobalSearch } from "@/components/hoje/global-search";
import { AnnouncementBanner } from "@/components/announcement-banner";

const desktopNav = [
  { to: "/hoje", label: "Hoje", icon: Home },
  { to: "/pessoas", label: "Pessoas", icon: Users },
  { to: "/imoveis", label: "Imóveis", icon: Building2 },
  { to: "/negocios", label: "Negócios", icon: Handshake },
  { to: "/calendario", label: "Agenda", icon: CalendarDays },
  { to: "/drive", label: "Drive", icon: FolderOpen },
  { to: "/negocio", label: "Faturação", icon: Wallet },
  { to: "/diversos", label: "Diversos", icon: Inbox },
  { to: "/definicoes", label: "Definições", icon: Settings },
] as const;

const mobileNav = [
  { to: "/hoje", label: "Hoje", icon: Home },
  { to: "/pessoas", label: "Pessoas", icon: Users },
  { to: "/imoveis", label: "Imóveis", icon: Building2 },
  { to: "/mais", label: "Mais", icon: MoreHorizontal },
] as const;

export function AppShell({ children, fullBleed = false }: { children: ReactNode; fullBleed?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Enquanto o tier ainda não carregou, assume 'base' — menos módulos visíveis,
  // nunca revela algo que o utilizador não tenha direito a ver.
  const { data: tierData } = useEffectiveTier();
  const tier = tierData?.tier ?? "base";
  const visibleDesktopNav = desktopNav.filter((n) => isModuleVisible(n.to, tier));
  const visibleMobileNav = mobileNav.filter((n) => isModuleVisible(n.to, tier));

  // Detect on-screen keyboard via visualViewport and expose as html[data-keyboard].
  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    const html = document.documentElement;
    const update = () => {
      const diff = window.innerHeight - vv.height;
      html.dataset.keyboard = diff > 120 ? "open" : "closed";
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("orientationchange", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
      delete html.dataset.keyboard;
    };
  }, []);

  return (
    <div
      className={cn(
        "consult-root text-foreground",
        // Mobile: fixed viewport grid (header?/main/nav). Desktop: normal flow.
        "grid md:block",
        fullBleed
          ? "h-[100svh] h-[100dvh] grid-rows-[minmax(0,1fr)_auto] overflow-hidden md:h-auto md:overflow-visible"
          : "min-h-[100dvh] grid-rows-[minmax(0,1fr)_auto]",
      )}
    >
      {/* Desktop sidebar */}
      <aside className="consult-nav fixed inset-y-0 left-0 z-20 hidden w-64 flex-col px-4 py-6 md:flex">
        <Link to="/hoje" className="mb-8 flex items-center gap-2 px-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: "var(--brass)", color: "#241703" }}>
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="brand text-[15px] font-medium leading-tight">Assessor</div>
            <div className="c-muted truncate text-xs">do Consultor</div>
          </div>
        </Link>
        <nav className="flex flex-col gap-0.5">
          {visibleDesktopNav.map(({ to, label, icon: Icon }) => {
            const active = pathname === to || (to !== "/hoje" && pathname.startsWith(to));
            return (
              <Link
                key={to}
                to={to}
                className={cn("navitem", active && "active")}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="navfoot mt-auto">
          Por conversa ou aqui no dashboard.
        </div>
      </aside>

      {/* Main */}
      {fullBleed ? (
        <main className="min-h-0 min-w-0 overflow-hidden md:ml-64 md:overflow-visible md:pb-8">
          <div className="h-full min-w-0 md:mx-auto md:h-auto md:max-w-6xl md:px-8 md:py-10">{children}</div>
        </main>
      ) : (
        <main className="min-h-0 min-w-0 md:ml-64 md:pb-8">
          <div
            className="sticky top-0 z-30 backdrop-blur"
            style={{ background: "color-mix(in srgb, var(--paper) 88%, transparent)", borderBottom: "1px solid var(--line)" }}
          >
            <div className="c-search mx-auto min-w-0 max-w-6xl px-4 py-3 md:px-8 md:py-4">
              <GlobalSearch size="lg" />
            </div>
          </div>
          <div className="mx-auto min-w-0 max-w-6xl px-4 py-6 md:px-8 md:py-8">
            <AnnouncementBanner />
            {children}
          </div>
        </main>
      )}

      {/* Mobile bottom nav */}
      <nav
        className="mobile-bottom-nav backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)", background: "var(--paper-2)", borderTop: "1px solid var(--line)" }}
      >
        <div
          className="mx-auto grid max-w-lg"
          style={{ gridTemplateColumns: `repeat(${visibleMobileNav.length}, minmax(0, 1fr))` }}
        >
          {visibleMobileNav.map(({ to, label, icon: Icon }) => {
            const active = pathname === to || (to !== "/hoje" && pathname.startsWith(to));
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px]",
                  active ? "font-semibold" : "c-muted",
                )}
                style={active ? { color: "var(--brass-dark)" } : undefined}
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
        <h1 className="c-serif truncate text-2xl font-medium md:text-[30px]">{title}</h1>
        {subtitle ? <p className="c-muted mt-1 text-sm">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}