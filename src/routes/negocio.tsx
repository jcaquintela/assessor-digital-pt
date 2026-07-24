import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatData, formatEUR } from "@/lib/demo-data";

export const Route = createFileRoute("/negocio")({
  head: () => ({
    meta: [
      { title: "O Meu Negócio — Assessor do Consultor" },
      { name: "description", content: "Visão geral de comissões, faturação, despesas e rentabilidade." },
      { property: "og:title", content: "O Meu Negócio — Assessor do Consultor" },
      { property: "og:description", content: "Visão geral do negócio do consultor." },
    ],
  }),
  component: NegocioPage,
});

function NegocioPage() {
  const { comissoes, despesas } = useStore();
  const faturado = comissoes.filter((c) => c.estado !== "Prevista").reduce((s, c) => s + c.valor, 0);
  const recebido = comissoes.filter((c) => c.estado === "Recebida").reduce((s, c) => s + c.valor, 0);
  const previstas = comissoes.filter((c) => c.estado === "Prevista").reduce((s, c) => s + c.valor, 0);
  const porReceber = faturado - recebido + previstas;
  const totalDespesas = despesas.reduce((s, d) => s + d.valor, 0);
  const resultado = recebido - totalDespesas;

  return (
    <AppShell>
      <PageHeader title="O Meu Negócio" subtitle="Visão simples. Não substitui contabilidade certificada." />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Indicador label="Faturado" value={formatEUR(faturado)} />
        <Indicador label="Recebido" value={formatEUR(recebido)} />
        <Indicador label="Por receber" value={formatEUR(porReceber)} />
        <Indicador label="Despesas" value={formatEUR(totalDespesas)} />
      </div>
      <Card className="mb-6 border-primary/20 bg-primary/5">
        <CardContent className="p-5">
          <div className="text-sm text-muted-foreground">Resultado antes de impostos</div>
          <div className="mt-1 text-2xl font-semibold">{formatEUR(resultado)}</div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Comissões</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {comissoes.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                <div>
                  <div className="font-medium">{formatEUR(c.valor)}</div>
                  <div className="text-xs text-muted-foreground">{formatData(c.data)} · {c.estado}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Despesas</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {despesas.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{d.descricao}</div>
                  <div className="text-xs text-muted-foreground">{d.categoria} · {formatData(d.data)}</div>
                </div>
                <div className="shrink-0 font-medium">{formatEUR(d.valor)}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function Indicador({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}