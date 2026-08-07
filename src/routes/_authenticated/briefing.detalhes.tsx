import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ArrowRight } from "lucide-react";
import { getBriefingItemDetails } from "@/lib/assessor/supreme/briefing-details.functions";
import { formatDataHora, formatData } from "@/lib/demo-data";

export const Route = createFileRoute("/_authenticated/briefing/detalhes")({
  head: () => ({
    meta: [
      { title: "Detalhes do briefing — Afonso" },
      {
        name: "description",
        content: "Origem, estado atual e histórico dos compromissos que saíram do briefing.",
      },
      { property: "og:title", content: "Detalhes do briefing — Afonso" },
      {
        property: "og:description",
        content: "Origem, estado atual e histórico dos compromissos que saíram do briefing.",
      },
    ],
  }),
  component: BriefingDetalhes,
});

function BriefingDetalhes() {
  const q = useQuery({
    queryKey: ["briefing", "detalhes"],
    queryFn: () => getBriefingItemDetails(),
  });
  const itens = q.data ?? [];

  return (
    <AppShell>
      <PageHeader
        title="Detalhes do briefing"
        subtitle="O que estava nas tuas prioridades e já não se aplica: de onde veio, em que estado está e o que lhe aconteceu."
        action={
          <Link to="/hoje" className="c-btn-ghost inline-flex items-center gap-1.5">
            <ChevronLeft className="h-4 w-4" /> Voltar a Hoje
          </Link>
        }
      />

      {q.isLoading && <p className="c-muted text-sm">A carregar…</p>}
      {!q.isLoading && itens.length === 0 && (
        <p className="c-muted text-sm">
          Nada por aqui: não há compromissos arquivados ou cancelados vindos do briefing recente.
        </p>
      )}

      <div className="space-y-4">
        {itens.map((it) => (
          <Card key={it.id} id={it.id} className="c-card border-0 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="c-section-title flex flex-wrap items-center gap-2">
                <span className="min-w-0 truncate">{it.title}</span>
                <span className="c-badge text-xs">{it.state_label}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1 text-sm">
                <div>
                  <span className="c-muted">Origem: </span>
                  {it.origin_label}
                  {it.origin_detail ? <span className="c-muted"> — {it.origin_detail}</span> : null}
                </div>
                <div>
                  <span className="c-muted">No briefing aparecia como: </span>
                  {it.action}
                </div>
                <div className="c-muted text-xs">
                  {[
                    it.person_name,
                    it.deal_label ? `Negócio: ${it.deal_label}` : null,
                    it.due_at ? `Marcado para ${formatData(it.due_at)}${it.due_time ? ` às ${it.due_time}` : ""}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>

              <div>
                <p className="c-muted mb-1.5 text-xs font-medium">Histórico</p>
                <ol className="space-y-1.5">
                  {it.timeline.map((t, i) => (
                    <li key={`${it.id}:${i}`} className="flex gap-2 text-xs">
                      <span className="c-mono shrink-0 text-muted-foreground">{formatDataHora(t.at)}</span>
                      <span className="min-w-0">
                        {t.label}
                        {t.detail ? <span className="c-muted"> — {t.detail}</span> : null}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              <Link
                to="/seguimentos/$id"
                params={{ id: it.id }}
                className="c-btn-ghost inline-flex items-center gap-1.5"
              >
                Abrir ficha <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
