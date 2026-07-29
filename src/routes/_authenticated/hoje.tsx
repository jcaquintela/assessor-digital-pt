import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { formatData, formatDataHora, formatEUR } from "@/lib/demo-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Sparkles } from "lucide-react";
import { useAssessorName } from "@/lib/assessor/assessor-name";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { dismissPriority, getHojeSupreme } from "@/lib/assessor/supreme/priorities.functions";
import { saveFollowUpOutcome } from "@/lib/assessor/supreme/outcomes.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/hoje")({
  head: () => ({
    meta: [
      { title: "Hoje — Assessor do Consultor" },
      { name: "description", content: "Briefing diário, compromissos e prioridades do consultor." },
      { property: "og:title", content: "Hoje — Assessor do Consultor" },
      { property: "og:description", content: "Briefing diário, compromissos e prioridades do consultor." },
    ],
  }),
  component: HojePage,
});

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function HojePage() {
  const { seguimentos, oportunidades, pessoas, concluirSeguimento } = useStore();
  const { name: assessorName } = useAssessorName();
  const now = new Date();
  const supremeQ = useServerFn(getHojeSupreme);
  const dismissFn = useServerFn(dismissPriority);
  const outcomeFn = useServerFn(saveFollowUpOutcome);
  const qc = useQueryClient();
  const supreme = useQuery({ queryKey: ["supreme", "hoje"], queryFn: () => supremeQ() });
  void dismissFn; // reservado para dismiss inline (próxima iteração)
  const outcome = useMutation({
    mutationFn: (v: { id: string; outcome: string }) => outcomeFn({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["supreme", "hoje"] }); toast.success("Resultado registado."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const eventosHoje = seguimentos.filter(
    (s) => s.tipo === "Evento" && isSameDay(new Date(s.data), now) && s.estado !== "Concluído",
  );
  const tarefasHoje = seguimentos.filter(
    (s) => s.tipo === "Tarefa" && isSameDay(new Date(s.data), now) && s.estado !== "Concluído",
  );
  const atrasados = seguimentos.filter(
    (s) => s.estado !== "Concluído" && new Date(s.data) < now && !isSameDay(new Date(s.data), now),
  );
  const oportSemAcao = oportunidades.filter((o) => !o.proximaAcao && o.estado !== "Perdida" && o.estado !== "Escritura");
  const pipelineAtivo = oportunidades
    .filter((o) => o.estado !== "Perdida" && o.estado !== "Escritura")
    .reduce((sum, o) => sum + o.valor, 0);

  const nomePessoa = (id?: string) => pessoas.find((p) => p.id === id)?.nome ?? "";

  return (
    <AppShell>
      <PageHeader
        title={assessorName === "Assessor" ? "Bom dia, Consultor" : `Olá. Sou ${assessorName}.`}
        subtitle={new Intl.DateTimeFormat("pt-PT", { weekday: "long", day: "2-digit", month: "long" }).format(now)}
      />
      {supreme.data?.enabled && (
        <div className="mb-6 grid gap-4 md:grid-cols-2">
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" /> As minhas prioridades
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {supreme.data.priorities.length === 0 && (
                <p className="text-sm text-muted-foreground">Nada urgente agora. Bom trabalho.</p>
              )}
              {supreme.data.priorities.map((p: any) => (
                <div key={`${p.subject_type}:${p.subject_id}`} className="rounded-lg border border-border bg-background p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{p.action}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {p.reasons?.slice(0, 2).join(" · ") || "—"}
                        {p.entity_label ? ` · ${p.entity_label}` : ""}
                      </div>
                    </div>
                    <Badge variant="outline" className="shrink-0">{Math.round(p.priority_score)}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4 text-muted-foreground" /> Aguardam resultado
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {supreme.data.awaitingOutcome.length === 0 && (
                <p className="text-sm text-muted-foreground">Sem ações à espera de desfecho.</p>
              )}
              {supreme.data.awaitingOutcome.map((a: any) => (
                <div key={a.id} className="rounded-lg border border-border p-3">
                  <div className="text-sm font-medium">{a.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatData(a.due_at)}{a.entity_label ? ` · ${a.entity_label}` : ""}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => outcome.mutate({ id: a.id, outcome: "concluido" })}>Concluído</Button>
                    <Button size="sm" variant="ghost" onClick={() => outcome.mutate({ id: a.id, outcome: "adiado" })}>Adiado</Button>
                    <Button size="sm" variant="ghost" onClick={() => outcome.mutate({ id: a.id, outcome: "sem_resposta" })}>Sem resposta</Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
      {assessorName === "Assessor" && (
        <Card className="mb-4 border-dashed">
          <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
            <span>Como queres chamar o teu Assessor?</span>
            <Button asChild size="sm" variant="outline"><Link to="/definicoes">Escolher nome</Link></Button>
          </CardContent>
        </Card>
      )}

      <Card className="mb-6 border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="h-4 w-4" />
            <CardTitle className="text-base">Briefing de hoje</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-foreground/80 leading-relaxed">
          Tem <strong>{eventosHoje.length}</strong> compromisso(s) e <strong>{tarefasHoje.length}</strong> tarefa(s) para hoje.
          Há <strong>{atrasados.length}</strong> seguimento(s) em atraso e <strong>{oportSemAcao.length}</strong> oportunidade(s) sem próxima ação definida.
          Prioridade: confirmar visita das 10:30 com a Ana Silva.
        </CardContent>
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Indicador label="Pipeline ativo" value={formatEUR(pipelineAtivo)} />
        <Indicador label="Oportunidades" value={String(oportunidades.length)} />
        <Indicador label="Atrasados" value={String(atrasados.length)} tone={atrasados.length ? "warn" : undefined} />
        <Indicador label="Compromissos hoje" value={String(eventosHoje.length)} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4 text-muted-foreground" /> Compromissos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {eventosHoje.length === 0 && <p className="text-sm text-muted-foreground">Sem compromissos hoje.</p>}
            {eventosHoje.map((e) => (
              <div key={e.id} className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{e.titulo}</div>
                  <div className="text-xs text-muted-foreground">{formatDataHora(e.data)} · {nomePessoa(e.pessoaId)}</div>
                </div>
                <Badge variant="secondary" className="shrink-0">{e.hora}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-muted-foreground" /> Seguimentos de hoje
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {tarefasHoje.length === 0 && <p className="text-sm text-muted-foreground">Sem tarefas para hoje.</p>}
            {tarefasHoje.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{s.titulo}</div>
                  <div className="text-xs text-muted-foreground">{nomePessoa(s.pessoaId) || "—"}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => concluirSeguimento(s.id)}>
                  <CheckCircle2 className="mr-1 h-4 w-4" /> Concluir
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Atrasados
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {atrasados.length === 0 && <p className="text-sm text-muted-foreground">Sem atrasos. Bom trabalho.</p>}
            {atrasados.map((s) => (
              <div key={s.id} className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{s.titulo}</div>
                  <div className="text-xs text-muted-foreground">Previsto {formatData(s.data)} · {nomePessoa(s.pessoaId) || "—"}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => concluirSeguimento(s.id)}>Concluir</Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Oportunidades sem próxima ação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {oportSemAcao.length === 0 && <p className="text-sm text-muted-foreground">Todas as oportunidades têm próxima ação.</p>}
            {oportSemAcao.map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{nomePessoa(o.pessoaId)} · {o.tipo}</div>
                  <div className="text-xs text-muted-foreground">{o.estado} · {formatEUR(o.valor)}</div>
                </div>
                <Badge variant="outline">Definir ação</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function Indicador({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${tone === "warn" ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}