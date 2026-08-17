import { appTitle } from "@/lib/brand";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, RefreshCw, Repeat } from "lucide-react";
import { useAssessorName } from "@/lib/assessor/assessor-name";
import {
  FREQ_LABEL,
  WEEKDAY_LABELS,
  computeNextRun,
  materializeDueRoutines,
  type Frequency,
  type Routine,
} from "@/lib/routines";

export const Route = createFileRoute("/_authenticated/rotinas")({
  head: () => ({
    meta: [
      { title: appTitle("Rotinas") },
      { name: "description", content: "Lembretes recorrentes configuráveis do consultor." },
      { property: "og:title", content: appTitle("Rotinas") },
      { property: "og:description", content: "Configura hábitos e lembretes que se repetem." },
    ],
  }),
  component: RotinasPage,
});

function formatWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function RotinasPage() {
  const qc = useQueryClient();
  const { name: assessorName } = useAssessorName();

  const q = useQuery({
    queryKey: ["routines"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routines")
        .select("*")
        .order("active", { ascending: false })
        .order("next_run_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Routine[];
    },
  });

  // Materialize on open (silent).
  useEffect(() => {
    materializeDueRoutines()
      .then((n) => {
        if (n > 0) {
          qc.invalidateQueries({ queryKey: ["follow_ups"] });
          qc.invalidateQueries({ queryKey: ["routines"] });
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runNow = useMutation({
    mutationFn: () => materializeDueRoutines(),
    onSuccess: (n) => {
      toast.success(n > 0 ? `${n} lembrete(s) criado(s).` : "Nada por gerar agora.");
      qc.invalidateQueries({ queryKey: ["follow_ups"] });
      qc.invalidateQueries({ queryKey: ["routines"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao gerar lembretes."),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("routines").update({ active } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["routines"] }),
    onError: (e: any) => toast.error(e?.message ?? "Erro."),
  });

  // Create form state
  const [title, setTitle] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("weekly");
  const [intervalN, setIntervalN] = useState(1);
  const [weekday, setWeekday] = useState<number>(1);
  const [dayOfMonth, setDayOfMonth] = useState<number>(1);
  const [timeOfDay, setTimeOfDay] = useState("09:00");
  const [priority, setPriority] = useState<Routine["priority"]>("Média");

  const create = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Sessão expirada.");
      if (!title.trim()) throw new Error("Título obrigatório.");
      const draft = {
        frequency, interval_n: intervalN,
        weekday: frequency === "weekly" ? weekday : null,
        day_of_month: frequency === "monthly" ? dayOfMonth : null,
        time_of_day: timeOfDay,
      };
      const next = computeNextRun(draft);
      const { error } = await supabase.from("routines").insert({
        user_id: uid,
        title: title.trim(),
        frequency, interval_n: intervalN,
        weekday: draft.weekday,
        day_of_month: draft.day_of_month,
        time_of_day: timeOfDay,
        next_run_at: next.toISOString(),
        priority,
        active: true,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rotina criada.");
      setTitle("");
      qc.invalidateQueries({ queryKey: ["routines"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao criar."),
  });

  return (
    <AppShell>
      <PageHeader
        title="Rotinas"
        subtitle="Lembretes recorrentes que criam automaticamente seguimentos."
        action={
          <Button variant="outline" onClick={() => runNow.mutate()} disabled={runNow.isPending}>
            <RefreshCw className="mr-1 h-4 w-4" /> Gerar agora
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="space-y-3 p-4">
          <h3 className="text-sm font-semibold">Nova rotina</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="titulo">Título</Label>
              <Input id="titulo" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Rever pipeline semanal" />
            </div>
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
              <Label htmlFor="intervalo">A cada</Label>
              <div className="flex items-center gap-2">
                <Input id="intervalo" type="number" min={1} max={365} value={intervalN}
                  onChange={(e) => setIntervalN(Math.max(1, Number(e.target.value) || 1))} className="w-24" />
                <span className="text-sm text-muted-foreground">
                  {frequency === "daily" ? "dia(s)" : frequency === "weekly" ? "semana(s)" : "mês(es)"}
                </span>
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
                <Label htmlFor="dom">Dia do mês</Label>
                <Input id="dom" type="number" min={1} max={31} value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(Math.max(1, Math.min(31, Number(e.target.value) || 1)))} />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="hora">Hora</Label>
              <Input id="hora" type="time" value={timeOfDay} onChange={(e) => setTimeOfDay(e.target.value)} />
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
          <div className="flex justify-end">
            <Button onClick={() => create.mutate()} disabled={create.isPending || !title.trim()}>
              <Plus className="mr-1 h-4 w-4" /> Criar rotina
            </Button>
          </div>
        </CardContent>
      </Card>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : (q.data ?? []).length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Ainda não há rotinas. Cria a primeira em cima — o {assessorName} gera os seguimentos por ti.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {q.data!.map((r) => (
            <Card key={r.id} className={r.active ? "" : "opacity-60"}>
              <CardContent className="flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Repeat className="h-4 w-4 text-primary" />
                  <Link to="/rotinas/$id" params={{ id: r.id }} className="text-sm font-medium hover:underline">
                    {r.title}
                  </Link>
                  <Badge variant="secondary" className="text-[10px]">{FREQ_LABEL[r.frequency]}</Badge>
                  {r.frequency === "weekly" && r.weekday !== null && (
                    <Badge variant="outline" className="text-[10px]">{WEEKDAY_LABELS[r.weekday]}</Badge>
                  )}
                  {r.frequency === "monthly" && r.day_of_month !== null && (
                    <Badge variant="outline" className="text-[10px]">dia {r.day_of_month}</Badge>
                  )}
                  {r.time_of_day && <Badge variant="outline" className="text-[10px]">{r.time_of_day}</Badge>}
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Ativa</span>
                    <Switch checked={r.active} onCheckedChange={(v) => toggleActive.mutate({ id: r.id, active: v })} />
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Próxima: <strong className="text-foreground">{formatWhen(r.next_run_at)}</strong>
                  {r.last_run_at ? ` · Última: ${formatWhen(r.last_run_at)}` : ""}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}