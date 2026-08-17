import { appTitle } from "@/lib/brand";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { FREQ_LABEL, WEEKDAY_LABELS, computeNextRun, type Frequency, type Routine } from "@/lib/routines";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/_authenticated/rotinas/$id")({
  head: () => ({
    meta: [
      { title: appTitle("Ficha de rotina") },
      { name: "description", content: "Configura este lembrete recorrente." },
      { property: "og:title", content: appTitle("Ficha de rotina") },
      { property: "og:description", content: "Configura este lembrete recorrente." },
    ],
  }),
  component: RotinaDetail,
});

function RotinaDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { pessoas, oportunidades } = useStore();

  const q = useQuery({
    queryKey: ["routines", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("routines").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as Routine | null;
    },
  });

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("weekly");
  const [intervalN, setIntervalN] = useState(1);
  const [weekday, setWeekday] = useState<number>(1);
  const [dayOfMonth, setDayOfMonth] = useState<number>(1);
  const [timeOfDay, setTimeOfDay] = useState("09:00");
  const [priority, setPriority] = useState<Routine["priority"]>("Média");
  const [personId, setPersonId] = useState("");
  const [opportunityId, setOpportunityId] = useState("");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!q.data) return;
    const r = q.data;
    setTitle(r.title);
    setNotes(r.notes ?? "");
    setFrequency(r.frequency);
    setIntervalN(r.interval_n);
    setWeekday(r.weekday ?? 1);
    setDayOfMonth(r.day_of_month ?? 1);
    setTimeOfDay(r.time_of_day ?? "09:00");
    setPriority(r.priority);
    setPersonId(r.person_id ?? "");
    setOpportunityId(r.opportunity_id ?? "");
    setActive(r.active);
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Título obrigatório.");
      const next = computeNextRun({
        frequency, interval_n: intervalN,
        weekday: frequency === "weekly" ? weekday : null,
        day_of_month: frequency === "monthly" ? dayOfMonth : null,
        time_of_day: timeOfDay,
      });
      const { error } = await supabase.from("routines").update({
        title: title.trim(),
        notes: notes.trim() || null,
        frequency, interval_n: intervalN,
        weekday: frequency === "weekly" ? weekday : null,
        day_of_month: frequency === "monthly" ? dayOfMonth : null,
        time_of_day: timeOfDay,
        priority,
        person_id: personId || null,
        opportunity_id: opportunityId || null,
        active,
        next_run_at: next.toISOString(),
      } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rotina guardada.");
      qc.invalidateQueries({ queryKey: ["routines"] });
      qc.invalidateQueries({ queryKey: ["routines", id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro."),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("routines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rotina apagada.");
      qc.invalidateQueries({ queryKey: ["routines"] });
      navigate({ to: "/rotinas" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro."),
  });

  if (q.isLoading) return <AppShell><PageHeader title="A carregar…" /></AppShell>;
  if (!q.data) {
    return (
      <AppShell>
        <PageHeader title="Rotina não encontrada" />
        <Button variant="ghost" onClick={() => navigate({ to: "/rotinas" })}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Voltar
        </Button>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-2">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/rotinas" })}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Rotinas
        </Button>
      </div>
      <PageHeader
        title={q.data.title}
        subtitle={`${FREQ_LABEL[q.data.frequency]} · próxima ${new Date(q.data.next_run_at).toLocaleString("pt-PT")}`}
        action={
          <div className="flex gap-2">
            <Button variant="ghost" className="text-destructive" onClick={() => { if (confirm("Apagar esta rotina?")) remove.mutate(); }}>
              <Trash2 className="mr-1 h-4 w-4" /> Apagar
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              <Save className="mr-1 h-4 w-4" /> Guardar
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-semibold">Base</h3>
            <div className="grid gap-2">
              <Label htmlFor="t">Título</Label>
              <Input id="t" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="n">Notas</Label>
              <Textarea id="n" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Ativa</Label>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-semibold">Recorrência</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label>Frequência</Label>
                <Select value={frequency} onValueChange={(v) => setFrequency(v as Frequency)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Diária</SelectItem>
                    <SelectItem value="weekly">Semanal</SelectItem>
                    <SelectItem value="monthly">Mensal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>A cada</Label>
                <Input type="number" min={1} max={365} value={intervalN}
                  onChange={(e) => setIntervalN(Math.max(1, Number(e.target.value) || 1))} />
              </div>
            </div>
            {frequency === "weekly" && (
              <div className="grid gap-2">
                <Label>Dia da semana</Label>
                <Select value={String(weekday)} onValueChange={(v) => setWeekday(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WEEKDAY_LABELS.map((l, i) => <SelectItem key={i} value={String(i)}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {frequency === "monthly" && (
              <div className="grid gap-2">
                <Label>Dia do mês</Label>
                <Input type="number" min={1} max={31} value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(Math.max(1, Math.min(31, Number(e.target.value) || 1)))} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label>Hora</Label>
                <Input type="time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Prioridade</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as Routine["priority"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["Alta", "Média", "Baixa"] as const).map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-semibold">Associar (opcional)</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>Pessoa</Label>
                <Select value={personId || "__none"} onValueChange={(v) => setPersonId(v === "__none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— sem pessoa —</SelectItem>
                    {pessoas.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Oportunidade</Label>
                <Select value={opportunityId || "__none"} onValueChange={(v) => setOpportunityId(v === "__none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— sem oportunidade —</SelectItem>
                    {oportunidades.map((o) => {
                      const nome = pessoas.find((p) => p.id === o.pessoaId)?.nome ?? "";
                      return <SelectItem key={o.id} value={o.id}>{o.tipo}{nome ? ` · ${nome}` : ""}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}