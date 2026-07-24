import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatEUR } from "@/lib/demo-data";

export const Route = createFileRoute("/_authenticated/imoveis")({
  head: () => ({
    meta: [
      { title: "Imóveis — Assessor do Consultor" },
      { name: "description", content: "Carteira de imóveis em angariação." },
      { property: "og:title", content: "Imóveis — Assessor do Consultor" },
      { property: "og:description", content: "Carteira de imóveis em angariação." },
    ],
  }),
  component: ImoveisPage,
});

function ImoveisPage() {
  const { imoveis, pessoas, documentos } = useStore();
  return (
    <AppShell>
      <PageHeader title="Imóveis" subtitle={`${imoveis.length} em carteira`} />
      <div className="grid gap-3 md:grid-cols-2">
        {imoveis.map((i) => {
          const dono = pessoas.find((p) => p.id === i.proprietarioId);
          const docs = documentos.filter((d) => d.imovelId === i.id);
          return (
            <Card key={i.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{i.titulo}</div>
                    <div className="text-xs text-muted-foreground">{i.tipo} · {i.localizacao}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold">{formatEUR(i.valor)}</div>
                    <Badge variant="outline" className="mt-1">{i.estado}</Badge>
                  </div>
                </div>
                {dono && <div className="mt-3 text-xs text-muted-foreground">Proprietário: <span className="text-foreground">{dono.nome}</span></div>}
                {i.notas && <p className="mt-2 text-sm text-foreground/80">{i.notas}</p>}
                {docs.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {docs.map((d) => <Badge key={d.id} variant="secondary">{d.nome}</Badge>)}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}