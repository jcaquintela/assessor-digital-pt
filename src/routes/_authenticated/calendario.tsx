import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { formatDataHora } from "@/lib/demo-data";
import { Calendar as CalendarIcon, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
        <Card>
          <CardHeader><CardTitle className="text-base">Próximos compromissos</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {eventos.length === 0 && (
              <p className="text-sm text-muted-foreground">Não tens compromissos agendados.</p>
            )}
            {eventos.map((e) => (
              <div
                key={e.id}
                className="rounded-lg border border-border p-3 transition-colors hover:border-primary/40"
              >
                <div className="flex items-center justify-between gap-3">
                  <Link to="/seguimentos/$id" params={{ id: e.id }} className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{e.titulo}</div>
                    <div className="text-xs text-muted-foreground">{formatDataHora(e.data)}</div>
                  </Link>
                  <Badge variant="outline" className="shrink-0">
                    <CalendarIcon className="mr-1 h-3 w-3" />{e.hora ?? "—"}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing({
                      id: e.id,
                      titulo: e.titulo,
                      data: String(e.data).slice(0, 10),
                      hora: (e.hora ?? "").slice(0, 5),
                      notas: e.notas ?? "",
                    })}
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remover(e.id, e.titulo)}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Eliminar
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Integrações</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Liga o Google Calendar ou o Outlook e os compromissos passam a andar nos dois sentidos.
            </p>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link to="/definicoes">Gerir ligações de calendário</Link>
            </Button>
          </CardContent>
        </Card>
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