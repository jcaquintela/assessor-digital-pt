import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  formatData,
  type SeguimentoTipo,
  type SeguimentoEstado,
  type SeguimentoPrioridade,
} from "@/lib/demo-data";
import { ChevronLeft, Trash2, Save, CheckCircle2, Calendar as CalendarIcon, Clock } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EntityFilesCard } from "@/components/drive/entity-files-card";
import { Briefcase, User as UserIcon, Phone } from "lucide-react";

const TIPOS: SeguimentoTipo[] = ["Tarefa", "Evento"];
const ESTADOS: SeguimentoEstado[] = ["Pendente", "Concluído", "Atrasado"];
const PRIORIDADES: SeguimentoPrioridade[] = ["Alta", "Média", "Baixa"];

export const Route = createFileRoute("/_authenticated/seguimentos/$id")({
  head: () => ({
    meta: [
      { title: "Ficha de seguimento — Assessor do Consultor" },
      { name: "description", content: "Detalhe de tarefa ou evento com pessoa, oportunidade e notas." },
      { property: "og:title", content: "Ficha de seguimento — Assessor do Consultor" },
      { property: "og:description", content: "Memória organizada por seguimento." },
    ],
  }),
  component: SeguimentoDetail,
});

function SeguimentoDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const {
    seguimentos, loading,
  } = useStore();

  const s = useMemo(() => seguimentos.find((x) => x.id === id), [seguimentos, id]);

  // Rede de segurança: se ainda não está na cache local (ou veio de uma
  // prioridade calculada no servidor), vai buscá-lo à base de dados. Antes,
  // caía em "não encontrado" e o consultor acabava na lista geral.
  const fallback = useQuery({
    queryKey: ["follow_up", id],
    enabled: !s,
    queryFn: async () => {
      const { data } = await supabase.from("follow_ups").select("*").eq("id", id).maybeSingle();
      if (!data) return null;
      const r = data as any;
      return {
        id: r.id,
        tipo: (r.due_time || String(r.type ?? "").toLowerCase().includes("event") ? "Evento" : "Tarefa") as SeguimentoTipo,
        titulo: r.title,
        data: r.due_date,
        hora: r.due_time ?? undefined,
        pessoaId: r.person_id ?? undefined,
        oportunidadeId: r.opportunity_id ?? undefined,
        estado: (r.status ?? "Pendente") as SeguimentoEstado,
        prioridade: (r.priority ?? "Média") as SeguimentoPrioridade,
        notas: r.notes ?? undefined,
      };
    },
  });

  const item = s ?? fallback.data ?? null;

  if ((loading || fallback.isLoading) && !item) {
    return <AppShell><PageHeader title="A carregar…" /></AppShell>;
  }
  if (!item) {
    return (
      <AppShell>
        <PageHeader title="Seguimento não encontrado" subtitle="Pode ter sido apagado." />
        <Button variant="ghost" onClick={() => navigate({ to: "/seguimentos" })}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Voltar
        </Button>
      </AppShell>
    );
  }

  return <SeguimentoView key={item.id} s={item} />;
}

function SeguimentoView({ s }: { s: Seguimento }) {
  const navigate = useNavigate();
  const { pessoas, oportunidades, atualizarSeguimento, eliminarSeguimento, concluirSeguimento } = useStore();

  const [tipo, setTipo] = useState<SeguimentoTipo>(s?.tipo ?? "Tarefa");
  const [titulo, setTitulo] = useState(s?.titulo ?? "");
  const [data, setData] = useState((s?.data ?? "").slice(0, 10));
  const [hora, setHora] = useState(s?.hora ?? "");
  const [estado, setEstado] = useState<SeguimentoEstado>(s?.estado ?? "Pendente");
  const [prioridade, setPrioridade] = useState<SeguimentoPrioridade>(s?.prioridade ?? "Média");
  const [pessoaId, setPessoaId] = useState(s?.pessoaId ?? "");
  const [oportunidadeId, setOportunidadeId] = useState(s?.oportunidadeId ?? "");
  const [notas, setNotas] = useState(s?.notas ?? "");
  const [busy, setBusy] = useState(false);

  const pessoa = pessoas.find((p) => p.id === s.pessoaId);
  const op = oportunidades.find((o) => o.id === s.oportunidadeId);

  const dirty =
    tipo !== s.tipo ||
    titulo !== s.titulo ||
    (data || "") !== (s.data ?? "").slice(0, 10) ||
    (hora || "") !== (s.hora || "") ||
    estado !== s.estado ||
    prioridade !== s.prioridade ||
    (pessoaId || "") !== (s.pessoaId || "") ||
    (oportunidadeId || "") !== (s.oportunidadeId || "") ||
    (notas || "") !== (s.notas || "");

  const guardar = async () => {
    if (!titulo.trim()) { toast.error("Título obrigatório."); return; }
    if (!data) { toast.error("Data obrigatória."); return; }
    setBusy(true);
    try {
      await atualizarSeguimento(s.id, {
        tipo, titulo: titulo.trim(),
        data,
        hora: hora || undefined,
        estado, prioridade,
        pessoaId: pessoaId || undefined,
        oportunidadeId: oportunidadeId || undefined,
        notas: notas.trim() || undefined,
      });
      toast.success("Alterações guardadas.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const apagar = async () => {
    if (!confirm("Apagar este seguimento?")) return;
    try {
      await eliminarSeguimento(s.id);
      toast.success("Seguimento apagado.");
      navigate({ to: "/seguimentos" });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const concluir = async () => {
    try {
      await concluirSeguimento(s.id);
      setEstado("Concluído");
      toast.success("Marcado como concluído.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <AppShell>
      <div className="mb-2">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/seguimentos" })}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Seguimentos
        </Button>
      </div>
      <PageHeader
        title={s.titulo}
        subtitle={`${s.tipo === "Evento" ? "Evento" : "Tarefa"} · ${formatData(s.data)}${s.hora ? ` · ${s.hora}` : ""}`}
        action={
          <div className="flex gap-2">
            {s.estado !== "Concluído" && (
              <Button variant="outline" onClick={concluir}>
                <CheckCircle2 className="mr-1 h-4 w-4" /> Concluir
              </Button>
            )}
            <Button variant="ghost" className="text-destructive" onClick={apagar}>
              <Trash2 className="mr-1 h-4 w-4" /> Apagar
            </Button>
            <Button onClick={guardar} disabled={!dirty || busy}>
              <Save className="mr-1 h-4 w-4" /> Guardar
            </Button>
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <Badge variant={s.tipo === "Evento" ? "default" : "secondary"}>
          {s.tipo === "Evento" ? <CalendarIcon className="mr-1 h-3 w-3" /> : <Clock className="mr-1 h-3 w-3" />}
          {s.tipo}
        </Badge>
        <Badge variant="outline">{s.estado}</Badge>
        <Badge variant={s.prioridade === "Alta" ? "destructive" : "secondary"}>{s.prioridade}</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-semibold">Dados</h3>
            <div className="grid gap-2">
              <Label htmlFor="titulo">Título</Label>
              <Input id="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label>Tipo</Label>
                <Select value={tipo} onValueChange={(v) => setTipo(v as SeguimentoTipo)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Estado</Label>
                <Select value={estado} onValueChange={(v) => setEstado(v as SeguimentoEstado)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ESTADOS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label htmlFor="data">Data</Label>
                <Input id="data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="hora">Hora</Label>
                <Input id="hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Prioridade</Label>
              <Select value={prioridade} onValueChange={(v) => setPrioridade(v as SeguimentoPrioridade)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORIDADES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-semibold">Relações & notas</h3>
            <div className="grid gap-2">
              <Label>Pessoa</Label>
              <Select value={pessoaId || "__none"} onValueChange={(v) => setPessoaId(v === "__none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— sem pessoa —</SelectItem>
                  {pessoas.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Oportunidade</Label>
              <Select value={oportunidadeId || "__none"} onValueChange={(v) => setOportunidadeId(v === "__none" ? "" : v)}>
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
            <div className="grid gap-2">
              <Label htmlFor="notas">Notas</Label>
              <Textarea id="notas" rows={5} value={notas} onChange={(e) => setNotas(e.target.value)} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Pessoa associada</h3>
            {pessoa ? (
              <Link to="/pessoas/$id" params={{ id: pessoa.id }} className="block rounded-lg border border-border p-3 text-sm hover:border-primary/40">
                <div className="font-medium">{pessoa.nome}</div>
                <div className="text-xs text-muted-foreground">{pessoa.relacao}</div>
              </Link>
            ) : <p className="text-sm text-muted-foreground">Sem pessoa associada.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Oportunidade associada</h3>
            {op ? (
              <Link to="/oportunidades/$id" params={{ id: op.id }} className="block rounded-lg border border-border p-3 text-sm hover:border-primary/40">
                <div className="font-medium">{op.tipo}</div>
                <div className="text-xs text-muted-foreground">{op.estado}</div>
              </Link>
            ) : <p className="text-sm text-muted-foreground">Sem oportunidade associada.</p>}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}