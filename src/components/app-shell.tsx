import { BRAND_NAME } from "@/lib/brand";
import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { BrandMark } from "@/components/brand-mark";
import { useEffectiveTier } from "@/lib/subscription/use-effective-tier";
import { useDesignV2 } from "@/lib/design/use-design-v2";
import {
  NAV_DESKTOP_V1,
  NAV_MOBILE,
  NAV_MORE_ENTRY,
  NAV_PRIMARY_V2,
  visibleNav,
} from "@/lib/nav/nav-items";
import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { trackNavRota } from "@/lib/telemetry/ui-events";
import { GlobalSearch } from "@/components/hoje/global-search";
import { AccountArchiveBanner } from "@/components/account-archive-banner";
import { AnnouncementBanner } from "@/components/announcement-banner";
import { TierAuthNotice } from "@/components/subscricao/tier-auth-notice";
import { TierPreviewBanner } from "@/components/tier-preview";


// "/negocio" (Faturação) e "/negocios" (Negócios) partilham prefixo: um
// startsWith simples destacava os dois ao mesmo tempo. Só conta a rota exata
// ou um filho separado por barra.
export function isNavActive(pathname: string, to: string) {
  if (to === "/hoje") return pathname === "/hoje";
  return pathname === to || pathname.startsWith(`${to}/`);
}


export function AppShell({ children, fullBleed = false }: { children: ReactNode; fullBleed?: boolean }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Enquanto o tier ainda não carregou, assume 'base' — menos módulos visíveis,
  // nunca revela algo que o utilizador não tenha direito a ver.
  const { data: tierData } = useEffectiveTier();
  const tier = tierData?.tier ?? "base";
  const v2 = useDesignV2();
  // v2: 5 áreas na barra + "Mais". v1: as 10 de sempre.
  const desktopEntries = v2 ? [...NAV_PRIMARY_V2, NAV_MORE_ENTRY] : NAV_DESKTOP_V1;
  const visibleDesktopNav = visibleNav(desktopEntries, tier);
  const visibleMobileNav = visibleNav(NAV_MOBILE, tier);

  // Telemetria de navegação: que áreas são realmente usadas (valida o
  // agrupamento da barra com dados, não com intuição).
  useEffect(() => {
    trackNavRota(pathname);
  }, [pathname]);


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
    <>
    <TierPreviewBanner />
    <div
      className={cn(
        "consult-root text-foreground",
        v2 && "v2",
        // Mobile: fixed viewport grid (header?/main/nav). Desktop: normal flow.
        "grid md:block",
        fullBleed
          ? "h-[100dvh] grid-rows-[minmax(0,1fr)] overflow-hidden md:h-auto md:overflow-visible"
          : "min-h-[100dvh] grid-rows-[minmax(0,1fr)]",
      )}
    >
      {/* Desktop sidebar */}
      <aside className="consult-nav fixed inset-y-0 left-0 z-20 hidden w-64 flex-col px-4 py-6 md:flex">
        <Link to="/hoje" className="mb-8 flex items-center gap-2 px-2">
          <BrandMark size={36} />
          <div className="min-w-0">
            <div className="brand text-[15px] font-medium leading-tight">{BRAND_NAME}</div>
            <div className="c-muted truncate text-xs">o teu assessor</div>
          </div>
        </Link>
        <nav className="flex flex-col gap-0.5">
          {visibleDesktopNav.map(({ to, label, icon: Icon }) => {
            const active = isNavActive(pathname, to);
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
        <div className="navfoot mt-auto flex flex-col gap-2">
          <p className="text-xs">Por conversa ou aqui no dashboard.</p>
          {/* No v2, "Sobre a IA" vive dentro de "Mais": não o repetimos aqui. */}
          {!v2 && (
            <Link
              to="/sobre-a-ia"
              className={cn("navitem text-xs", isNavActive(pathname, "/sobre-a-ia") && "active")}
            >
              <Sparkles className="h-4 w-4 shrink-0" />
              <span className="truncate">Sobre a IA</span>
            </Link>
          )}
        </div>

      </aside>

      {/* Main */}
      {fullBleed ? (
        <main className="mobile-nav-pad min-h-0 min-w-0 overflow-hidden md:ml-64 md:overflow-visible md:pb-8">
          <div className="h-full min-w-0 md:mx-auto md:h-auto md:max-w-6xl md:px-8 md:py-10">{children}</div>
        </main>
      ) : (
        <main className="mobile-nav-pad min-h-0 min-w-0 md:ml-64 md:pb-8">
          <div
            /* Acima da tab bar (40) e do botão flutuante (45) para que os
               resultados da pesquisa nunca fiquem tapados; abaixo dos
               overlays Radix (50). */
            className="sticky top-0 z-[46] backdrop-blur"
            style={{
              background: "color-mix(in srgb, var(--paper) 88%, transparent)",
              borderBottom: "1px solid var(--line)",
              // Não se sobrepõe à status bar do iOS (0px em ecrãs sem notch).
              paddingTop: "env(safe-area-inset-top, 0px)",
            }}
          >
            <div className="c-search mx-auto min-w-0 max-w-6xl px-4 py-3 md:px-8 md:py-4">
              <GlobalSearch size="lg" />
            </div>
          </div>
          <div className="mx-auto min-w-0 max-w-6xl px-4 py-6 md:px-8 md:py-8">
            <AccountArchiveBanner />
            <AnnouncementBanner />
            <TierAuthNotice />
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
            const active = isNavActive(pathname, to);
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "flex min-w-0 flex-col items-center gap-1 px-0.5 py-2 text-[10px]",
                  active ? "font-semibold" : "c-muted",
                )}
                style={active ? { color: "var(--brass-dark)" } : undefined}
                title={label}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {/* Com 6 áreas, rótulos longos ("Drive Inteligente") têm de
                    encolher em vez de empurrar a barra para fora do ecrã. */}
                <span className="w-full text-center leading-tight [overflow-wrap:anywhere]">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
    </>
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
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:flex-nowrap sm:items-end sm:gap-4">
      <div className="min-w-0 flex-1 basis-full sm:basis-auto">
        <h1 className="c-serif truncate text-2xl font-medium md:text-[30px]">{title}</h1>
        {subtitle ? <p className="c-muted mt-1 text-sm">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}