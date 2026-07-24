import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatData, formatEUR } from "@/lib/demo-data";

export const Route = createFileRoute("/_authenticated/oportunidades")({
  head: () => ({
    meta: [
      { title: "Oportunidades — Assessor do Consultor" },
      { name: "description", content: "Compras, vendas, angariações, arrendamentos, investimentos e recomendações." },
      { property: "og:title", content: "Oportunidades — Assessor do Consultor" },
      { property: "og:description", content: "Pipeline do consultor." },
    ],
  }),
  component: OportunidadesPage,
});

function OportunidadesPage() {
  const { oportunidades, pessoas, imoveis } = useStore();
  return (
    <AppShell>
      <PageHeader title="Oportunidades" subtitle={`${oportunidades.length} em curso`} />
      <div className="grid gap-3 md:grid-cols-2">
        {oportunidades.map((o) => {
          const pessoa = pessoas.find((p) => p.id === o.pessoaId);
          const imovel = imoveis.find((i) => i.id === o.imovelId);
          return (
            <Card key={o.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">{o.tipo}</div>
                    <div className="truncate text-sm font-semibold">{pessoa?.nome ?? "—"}</div>
                    {imovel && <div className="text-xs text-muted-foreground">{imovel.titulo}</div>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold">{formatEUR(o.valor)}</div>
                    <Badge variant="outline" className="mt-1">{o.estado}</Badge>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Probabilidade: <strong className="text-foreground">{o.probabilidade}</strong></span>
                  {o.proximaAcao && (
                    <span>· Próx.: <strong className="text-foreground">{o.proximaAcao}</strong>{o.proximaAcaoData ? ` · ${formatData(o.proximaAcaoData)}` : ""}</span>
                  )}
                </div>
                {o.notas && <p className="mt-2 text-sm text-foreground/80">{o.notas}</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}