import { appTitle } from "@/lib/brand";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { MonthGrid, dayKey, monthLabel } from "@/components/calendario/month-grid";
import { EventCard, type AgendaCardEvent } from "@/components/calendario/event-card";
import { EmptyDay } from "@/components/calendario/empty-day";
import { ForceSyncButton } from "@/components/calendario/force-sync-button";
import { EmptyWeek } from "@/components/calendario/empty-week";
import { TimeGrid } from "@/components/calendario/time-grid";
import { useIsMobile } from "@/hooks/use-mobile";
import { groupByDay } from "@/lib/agenda/views";
import {
  addDaysKey,
  countsByDay,
  hasMoreAfter,
  listGroups,
  startOfWeekKey,
  weekGroups,
  type AgendaEvent,
  type AgendaViewMode,
} from "@/lib/agenda/views";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/calendario")({
  head: () => ({
    meta: [
      { title: appTitle("Calendário") },
      { name: "description", content: "Calendário interno do consultor." },
      { property: "og:title", content: appTitle("Calendário") },
      { property: "og:description", content: "Calendário interno do consultor." },
    ],
  }),
  component: CalendarioPage,
});

const VIEWS: { id: AgendaViewMode; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mês" },
  { id: "lista", label: "Lista" },
];

function longDayLabel(key: string): string {
  return new Date(`${key}T12:00:00`).toLocaleDateString("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function shortDayLabel(key: string): string {
  return new Date(`${key}T12:00:00`).toLocaleDateString("pt-PT", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function CalendarioPage() {
  const { seguimentos, atualizarSeguimento, arquivarSeguimento, addSeguimento } = useStore();
  const [editing, setEditing] = useState<null | {
    id: string | null;
    titulo: string;
    data: string;
    hora: string;
    notas: string;
  }>(null);
  const [saving, setSaving] = useState(false);
  const hoje = new Date();
  const todayKey = dayKey(hoje);
  const [view, setView] = useState<AgendaViewMode>("lista");
  const [month, setMonth] = useState(() => new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const [selectedKey, setSelectedKey] = useState(() => dayKey(new Date()));
  const [listDays, setListDays] = useState(30);
  const isMobile = useIsMobile();

  // Compromissos = registos classificados como Evento (ver src/lib/agenda-kind.ts),
  // excluindo os já concluídos/cancelados.
  const eventos = useMemo(
    () =>
      seguimentos
        .filter((s) => s.tipo === "Evento")
        .filter((s) => {
          const e = (s.estado ?? "").toLowerCase();
          return e !== "concluído" && e !== "concluido" && e !== "cancelado";
        })
        .sort((a, b) => a.data.localeCompare(b.data)),
    [seguimentos],
  );

  // Eventos agrupados por dia local, para o ponto indicador e a lista do dia.
  // Fonte única: converte os seguimentos-evento para o formato do seletor
  // central e deixa que views.ts faça todo o agrupamento por período.
  const fonte = useMemo<AgendaEvent[]>(
    () =>
      eventos.map((e) => ({
        id: e.id,
        title: e.titulo,
        date: dayKey(e.data),
        time: e.hora ? e.hora.slice(0, 5) : null,
        eventClass: e.classeEvento ?? null,
      })),
    [eventos],
  );
  const porId = useMemo(() => new Map(eventos.map((e) => [e.id, e])), [eventos]);

  const contagens = useMemo(() => countsByDay(fonte), [fonte]);
  const porDia = useMemo(() => groupByDay(fonte), [fonte]);
  const semanaInicio = useMemo(() => startOfWeekKey(selectedKey), [selectedKey]);
  const semana = useMemo(() => weekGroups(fonte, semanaInicio), [fonte, semanaInicio]);
  const lista = useMemo(() => listGroups(fonte, todayKey, listDays), [fonte, todayKey, listDays]);
  const haMais = hasMoreAfter(fonte, todayKey, listDays);

  const cartao = (id: string): AgendaCardEvent | null => {
    const e = porId.get(id);
    return e
      ? { id: e.id, titulo: e.titulo, data: e.data, hora: e.hora, classeEvento: e.classeEvento }
      : null;
  };

  const diaKey = view === "hoje" ? todayKey : selectedKey;
  const doDia = (contagens.get(diaKey) ? fonte.filter((e) => e.date === diaKey) : []).sort((a, b) =>
    (a.time ?? "99:99").localeCompare(b.time ?? "99:99"),
  );

  const mudarMes = (delta: number) => {
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
    setSelectedKey((k) => {
      const d = new Date(`${k}T12:00:00`);
      return dayKey(new Date(d.getFullYear(), d.getMonth() + delta, d.getDate()));
    });
  };

  const mudarSemana = (delta: number) => setSelectedKey((k) => addDaysKey(k, delta * 7));

  const remover = async (id: string, titulo: string) => {
    if (!window.confirm(`Arquivar “${titulo}”? Sai da agenda, mas podes repor na ficha.`)) return;
    try {
      await arquivarSeguimento(id);
      toast.success("Compromisso eliminado.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const guardar = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      if (editing.id) {
        await atualizarSeguimento(editing.id, {
          titulo: editing.titulo.trim(),
          data: editing.data,
          hora: editing.hora || undefined,
          notas: editing.notas || undefined,
        });
        toast.success("Compromisso atualizado.");
      } else {
        await addSeguimento({
          tipo: "Evento",
          titulo: editing.titulo.trim(),
          data: editing.data,
          hora: editing.hora || undefined,
          notas: editing.notas || undefined,
          estado: "Pendente",
          prioridade: "Média",
        });
        toast.success("Compromisso registado.");
      }
      setEditing(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Criação rápida a partir de um dia da grelha — mesmo formulário do "registar".
  const criarNoDia = (key: string) => {
    setSelectedKey(key);
    setEditing({ id: null, titulo: "", data: key, hora: "", notas: "" });
  };

  const abrirEdicao = (e: AgendaCardEvent) => {
    const full = porId.get(e.id);
    setEditing({
      id: e.id,
      titulo: e.titulo,
      data: String(e.data).slice(0, 10),
      hora: (e.hora ?? "").slice(0, 5),
      notas: full?.notas ?? "",
    });
  };

  // Clique num bloco da grelha de horas → mesmo formulário de edição.
  const abrirEdicaoPorId = (id: string) => {
    const c = cartao(id);
    if (c) abrirEdicao(c);
  };

  // Clique num slot vazio da grelha → novo compromisso com o horário pré-preenchido.
  const criarNoSlot = (key: string, hora: string) => {
    setSelectedKey(key);
    setEditing({ id: null, titulo: "", data: key, hora, notas: "" });
  };

  return (
    <AppShell>
      <PageHeader title="Calendário" subtitle="Vista interna dos compromissos." />
      <div className="grid gap-4 md:grid-cols-[1fr_320px]">
        <div className="c-card p-2 sm:p-4">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-1">
              {view === "mes" && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Mês anterior"
                    onClick={() => mudarMes(-1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="min-w-[9.5rem] text-center text-[15px] font-semibold sm:text-left">
                    {monthLabel(month)}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Mês seguinte"
                    onClick={() => mudarMes(1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </>
              )}
              {view === "semana" && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Semana anterior"
                    onClick={() => mudarSemana(-1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="min-w-[12rem] text-center text-[15px] font-semibold sm:text-left">
                    {shortDayLabel(semanaInicio)} – {shortDayLabel(addDaysKey(semanaInicio, 6))}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Semana seguinte"
                    onClick={() => mudarSemana(1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </>
              )}
              {view === "hoje" && (
                <div className="text-[15px] font-semibold capitalize">{longDayLabel(todayKey)}</div>
              )}
              {view === "lista" && (
                <div className="text-[15px] font-semibold">Próximos compromissos</div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={view === v.id}
                  className={cn("c-pill tap-44", view === v.id && "active")}
                  onClick={() => {
                    setView(v.id);
                    if (v.id === "mes") {
                      const d = new Date(`${selectedKey}T12:00:00`);
                      setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                    }
                  }}
                >
                  {v.label}
                </button>
              ))}
              {(view === "mes" || view === "semana") && (
                <button
                  type="button"
                  className="c-pill tap-44"
                  onClick={() => {
                    const n = new Date();
                    setMonth(new Date(n.getFullYear(), n.getMonth(), 1));
                    setSelectedKey(dayKey(n));
                  }}
                >
                  Ir para hoje
                </button>
              )}
            </div>
          </div>
          <div className="space-y-4">
            {view === "mes" && (
              <MonthGrid
                month={month}
                selectedKey={selectedKey}
                markedKeys={new Set(contagens.keys())}
                counts={contagens}
                onQuickAdd={criarNoDia}
                onSelect={(k) => {
                  setSelectedKey(k);
                  const d = new Date(`${k}T12:00:00`);
                  if (
                    d.getMonth() !== month.getMonth() ||
                    d.getFullYear() !== month.getFullYear()
                  ) {
                    setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                  }
                }}
              />
            )}

            {view === "semana" && (
              <div className="space-y-4">
                {semana.every((g) => g.events.length === 0) && (
                  <EmptyWeek onAddEvent={() => criarNoDia(selectedKey)} />
                )}
                {/* Grelha de horas: em mobile mostra só o dia selecionado (como o
                    Google Calendar), em ecrã largo os 7 dias lado a lado. */}
                <TimeGrid
                  dayKeys={isMobile ? [selectedKey] : semana.map((g) => g.key)}
                  eventsByDay={porDia}
                  todayKey={todayKey}
                  selectedKey={selectedKey}
                  onSelectDay={setSelectedKey}
                  onEventClick={abrirEdicaoPorId}
                  onSlotClick={criarNoSlot}
                />
                {isMobile && (
                  <div className="flex flex-wrap gap-1.5">
                    {semana.map((g) => (
                      <button
                        key={g.key}
                        type="button"
                        aria-pressed={g.key === selectedKey}
                        className={cn("c-pill tap-44", g.key === selectedKey && "active")}
                        onClick={() => setSelectedKey(g.key)}
                      >
                        {shortDayLabel(g.key)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {view === "hoje" && (
              <TimeGrid
                dayKeys={[todayKey]}
                eventsByDay={porDia}
                todayKey={todayKey}
                selectedKey={todayKey}
                onEventClick={abrirEdicaoPorId}
                onSlotClick={criarNoSlot}
              />
            )}

            {view === "lista" && (
              <div className="space-y-4">
                {lista.length === 0 && <div className="c-empty">Sem compromissos futuros.</div>}
                {lista.map((g) => (
                  <div key={g.key} className="space-y-2">
                    <div className="c-section-title capitalize">{longDayLabel(g.key)}</div>
                    {g.events.map((e) => {
                      const c = cartao(e.id);
                      return c ? (
                        <EventCard key={e.id} e={c} onEdit={abrirEdicao} onArchive={remover} />
                      ) : null;
                    })}
                  </div>
                ))}
                {haMais && (
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={() => setListDays((d) => d + 30)}
                  >
                    Carregar mais
                  </Button>
                )}
              </div>
            )}

            {(view === "hoje" || view === "mes" || view === "semana") && (
              <div className="space-y-2 border-t border-border pt-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="c-section-title capitalize">{longDayLabel(diaKey)}</div>
                  <Button size="sm" variant="secondary" onClick={() => criarNoDia(diaKey)}>
                    <Plus className="mr-1 h-4 w-4" /> Novo compromisso
                  </Button>
                </div>
                {doDia.length === 0 && (
                  <EmptyDay label="Nenhum compromisso para este dia. Clica em + para adicionar." />
                )}
                {doDia.map((e) => {
                  const c = cartao(e.id);
                  return c ? (
                    <EventCard key={e.id} e={c} onEdit={abrirEdicao} onArchive={remover} />
                  ) : null;
                })}
              </div>
            )}
          </div>
        </div>
        <div className="c-card h-fit p-4">
          <div className="c-section-title mb-2">Integrações</div>
          <div className="space-y-3 text-sm">
            <p className="c-muted text-[13px]">
              Liga o Google Calendar ou o Outlook e os compromissos passam a andar nos dois
              sentidos.
            </p>
            <Link to="/definicoes" className="c-btn w-full justify-start">
              Definições calendário
            </Link>
            <ForceSyncButton />
          </div>
        </div>
      </div>

      <Dialog
        open={!!editing}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Editar compromisso" : "Novo compromisso"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="ev-titulo">Título</Label>
                <Input
                  id="ev-titulo"
                  value={editing.titulo}
                  onChange={(ev) => setEditing({ ...editing, titulo: ev.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ev-data">Data</Label>
                  <Input
                    id="ev-data"
                    type="date"
                    value={editing.data}
                    onChange={(ev) => setEditing({ ...editing, data: ev.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ev-hora">Hora</Label>
                  <Input
                    id="ev-hora"
                    type="time"
                    value={editing.hora}
                    onChange={(ev) => setEditing({ ...editing, hora: ev.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-notas">Notas</Label>
                <Textarea
                  id="ev-notas"
                  rows={3}
                  value={editing.notas}
                  onChange={(ev) => setEditing({ ...editing, notas: ev.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={saving || !editing?.titulo.trim()}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
