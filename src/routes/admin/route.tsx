import { createFileRoute, Outlet, Link, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAdminRole } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, ShieldCheck } from "lucide-react";
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
    group: "Negócio do Afonso",
    items: [
      { to: "/admin", label: "Visão geral", exact: true },
      { to: "/admin/negocio", label: "Negócio" },
      { to: "/admin/planos", label: "Planos & preços" },
      { to: "/admin/faturacao", label: "Faturação" },
      { to: "/admin/custos", label: "Custos" },
      { to: "/admin/aquisicao", label: "Aquisição" },
    ],
  },
  {
    group: "Pessoas e acesso",
    items: [
      { to: "/admin/utilizadores", label: "Utilizadores & planos" },
      { to: "/admin/beta", label: "Beta testers" },
      { to: "/admin/comunicacao", label: "Comunicação" },
      { to: "/admin/suporte", label: "Suporte" },
    ],
  },
  {
    group: "Sistema",
    items: [
      { to: "/admin/qualidade", label: "Qualidade" },
      { to: "/admin/autonomas", label: "Ações autónomas" },
      { to: "/admin/integracoes-flags", label: "Integrações & flags" },
      { to: "/admin/auditoria-seguranca", label: "Auditoria & segurança" },
    ],
  },
  {
    group: "Outras páginas",
    items: [
      { to: "/admin/subscricoes", label: "Subscrições" },
      { to: "/admin/utilizacao", label: "Utilização" },
      { to: "/admin/convites", label: "Convites Telegram" },
      { to: "/admin/goldens", label: "Goldens" },
      { to: "/admin/definicoes", label: "Definições" },
    ],
  },
];

function AdminLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
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
          {navGroups.map((g) => (
            <div key={g.group}>
              <div className="navgroup">{g.group}</div>
              {g.items.map((n) => {
                const active = n.exact ? pathname === n.to : pathname.startsWith(n.to);
                return (
                  <Link key={n.to} to={n.to as any} className={`navitem ${active ? "active" : ""}`}>
                    {n.label}
                  </Link>
                );
              })}
            </div>
          ))}
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
