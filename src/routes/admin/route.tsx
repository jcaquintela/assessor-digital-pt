import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Outlet, Link, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAdminRole } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, ShieldCheck, ChevronDown, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { HealthStrip } from "@/components/admin/health-strip";
import { navGroups } from "./nav";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AdminLayout,
});

function AdminLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const fetchRole = useServerFn(getMyAdminRole);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "my-role"],
    queryFn: () => fetchRole(),
  });

  // Fecha o menu móvel e move o foco para o conteúdo sempre que mudamos de página.
  useEffect(() => {
    setMenuOpen(false);
    // Pequeno atraso para o drawer terminar de fechar antes de mover o foco.
    const t = setTimeout(() => {
      mainRef.current?.focus();
    }, 50);
    return () => clearTimeout(t);
  }, [pathname]);

  const handleNavClick = useCallback(() => {
    setMenuOpen(false);
  }, []);

  if (isLoading) {
    return <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">A verificar permissões…</div>;
  }
  if (error || !data?.isAdmin) {
    navigate({ to: "/", replace: true });
    return null;
  }

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const renderNav = (onNavClick?: () => void) =>
    navGroups.map((g) => {
      const hasActive = g.items.some((n) => (n.exact ? pathname === n.to : pathname.startsWith(n.to)));
      const open = closed[g.group] ? false : true;
      return (
        <div key={g.group}>
          <button
            type="button"
            onClick={() => setClosed((c) => ({ ...c, [g.group]: !c[g.group] }))}
            className="navgroup flex w-full items-center justify-between gap-2 text-left uppercase"
            aria-expanded={open}
          >
            <span>{g.group}</span>
            <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} />
          </button>
          {(open || hasActive) &&
            g.items.map((n) => {
              const active = n.exact ? pathname === n.to : pathname.startsWith(n.to);
              return (
                <Link
                  key={n.to}
                  to={n.to as any}
                  className={`navitem ${active ? "active" : ""}`}
                  onClick={onNavClick}
                >
                  {n.label}
                </Link>
              );
            })}
        </div>
      );
    });

  return (
    <div className="admin-root min-h-screen">
      <aside className="admin-nav fixed inset-y-0 left-0 z-20 hidden w-56 flex-col py-6 md:flex">
        <div className="brand flex items-center gap-2 px-[22px] pb-6">
          <span className="dot" />
          Afonso — admin
        </div>
        <nav className="flex-1 overflow-y-auto">{renderNav()}</nav>
        <div className="navfoot">
          <div className="capitalize">{data.role.replace("_", " ")}</div>
          <Link to="/" className="mt-2 block hover:underline">← Voltar à app</Link>
          <button type="button" onClick={signOut} className="mt-2 flex items-center gap-1 hover:underline">
            <LogOut className="h-3 w-3" /> Terminar sessão
          </button>
        </div>
      </aside>
      <header className="admin-nav sticky top-0 z-10 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-2 py-2 md:hidden">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="Abrir menu do admin"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-white"
            >
              <Menu className="h-5 w-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="admin-nav w-72 overflow-y-auto border-0 p-0">
            <SheetTitle className="sr-only">Navegação do admin</SheetTitle>
            <div className="flex min-h-full flex-col py-6">
              <div className="brand flex items-center gap-2 px-[22px] pb-6">
                <span className="dot" />
                Afonso — admin
              </div>
              <nav className="flex-1">{renderNav(handleNavClick)}</nav>
              <div className="navfoot">
                <div className="capitalize">{data.role.replace("_", " ")}</div>
                <Link to="/" className="mt-2 block hover:underline">← Voltar à app</Link>
                <button type="button" onClick={signOut} className="mt-2 flex items-center gap-1 hover:underline">
                  <LogOut className="h-3 w-3" /> Terminar sessão
                </button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
        <div className="flex min-w-0 items-center gap-2 text-white">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span className="truncate text-sm font-semibold">Afonso — admin</span>
        </div>
        <Button variant="ghost" size="sm" className="text-xs text-white" onClick={signOut}>Sair</Button>
      </header>
      <main className="md:pl-56">
        <div className="mx-auto max-w-6xl px-4 py-8 md:px-10 md:pb-16">
          <HealthStrip />
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export function useAdminRole() {
  const fetchRole = useServerFn(getMyAdminRole);
  return useQuery({ queryKey: ["admin", "my-role"], queryFn: () => fetchRole() });
}
