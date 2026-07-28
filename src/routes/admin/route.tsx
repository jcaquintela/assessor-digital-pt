import { createFileRoute, Outlet, Link, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAdminRole } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AdminLayout,
});

const nav: { to: string; label: string; exact?: boolean }[] = [
  { to: "/admin", label: "Visão geral", exact: true },
  { to: "/admin/utilizadores", label: "Utilizadores" },
  { to: "/admin/subscricoes", label: "Subscrições" },
  { to: "/admin/utilizacao", label: "Utilização" },
  { to: "/admin/suporte", label: "Suporte" },
  { to: "/admin/integracoes", label: "Integrações" },
  { to: "/admin/funcionalidades", label: "Funcionalidades" },
  { to: "/admin/qualidade", label: "Qualidade" },
  { to: "/admin/auditoria", label: "Auditoria" },
  { to: "/admin/seguranca", label: "Segurança" },
  { to: "/admin/definicoes", label: "Definições" },
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
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-slate-200 bg-white px-4 py-6 md:flex dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-8 flex items-center gap-2 px-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold">Administração</div>
            <div className="text-xs text-slate-500 capitalize">{data.role.replace("_", " ")}</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5">
          {nav.map((n) => {
            const active = n.exact ? pathname === n.to : pathname.startsWith(n.to);
            return (
            <Link
                key={n.to}
                to={n.to as any}
                className={`block rounded-md px-3 py-2 text-sm ${active ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-6 space-y-2">
          <Link to="/" className="block text-xs text-slate-500 hover:underline">← Voltar à app</Link>
          <Button variant="outline" size="sm" className="w-full justify-start" onClick={signOut}>
            <LogOut className="mr-2 h-3 w-3" /> Terminar sessão
          </Button>
        </div>
      </aside>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          <span className="text-sm font-semibold">Admin</span>
        </div>
        <Link to="/" className="text-xs text-slate-500">Sair</Link>
      </header>
      <main className="md:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">
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
