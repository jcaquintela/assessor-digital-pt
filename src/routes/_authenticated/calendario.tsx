import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { formatDataHora } from "@/lib/demo-data";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { MonthGrid, dayKey, monthLabel } from "@/components/calendario/month-grid";

export const Route = createFileRoute("/_authenticated/calendario")({
  head: () => ({
    meta: [
      { title: "Calendário — Assessor do Consultor" },
      { name: "description", content: "Calendário interno do consultor." },
      { property: "og:title", content: "Calendário — Assessor do Consultor" },
      { property: "og:description", content: "Calendário interno do consultor." },
    ],
  }),
  component: CalendarioPage,
});

function CalendarioPage() {
  const { seguimentos, atualizarSeguimento, eliminarSeguimento } = useStore();
  const [editing, setEditing] = useState<null | {
    id: string; titulo: string; data: string; hora: string; notas: string;
  }>(null);
  const [saving, setSaving] = useState(false);
  const hoje = new Date();
  const [month, setMonth] = useState(() => new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const [selectedKey, setSelectedKey] = useState(() => dayKey(new Date()));

  // Compromissos = registos classificados como Evento (ver src/lib/agenda-kind.ts),
  // excluindo os já concluídos/cancelados.
  const eventos = useMemo(
    () => seguimentos
      .filter((s) => s.tipo === "Evento")
      .filter((s) => {
        const e = (s.estado ?? "").toLowerCase();
        return e !== "concluído" && e !== "concluido" && e !== "cancelado";
      })
      .sort((a, b) => a.data.localeCompare(b.data)),
    [seguimentos],
  );

  // Eventos agrupados por dia local, para o ponto indicador e a lista do dia.
  const porDia = useMemo(() => {
    const map = new Map<string, typeof eventos>();
    for (const e of eventos) {
      const k = dayKey(e.data);
      const list = map.get(k) ?? [];
      list.push(e);
      map.set(k, list);
    }
    return map;
  }, [eventos]);

  const doDia = porDia.get(selectedKey) ?? [];
  const selectedLabel = new Date(`${selectedKey}T12:00:00`).toLocaleDateString("pt-PT", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const mudarMes = (delta: number) =>
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  const remover = async (id: string, titulo: string) => {
    if (!window.confirm(`Eliminar “${titulo}”? Esta ação não pode ser desfeita.`)) return;
    try {
      await eliminarSeguimento(id);
      toast.success("Compromisso eliminado.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const guardar = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await atualizarSeguimento(editing.id, {
        titulo: editing.titulo.trim(),
        data: editing.data,
        hora: editing.hora || undefined,
        notas: editing.notas || undefined,
      });
      toast.success("Compromisso atualizado.");
      setEditing(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <PageHeader title="Calendário" subtitle="Vista interna dos compromissos." />
      <div className="grid gap-4 md:grid-cols-[1fr_320px]">
        <div className="c-card p-4">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" aria-label="Mês anterior" onClick={() => mudarMes(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-[9.5rem] text-center text-[15px] font-semibold sm:text-left">
                {monthLabel(month)}
              </div>
              <Button variant="ghost" size="icon" aria-label="Mês seguinte" onClick={() => mudarMes(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" className="c-pill active">Mês</button>
              <button type="button" className="c-pill opacity-50" disabled>Semana</button>
              <button type="button" className="c-pill opacity-50" disabled>Lista</button>
              <button
                type="button"
                className="c-pill"
                onClick={() => {
                  const n = new Date();
                  setMonth(new Date(n.getFullYear(), n.getMonth(), 1));
                  setSelectedKey(dayKey(n));
                }}
              >
                Hoje
              </button>
            </div>
          </div>
          <div className="space-y-4">
            <MonthGrid
              month={month}
              selectedKey={selectedKey}
              markedKeys={new Set(porDia.keys())}
              onSelect={(k) => {
                setSelectedKey(k);
                const d = new Date(`${k}T12:00:00`);
                if (d.getMonth() !== month.getMonth() || d.getFullYear() !== month.getFullYear()) {
                  setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                }
              }}
            />

            <div className="space-y-2 border-t border-border pt-4">
              <div className="c-section-title capitalize">{selectedLabel}</div>
              {doDia.length === 0 && (
                <div className="c-empty">Sem compromissos neste dia.</div>
              )}
              {doDia.map((e) => (
              <div key={e.id} className="c-card c-card-hover p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <Link to="/seguimentos/$id" params={{ id: e.id }} className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold">{e.titulo}</div>
                    <div className="c-muted c-mono mt-1 text-[11.5px]">{formatDataHora(e.data)}</div>
                  </Link>
                  <span className="c-badge shrink-0">
                    <CalendarIcon className="h-3 w-3" /> {e.hora ?? "—"}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    className="c-badge"
                    onClick={() => setEditing({
                      id: e.id,
                      titulo: e.titulo,
                      data: String(e.data).slice(0, 10),
                      hora: (e.hora ?? "").slice(0, 5),
                      notas: e.notas ?? "",
                    })}
                  >
                    <Pencil className="h-3 w-3" /> Editar
                  </button>
                  <button type="button" className="c-badge text-destructive" onClick={() => remover(e.id, e.titulo)}>
                    <Trash2 className="h-3 w-3" /> Eliminar
                  </button>
                </div>
              </div>
              ))}
            </div>
          </div>
        </div>
        <div className="c-card h-fit p-4">
          <div className="c-section-title mb-2">Integrações</div>
          <div className="space-y-3 text-sm">
            <p className="c-muted text-[13px]">
              Liga o Google Calendar ou o Outlook e os compromissos passam a andar nos dois sentidos.
            </p>
            <Link to="/definicoes" className="c-btn w-full justify-start">
              Gerir ligações de calendário
            </Link>
          </div>
        </div>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Editar compromisso</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="ev-titulo">Título</Label>
                <Input id="ev-titulo" value={editing.titulo} onChange={(ev) => setEditing({ ...editing, titulo: ev.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ev-data">Data</Label>
                  <Input id="ev-data" type="date" value={editing.data} onChange={(ev) => setEditing({ ...editing, data: ev.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ev-hora">Hora</Label>
                  <Input id="ev-hora" type="time" value={editing.hora} onChange={(ev) => setEditing({ ...editing, hora: ev.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-notas">Notas</Label>
                <Textarea id="ev-notas" rows={3} value={editing.notas} onChange={(ev) => setEditing({ ...editing, notas: ev.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={guardar} disabled={saving || !editing?.titulo.trim()}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}