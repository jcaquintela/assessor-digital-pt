import { createFileRoute, Link } from "@tanstack/react-router";
import { isOpenFollowUpStatus } from "@/lib/assessor/outcome-status";
import { useMemo, useState, useEffect } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AssuntoCard } from "@/components/assunto-card";
import { assuntoDeSeguimento } from "@/lib/assessor/assunto";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatData, formatDataHora, type Seguimento } from "@/lib/demo-data";
import { Calendar, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";

type SeguimentosSearch = { status?: "overdue" | "hoje" | "semana" | "concluidos" };

export const Route = createFileRoute("/_authenticated/seguimentos/")({
  head: () => ({
    meta: [
      { title: "Seguimentos — Afonso" },
      { name: "description", content: "Tarefas e eventos do consultor." },
      { property: "og:title", content: "Seguimentos — Afonso" },
      { property: "og:description", content: "Tarefas e eventos do consultor." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): SeguimentosSearch => {
    const v = s.status;
    return {
      status: v === "overdue" || v === "hoje" || v === "semana" || v === "concluidos" ? v : undefined,
    };
  },
  component: SeguimentosPage,
});

function SeguimentosPage() {
  const { seguimentos, pessoas, concluirSeguimento, reagendarSeguimento } = useStore();
  const search = Route.useSearch();
  const now = new Date();
  const same = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const semanaFim = new Date(now); semanaFim.setDate(now.getDate() + 7);

  const grupos = useMemo(() => ({
    hoje: seguimentos.filter((s) => same(new Date(s.data), now) && isOpenFollowUpStatus(s.estado)),
    semana: seguimentos.filter((s) => new Date(s.data) >= now && new Date(s.data) <= semanaFim && isOpenFollowUpStatus(s.estado)),
    atrasados: seguimentos.filter((s) => isOpenFollowUpStatus(s.estado) && new Date(s.data) < now && !same(new Date(s.data), now)),
    concluidos: seguimentos.filter((s) => s.estado === "Concluído"),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [seguimentos]);

  const initialTab = search.status === "overdue" ? "atrasados" : search.status ?? "hoje";
  const [tab, setTab] = useState<string>(initialTab);
  useEffect(() => {
    if (!search.status) return;
    setTab(search.status === "overdue" ? "atrasados" : search.status);
  }, [search.status]);
  const nomePessoa = (id?: string) => pessoas.find((p) => p.id === id)?.nome ?? "";

  const reagendarAmanha = (id: string) => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    reagendarSeguimento(id, d.toISOString());
    toast.success("Reagendado para amanhã.");
  };

  const Lista = ({ items }: { items: Seguimento[] }) => (
    <div className="space-y-2">
      {items.length === 0 && <p className="text-sm text-muted-foreground">Nada aqui.</p>}
      {items.map((s) => {
        // Mesma fonte da ficha: título = assunto, ação sugerida dentro da frase.
        const vista = assuntoDeSeguimento(s);
        const assunto = vista.titulo;
        return (
        <Link
          key={s.id}
          to="/seguimentos/$id"
          params={{ id: s.id }}
          className="group block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={`Abrir seguimento ${assunto}`}
        >
          <Card className="transition-colors group-hover:border-primary/40 group-focus-visible:border-primary/60">
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                <AssuntoCard
                  tag={s.tipo === "Evento"
                    ? <><Calendar className="h-3.5 w-3.5 text-primary" /></>
                    : <><Clock className="h-3.5 w-3.5 text-muted-foreground" /></>}
                  titulo={assunto}
                  frase={vista.frase}
                  /* A hora guardada manda: evita divergir da ficha por causa do fuso. */
                  meta={`${s.hora ? `${formatData(s.data)}, ${s.hora}` : formatDataHora(s.data)} · ${nomePessoa(s.pessoaId) || "—"}`}
                  plano
                />
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge variant={s.prioridade === "Alta" ? "destructive" : "secondary"}>{s.prioridade}</Badge>
                </div>
              </div>
            {isOpenFollowUpStatus(s.estado) && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); concluirSeguimento(s.id); }}
                >
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Concluir
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); reagendarAmanha(s.id); }}
                >
                  Reagendar amanhã
                </Button>
              </div>
            )}
            </CardContent>
          </Card>
        </Link>
        );
      })}
    </div>
  );

  return (
    <AppShell>
      <PageHeader title="Seguimentos" subtitle="Tarefas com prazo e eventos com hora." />
      <Tabs value={tab} onValueChange={setTab}>
        <div className="-mx-4 overflow-x-auto overscroll-x-contain px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:px-0 md:overflow-visible">
          <TabsList className="w-max md:w-auto">
            <TabsTrigger value="hoje">Hoje ({grupos.hoje.length})</TabsTrigger>
            <TabsTrigger value="semana">Esta semana ({grupos.semana.length})</TabsTrigger>
            <TabsTrigger value="atrasados">Atrasados ({grupos.atrasados.length})</TabsTrigger>
            <TabsTrigger value="concluidos">Concluídos ({grupos.concluidos.length})</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="hoje" className="mt-4"><Lista items={grupos.hoje} /></TabsContent>
        <TabsContent value="semana" className="mt-4"><Lista items={grupos.semana} /></TabsContent>
        <TabsContent value="atrasados" className="mt-4"><Lista items={grupos.atrasados} /></TabsContent>
        <TabsContent value="concluidos" className="mt-4"><Lista items={grupos.concluidos} /></TabsContent>
      </Tabs>
    </AppShell>
  );
}