import { useState } from "react";
import { createFileRoute, Outlet, Link, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAdminRole } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, ShieldCheck, ChevronDown } from "lucide-react";
import { HealthStrip } from "@/components/admin/health-strip";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AdminLayout,
});

type NavItem = { to: string; label: string; exact?: boolean };

const navGroups: { group: string; items: NavItem[] }[] = [
  {
    group: "Visão geral",
    items: [
      { to: "/admin", label: "Visão geral", exact: true },
      { to: "/admin/negocio", label: "Negócio" },
    ],
  },
  {
    group: "Clientes",
    items: [
      { to: "/admin/utilizadores", label: "Utilizadores & planos" },
      { to: "/admin/beta", label: "Beta testers" },
      { to: "/admin/suporte", label: "Suporte" },
      { to: "/admin/convites", label: "Convites Telegram" },
    ],
  },
  {
    group: "Comercial",
    items: [
      { to: "/admin/planos", label: "Planos & preços" },
      { to: "/admin/aquisicao", label: "Aquisição" },
      { to: "/admin/subscricoes", label: "Subscrições" },
      { to: "/admin/faturacao", label: "Faturação" },
    ],
  },
  {
    group: "Operação",
    items: [
      { to: "/admin/custos", label: "Custos" },
      { to: "/admin/utilizacao", label: "Utilização" },
      { to: "/admin/comunicacao", label: "Comunicação" },
    ],
  },
  {
    group: "Qualidade",
    items: [
      { to: "/admin/qualidade", label: "Qualidade" },
      { to: "/admin/autonomas", label: "Ações autónomas" },
      { to: "/admin/goldens", label: "Goldens" },
    ],
  },
  {
    group: "Plataforma",
    items: [
      { to: "/admin/integracoes-flags", label: "Integrações & flags" },
      { to: "/admin/auditoria-seguranca", label: "Auditoria & segurança" },
    ],
  },
];

function AdminLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const fetchRole = useServerFn(getMyAdminRole);
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "my-role"],
    queryFn: () => fetchRole(),
  });

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

  return (
    <div className="admin-root min-h-screen">
      <aside className="admin-nav fixed inset-y-0 left-0 z-20 hidden w-56 flex-col py-6 md:flex">
        <div className="brand flex items-center gap-2 px-[22px] pb-6">
          <span className="dot" />
          Afonso — admin
        </div>
        <nav className="flex-1 overflow-y-auto">
          {navGroups.map((g) => {
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
                      <Link key={n.to} to={n.to as any} className={`navitem ${active ? "active" : ""}`}>
                        {n.label}
                      </Link>
                    );
                  })}
              </div>
            );
          })}
        </nav>
        <div className="navfoot">
          <div className="capitalize">{data.role.replace("_", " ")}</div>
          <Link to="/" className="mt-2 block hover:underline">← Voltar à app</Link>
          <button type="button" onClick={signOut} className="mt-2 flex items-center gap-1 hover:underline">
            <LogOut className="h-3 w-3" /> Terminar sessão
          </button>
        </div>
      </aside>
      <header className="admin-nav sticky top-0 z-10 flex items-center justify-between px-4 py-3 md:hidden">
        <div className="flex items-center gap-2 text-white">
          <ShieldCheck className="h-4 w-4" />
          <span className="text-sm font-semibold">Afonso — admin</span>
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
