import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatEUR } from "@/lib/demo-data";
import { listProperties } from "@/lib/assessor/properties.functions";
import { propertyStatusLabel } from "@/lib/assessor/properties-status";
import { ChevronRight, FileText } from "lucide-react";
import { TierGate } from "@/components/tier-gate";

export const Route = createFileRoute("/_authenticated/imoveis")({
  head: () => ({
    meta: [
      { title: "Imóveis — Assessor do Consultor" },
      { name: "description", content: "Carteira de imóveis em angariação." },
      { property: "og:title", content: "Imóveis — Assessor do Consultor" },
      { property: "og:description", content: "Carteira de imóveis em angariação." },
    ],
  }),
  component: () => (
    <TierGate min="consultor" title="Imóveis">
      <ImoveisPage />
    </TierGate>
  ),
});

function ImoveisPage() {
  const fetchList = useServerFn(listProperties);
  const { data: rows } = useQuery({
    queryKey: ["properties", "list"],
    queryFn: () => fetchList(),
  });
  const list = rows ?? [];
  return (
    <AppShell>
      <PageHeader title="Imóveis" subtitle={`${list.length} em carteira`} />
      <div className="grid gap-3 md:grid-cols-2">
        {list.length === 0 && (
          <div className="text-sm text-muted-foreground">
            Ainda não tens imóveis. Envia um documento ou descreve o imóvel ao Assessor.
          </div>
        )}
        {list.map((i: any) => {
          const localizacao = i.city || i.location || "";
          const tipo = i.typology || i.property_type || "";
          return (
            <Link key={i.id} to="/imoveis/$id" params={{ id: i.id }}>
              <Card className="hover:bg-muted/30 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{i.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {[tipo, localizacao].filter(Boolean).join(" · ") || "Sem detalhes"}
                      </div>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-2">
                      <div>
                        {i.asking_price != null && (
                          <div className="text-sm font-semibold">{formatEUR(Number(i.asking_price))}</div>
                        )}
                        <Badge variant="outline" className="mt-1">{propertyStatusLabel(i.status)}</Badge>
                        {i.file_count > 0 && (
                          <div className="mt-1 flex items-center justify-end gap-1 text-xs text-muted-foreground">
                            <FileText className="h-3 w-3" /> {i.file_count}
                          </div>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </AppShell>
  );
}