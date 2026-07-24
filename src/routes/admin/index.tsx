import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAdminOverview } from "@/lib/admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Admin — Visão geral" }] }),
  component: OverviewPage,
});

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-slate-500">{label}</CardTitle></CardHeader>
      <CardContent className="text-2xl font-semibold">{value}</CardContent>
    </Card>
  );
}

function OverviewPage() {
  const fn = useServerFn(getAdminOverview);
  const { data, isLoading } = useQuery({ queryKey: ["admin", "overview"], queryFn: () => fn() });
  if (isLoading || !data) return <p className="text-sm text-slate-500">A carregar…</p>;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Visão geral</h1>
        <p className="text-sm text-slate-500">Métricas agregadas. Nenhum dado privado do consultor é exposto.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Utilizadores totais" value={data.totalUsers} />
        <Stat label="Ativos (24h)" value={data.activeUsers} />
        <Stat label="Novos (30d)" value={data.newUsers30d} />
        <Stat label="Contas demo" value={data.demoAccounts} />
        <Stat label="Contas em teste" value={data.trialAccounts} />
        <Stat label="Mensagens processadas" value={data.messages} />
        <Stat label="Seguimentos criados" value={data.followUps} />
        <Stat label="Movimentos financeiros" value={data.financialMovements} />
        <Stat label="Erros recentes" value={data.recentErrors} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Estado das integrações</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
          {data.integrations.map((i) => (
            <div key={i.name} className="flex items-center justify-between rounded border border-slate-200 px-3 py-2 dark:border-slate-800">
              <span>{i.name}</span>
              <span className="text-xs text-slate-500 capitalize">{i.status}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}