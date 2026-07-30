import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { formatData, formatDataHora, formatEUR } from "@/lib/demo-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, CalendarClock, CheckCircle2, Clock, MessageSquare, Sparkles,
  FileText, Briefcase, ChevronRight, MoreHorizontal, StickyNote,
} from "lucide-react";
import { useAssessorName } from "@/lib/assessor/assessor-name";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { dismissPriority, getHojeSupreme } from "@/lib/assessor/supreme/priorities.functions";
import { saveFollowUpOutcome } from "@/lib/assessor/supreme/outcomes.functions";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EventDrawer, type EventDrawerItem } from "@/components/hoje/event-drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

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

function greeting(now: Date) {
  const h = now.getHours();
  if (h < 12) return "Bom dia";
  if (h < 20) return "Boa tarde";
  return "Boa noite";
}

type Priority = {
  subject_type: "follow_up" | "opportunity" | "property";
  subject_id: string;
  action: string;
  reasons: string[];
  priority_score: number;
  due_at: string | null;
  entity_label: string | null;
};

type Awaiting = { id: string; title: string; due_at: string; entity_label: string | null };

function HojePage() {
  const { seguimentos, oportunidades, pessoas, imoveis, concluirSeguimento, reagendarSeguimento } = useStore();
  void oportunidades; void imoveis;
  const { name: assessorName } = useAssessorName();
  const now = new Date();
  const supremeQ = useServerFn(getHojeSupreme);
  const dismissFn = useServerFn(dismissPriority);
  const outcomeFn = useServerFn(saveFollowUpOutcome);
  const qc = useQueryClient();

  const supreme = useQuery({
    queryKey: ["supreme", "hoje"],
    queryFn: () => supremeQ(),
    retry: false,
  });

  const docsPending = useQuery({
    queryKey: ["uploaded_files", "unclassified"],
    queryFn: async () => {
      const { count } = await supabase
        .from("uploaded_files")
        .select("id", { count: "exact", head: true })
        .is("classification", null);
      return count ?? 0;
    },
  });

  // Primeiro nome do consultor para a saudação pessoal.
  const profileQ = useQuery({
    queryKey: ["profile", "first-name"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("name").maybeSingle();
      return (data?.name as string | null) ?? null;
    },
  });
  const firstName = (profileQ.data ?? "").trim().split(/\s+/)[0] || "";

  const outcome = useMutation({
    mutationFn: (v: { id: string; outcome: string; notes?: string }) => outcomeFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supreme", "hoje"] });
      qc.invalidateQueries({ queryKey: ["follow_ups"] });
      toast.success("Resultado registado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dismiss = useMutation({
    mutationFn: (v: { id: string }) => dismissFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["supreme", "hoje"] }),
  });

  const [drawer, setDrawer] = useState<EventDrawerItem | null>(null);
  const [noteFor, setNoteFor] = useState<Awaiting | null>(null);
  const [noteText, setNoteText] = useState("");

  const nomePessoa = (id?: string) => pessoas.find((p) => p.id === id)?.nome ?? "";
  const tituloImovel = (id?: string) => imoveis.find((i) => i.id === id)?.titulo ?? "";

  const eventosHoje = useMemo(
    () => seguimentos
      .filter((s) => s.tipo === "Evento" && isSameDay(new Date(s.data), now) && s.estado !== "Concluído")
      .sort((a, b) => (a.hora ?? "").localeCompare(b.hora ?? "")),
    [seguimentos, now],
  );
  const atrasados = useMemo(
    () => seguimentos.filter((s) => s.estado !== "Concluído" && new Date(s.data) < now && !isSameDay(new Date(s.data), now)),
    [seguimentos, now],
  );
  const oportSemAcao = useMemo(
    () => oportunidades.filter((o) => !o.proximaAcao && o.estado !== "Perdida" && o.estado !== "Escritura"),
    [oportunidades],
  );

  // Fallback local para prioridades quando o motor Supremo está desligado ou vazio.
  const localPriorities: Priority[] = useMemo(() => {
    const items: Priority[] = [];
    for (const s of atrasados.slice(0, 3)) {
      items.push({
        subject_type: "follow_up",
        subject_id: s.id,
        action: s.titulo,
        reasons: ["em atraso"],
        priority_score: 80,
        due_at: s.data,
        entity_label: nomePessoa(s.pessoaId) || null,
      });
    }
    for (const e of eventosHoje.slice(0, 2)) {
      items.push({
        subject_type: "follow_up",
        subject_id: e.id,
        action: `Preparar: ${e.titulo}`,
        reasons: ["compromisso de hoje"],
        priority_score: 70,
        due_at: e.data,
        entity_label: nomePessoa(e.pessoaId) || null,
      });
    }
    for (const o of oportSemAcao.slice(0, 2)) {
      const nome = nomePessoa(o.pessoaId);
      items.push({
        subject_type: "opportunity",
        subject_id: o.id,
        action: `Definir próxima ação${nome ? ` com ${nome}` : ""}`,
        reasons: ["sem próxima ação"],
        priority_score: 55,
        due_at: null,
        entity_label: nome || null,
      });
    }
    return items.slice(0, 5);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atrasados, eventosHoje, oportSemAcao, pessoas]);

  const priorities: Priority[] = supreme.data?.priorities?.length
    ? (supreme.data.priorities as Priority[])
    : localPriorities;

  const localAwaiting: Awaiting[] = useMemo(
    () => atrasados
      .filter((s) => s.tipo === "Evento")
      .slice(0, 5)
      .map((s) => ({ id: s.id, title: s.titulo, due_at: s.data, entity_label: nomePessoa(s.pessoaId) || null })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [atrasados, pessoas],
  );
  const awaiting: Awaiting[] = supreme.data?.awaitingOutcome?.length
    ? (supreme.data.awaitingOutcome as Awaiting[])
    : localAwaiting;

  const openEvent = (id: string) => {
    const s = seguimentos.find((x) => x.id === id);
    if (!s) return;
    setDrawer({
      id: s.id,
      titulo: s.titulo,
      data: s.data,
      hora: s.hora,
      pessoaId: s.pessoaId ?? null,
      pessoaNome: nomePessoa(s.pessoaId),
      imovelId: null,
      imovelTitulo: null,
      notas: s.notas ?? null,
      estado: s.estado,
    });
  };

  const openPriority = (p: Priority) => {
    if (p.subject_type === "follow_up") openEvent(p.subject_id);
    // oportunidade e imóvel são navegações diretas via Link nas ações
  };

  const savePriorityDone = (p: Priority) => {
    if (p.subject_type === "follow_up") {
      outcome.mutate({ id: p.subject_id, outcome: "concluido" });
      concluirSeguimento(p.subject_id).catch(() => {/* já tratado via outcome */});
    } else {
      dismiss.mutate({ id: p.subject_id });
    }
  };

  const snoozePriority = (p: Priority, when: "1h" | "amanha" | "semana") => {
    if (p.subject_type !== "follow_up") { dismiss.mutate({ id: p.subject_id }); return; }
    const base = p.due_at ? new Date(p.due_at) : new Date();
    const target = new Date(base);
    if (when === "1h") target.setHours(target.getHours() + 1);
    else if (when === "amanha") { target.setDate(target.getDate() + 1); }
    else target.setDate(target.getDate() + 7);
    reagendarSeguimento(p.subject_id, target.toISOString())
      .then(() => { toast.success("Adiado."); qc.invalidateQueries({ queryKey: ["supreme", "hoje"] }); })
      .catch((e) => toast.error(e.message));
  };

  const compromissosCount = eventosHoje.length;
  const prioridadesCount = priorities.length;

  return (
    <AppShell>
      {/* A. Cabeçalho */}
      <header className="mb-6 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <h1 className="c-serif text-[26px] font-medium md:text-[34px]">
              {greeting(now)}{firstName ? `, ${firstName}` : ""}.
            </h1>
            <p className="c-soft mt-1 text-sm">
              Hoje tens <strong style={{ color: "var(--ink)" }}>{prioridadesCount}</strong> prioridade{prioridadesCount === 1 ? "" : "s"} e{" "}
              <strong style={{ color: "var(--ink)" }}>{compromissosCount}</strong> compromisso{compromissosCount === 1 ? "" : "s"}.
              {" "}
              <span className="c-mono c-muted text-xs">
                {new Intl.DateTimeFormat("pt-PT", { weekday: "long", day: "2-digit", month: "long" }).format(now)}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/assessor" className="c-cta">
              <MessageSquare className="h-4 w-4" /> Falar com {assessorName === "Assessor" ? "o Assessor" : assessorName}
            </Link>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Coluna principal */}
        <div className="space-y-6">
          {/* B. As minhas prioridades */}
          <Card className="border-primary/30">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" /> As minhas prioridades
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {priorities.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma prioridade urgente. Bom trabalho.</p>
              )}
              {priorities.map((p) => (
                <div key={`${p.subject_type}:${p.subject_id}`} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{p.action}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {[
                          p.reasons?.slice(0, 2).join(" · "),
                          p.entity_label,
                          p.due_at ? formatData(p.due_at) : null,
                        ].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    <Badge variant="outline" className="shrink-0">{Math.round(p.priority_score)}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => savePriorityDone(p)}>
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Concluir
                    </Button>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button size="sm" variant="ghost">Adiar</Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-40 p-1">
                        <button className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted" onClick={() => snoozePriority(p, "1h")}>+1 hora</button>
                        <button className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted" onClick={() => snoozePriority(p, "amanha")}>Amanhã</button>
                        <button className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted" onClick={() => snoozePriority(p, "semana")}>Próxima semana</button>
                      </PopoverContent>
                    </Popover>
                    {p.subject_type === "opportunity" ? (
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/oportunidades/$id" params={{ id: p.subject_id }}>Abrir</Link>
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => openPriority(p)}>Abrir</Button>
                    )}
                    <Button asChild size="sm" variant="ghost" className="ml-auto">
                      <Link to="/assessor"><MessageSquare className="mr-1 h-3.5 w-3.5" /> Falar</Link>
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* C. Próximos compromissos */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="h-4 w-4 text-muted-foreground" /> Próximos compromissos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {eventosHoje.length === 0 && (
                <p className="text-sm text-muted-foreground">Não tens compromissos para hoje.</p>
              )}
              {eventosHoje.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => openEvent(e.id)}
                  className="flex w-full items-start gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted"
                >
                  <div className="shrink-0 rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                    {e.hora ?? "—"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{e.titulo}</div>
                    <div className="text-xs text-muted-foreground">
                      {[nomePessoa(e.pessoaId), tituloImovel((e as any).imovelId)].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Coluna lateral */}
        <div className="space-y-6">
          {/* D. Aguardam resultado */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4 text-muted-foreground" /> Aguardam resultado
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {awaiting.length === 0 && (
                <p className="text-sm text-muted-foreground">Não há nada a aguardar resultado.</p>
              )}
              {awaiting.map((a) => (
                <Link
                  key={a.id}
                  to="/seguimentos/$id"
                  params={{ id: a.id }}
                  className="group block rounded-lg border border-border p-3 outline-none transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={`Abrir ${a.title}`}
                >
                  <div className="text-sm font-medium">{a.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDataHora(a.due_at)}{a.entity_label ? ` · ${a.entity_label}` : ""}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" onClick={(e) => { e.preventDefault(); e.stopPropagation(); outcome.mutate({ id: a.id, outcome: "concluido" }); }}>Correu bem</Button>
                    <Button size="sm" variant="ghost" onClick={(e) => { e.preventDefault(); e.stopPropagation(); outcome.mutate({ id: a.id, outcome: "precisa_nova_acao" }); }}>Precisa seguimento</Button>
                    <Button size="sm" variant="ghost" onClick={(e) => { e.preventDefault(); e.stopPropagation(); outcome.mutate({ id: a.id, outcome: "nao_realizado" }); }}>Sem efeito</Button>
                    <Button size="sm" variant="ghost" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setNoteFor(a); setNoteText(""); }}>
                      <StickyNote className="mr-1 h-3.5 w-3.5" /> Nota
                    </Button>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>

          {/* E. Atenção */}
          {(atrasados.length > 0 || oportSemAcao.length > 0 || (docsPending.data ?? 0) > 0) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-destructive" /> Atenção
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {atrasados.length > 0 && (
                  <AlertRow to="/seguimentos" search={{ status: "overdue" }} icon={AlertTriangle} label={`${atrasados.length} seguimento${atrasados.length === 1 ? "" : "s"} em atraso`} />
                )}
                {oportSemAcao.length > 0 && (
                  <AlertRow to="/oportunidades" icon={Briefcase} label={`${oportSemAcao.length} oportunidade${oportSemAcao.length === 1 ? "" : "s"} sem próxima ação · ${formatEUR(oportSemAcao.reduce((s, o) => s + o.valor, 0))}`} />
                )}
                {(docsPending.data ?? 0) > 0 && (
                  <AlertRow to="/documentos" icon={FileText} label={`${docsPending.data} documento${docsPending.data === 1 ? "" : "s"} por classificar`} />
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* FAB mobile */}
      <Link
        to="/assessor"
        className="fixed bottom-20 right-4 z-10 flex h-12 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow-lg md:hidden"
      >
        <MessageSquare className="h-4 w-4" /> Falar com {assessorName === "Assessor" ? "o Assessor" : assessorName}
      </Link>

      <EventDrawer item={drawer} onClose={() => setDrawer(null)} />

      <Dialog open={!!noteFor} onOpenChange={(o) => { if (!o) setNoteFor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registar nota</DialogTitle>
          </DialogHeader>
          <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="O que aconteceu?" rows={4} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNoteFor(null)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (!noteFor) return;
                outcome.mutate({ id: noteFor.id, outcome: "precisa_nova_acao", notes: noteText || undefined });
                setNoteFor(null);
              }}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function AlertRow({
  to, search, icon: Icon, label,
}: {
  to: string;
  search?: Record<string, string>;
  icon: any;
  label: string;
}) {
  return (
    <Link
      to={to as any}
      search={search as any}
      className="flex items-center gap-2 rounded-md px-2 py-2 text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary"
      aria-label={label}
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="flex-1">{label}</span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}

// Ícone reservado para futuras variantes; suprime aviso de import não usado.
void MoreHorizontal;