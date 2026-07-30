import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatData, formatEUR, type Oportunidade, type OportunidadeEstado, type OportunidadeTipo } from "@/lib/demo-data";
import { ChevronLeft, Trash2, Save, MessageSquarePlus, Archive } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const TIPOS: OportunidadeTipo[] = ["Compra", "Venda", "Potencial Angariação", "Arrendamento", "Investimento", "Recomendação"];
const ESTADOS: OportunidadeEstado[] = ["Novo", "Em conversa", "Visita", "Proposta", "CPCV", "Escritura", "Perdida", "Arquivada"];
const PROBS: Oportunidade["probabilidade"][] = ["Baixa", "Média", "Alta"];

// Os registos criados pelo motor gravam em minúsculas ("venda", "fechado").
// Normalizamos para os valores da ficha, senão os selects aparecem vazios.
function pick<T extends string>(options: readonly T[], raw: unknown, fallback: T): T {
  const v = String(raw ?? "").trim().toLowerCase();
  return options.find((o) => o.toLowerCase() === v) ?? fallback;
}
const ESTADO_ALIAS: Record<string, OportunidadeEstado> = {
  aberto: "Novo", aberta: "Novo", fechado: "Escritura", fechada: "Escritura",
  ganho: "Escritura", ganha: "Escritura", perdido: "Perdida", arquivado: "Arquivada",
};
const normEstado = (raw: unknown): OportunidadeEstado =>
  ESTADO_ALIAS[String(raw ?? "").trim().toLowerCase()] ?? pick(ESTADOS, raw, "Novo");
const normTipo = (raw: unknown): OportunidadeTipo => pick(TIPOS, raw, "Compra");
const normProb = (raw: unknown): Oportunidade["probabilidade"] => pick(PROBS, raw, "Média");

export const Route = createFileRoute("/_authenticated/oportunidades/$id")({
  head: () => ({
    meta: [
      { title: "Ficha da oportunidade — Assessor do Consultor" },
      { name: "description", content: "Pessoa, imóvel, estado, comissões, seguimentos e histórico." },
      { property: "og:title", content: "Ficha da oportunidade — Assessor do Consultor" },
      { property: "og:description", content: "Memória organizada por oportunidade." },
    ],
  }),
  component: OportunidadeDetail,
});

function OportunidadeDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const {
    oportunidades, pessoas, imoveis, seguimentos, comissoes,
    updateOportunidade, deleteOportunidade, addInteracao, loading,
  } = useStore();

  const op = useMemo(() => oportunidades.find((o) => o.id === id), [oportunidades, id]);

  const [tipo, setTipo] = useState<OportunidadeTipo>(normTipo(op?.tipo));
  const [estado, setEstado] = useState<OportunidadeEstado>(normEstado(op?.estado));
  const [valor, setValor] = useState<string>(String(op?.valor ?? 0));
  const [probabilidade, setProbabilidade] = useState<Oportunidade["probabilidade"]>(normProb(op?.probabilidade));
  const [pessoaId, setPessoaId] = useState<string>(op?.pessoaId ?? "");
  const [imovelId, setImovelId] = useState<string>(op?.imovelId ?? "");
  const [proximaAcao, setProximaAcao] = useState(op?.proximaAcao ?? "");
  const [proximaAcaoData, setProximaAcaoData] = useState(op?.proximaAcaoData ?? "");
  const [notas, setNotas] = useState(op?.notas ?? "");
  const [interacao, setInteracao] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Os dados chegam em assíncrono: sincroniza o formulário quando a ficha carrega.
  useEffect(() => {
    if (!op) return;
    setTipo(normTipo(op.tipo));
    setEstado(normEstado(op.estado));
    setValor(String(op.valor ?? 0));
    setProbabilidade(normProb(op.probabilidade));
    setPessoaId(op.pessoaId ?? "");
    setImovelId(op.imovelId ?? "");
    setProximaAcao(op.proximaAcao ?? "");
    setProximaAcaoData(op.proximaAcaoData ?? "");
    setNotas(op.notas ?? "");
  }, [op?.id]);

  if (loading && !op) {
    return <AppShell><PageHeader title="A carregar…" /></AppShell>;
  }

  if (!op) {
    return (
      <AppShell>
        <PageHeader title="Oportunidade não encontrada" subtitle="Pode ter sido apagada." />
        <Button variant="ghost" onClick={() => navigate({ to: "/oportunidades" })}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Voltar
        </Button>
      </AppShell>
    );
  }

  const pessoa = pessoas.find((p) => p.id === op.pessoaId);
  const imovel = imoveis.find((i) => i.id === op.imovelId);
  const segsOp = seguimentos.filter((s) => s.oportunidadeId === op.id);
  const comsOp = comissoes.filter((c) => c.oportunidadeId === op.id);

  const dirty =
    tipo !== normTipo(op.tipo) ||
    estado !== normEstado(op.estado) ||
    Number(valor) !== op.valor ||
    probabilidade !== normProb(op.probabilidade) ||
    (pessoaId || "") !== (op.pessoaId || "") ||
    (imovelId || "") !== (op.imovelId || "") ||
    (proximaAcao || "") !== (op.proximaAcao || "") ||
    (proximaAcaoData || "") !== (op.proximaAcaoData || "") ||
    (notas || "") !== (op.notas || "");

  const guardar = async () => {
    setBusy(true);
    try {
      await updateOportunidade(op.id, {
        tipo, estado,
        valor: Number(valor) || 0,
        probabilidade,
        pessoaId: pessoaId || undefined,
        imovelId: imovelId || undefined,
        proximaAcao: proximaAcao.trim() || undefined,
        proximaAcaoData: proximaAcaoData || undefined,
        notas: notas.trim() || undefined,
      });
      toast.success("Alterações guardadas.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const registarInteracao = async () => {
    const texto = interacao.trim();
    if (!texto) return;
    setBusy(true);
    try {
      await addInteracao({ oportunidadeId: op.id, pessoaId: op.pessoaId || undefined, conteudoOriginal: texto });
      setInteracao("");
      toast.success("Interação registada.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const apagar = async () => {
    setBusy(true);
    try {
      // Apagar = apagar tudo o que está ligado (movimentos e ligações de ficheiros).
      await supabase.from("financial_movements").delete().eq("opportunity_id", op.id);
      await supabase.from("file_links").delete().eq("entity_type", "opportunity").eq("entity_id", op.id);
      await deleteOportunidade(op.id);
      toast.success("Oportunidade e registos ligados apagados.");
      navigate({ to: "/oportunidades" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  const arquivar = async () => {
    setBusy(true);
    try {
      await updateOportunidade(op.id, { estado: "Arquivada" });
      setEstado("Arquivada");
      toast.success("Oportunidade arquivada. Comissões e ficheiros mantêm-se.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const producao = comsOp.reduce((s, c) => s + c.valor, 0);
  const comissaoRecebida = comsOp.filter((c) => c.estado === "Recebida").reduce((s, c) => s + c.valor, 0);

  return (
    <AppShell>
      <div className="mb-2">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/oportunidades" })}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Oportunidades
        </Button>
      </div>
      <PageHeader
        title={`${normTipo(op.tipo)}${pessoa ? ` · ${pessoa.nome}` : ""}`}
        subtitle={imovel?.titulo ?? "Sem imóvel associado"}
        action={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={arquivar} disabled={busy || normEstado(op.estado) === "Arquivada"}>
              <Archive className="mr-1 h-4 w-4" /> Arquivar
            </Button>
            <Button variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)} disabled={busy}>
              <Trash2 className="mr-1 h-4 w-4" /> Eliminar
            </Button>
            <Button onClick={guardar} disabled={!dirty || busy}>
              <Save className="mr-1 h-4 w-4" /> Guardar
            </Button>
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <Badge variant="secondary">{normEstado(op.estado)}</Badge>
        <span>Valor: <strong className="text-foreground">{formatEUR(op.valor)}</strong></span>
        <span>Produção: <strong className="text-foreground">{formatEUR(producao)}</strong></span>
        <span>Comissão recebida: <strong className="text-foreground">{formatEUR(comissaoRecebida)}</strong></span>
        <span>Probabilidade: <strong className="text-foreground">{op.probabilidade}</strong></span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-semibold">Dados</h3>
            <div className="grid gap-2">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as OportunidadeTipo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Estado</Label>
              <Select value={estado} onValueChange={(v) => setEstado(v as OportunidadeEstado)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ESTADOS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label htmlFor="valor">Valor (€)</Label>
                <Input id="valor" type="number" value={valor} onChange={(e) => setValor(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Probabilidade</Label>
                <Select value={probabilidade} onValueChange={(v) => setProbabilidade(v as Oportunidade["probabilidade"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROBS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
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
              <Label>Imóvel</Label>
              <Select value={imovelId || "__none"} onValueChange={(v) => setImovelId(v === "__none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— sem imóvel —</SelectItem>
                  {imoveis.map((i) => <SelectItem key={i.id} value={i.id}>{i.titulo}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-semibold">Próxima ação & notas</h3>
            <div className="grid gap-2">
              <Label htmlFor="pa">Próxima ação</Label>
              <Input id="pa" value={proximaAcao} onChange={(e) => setProximaAcao(e.target.value)} placeholder="Ex: Enviar proposta" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pad">Data</Label>
              <Input id="pad" type="date" value={(proximaAcaoData ?? "").slice(0, 10)} onChange={(e) => setProximaAcaoData(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notas">Notas</Label>
              <Textarea id="notas" rows={4} value={notas} onChange={(e) => setNotas(e.target.value)} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Pessoa</h3>
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
            <h3 className="mb-3 text-sm font-semibold">Imóvel</h3>
            {imovel ? (
              <Link to="/imoveis/$id" params={{ id: imovel.id }} className="block rounded-lg border border-border p-3 text-sm hover:border-primary/40">
                <div className="font-medium">{imovel.titulo}</div>
                <div className="text-xs text-muted-foreground">{imovel.localizacao} · {formatEUR(imovel.valor)}</div>
              </Link>
            ) : <p className="text-sm text-muted-foreground">Sem imóvel associado.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Comissões ({comsOp.length})</h3>
            {comsOp.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem comissões.</p>
            ) : (
              <div className="space-y-2">
                {comsOp.map((c) => (
                  <div key={c.id} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span>{formatData(c.data)}</span>
                      <span className="font-medium">{formatEUR(c.valor)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{c.estado}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardContent className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Seguimentos ({segsOp.length})</h3>
          {segsOp.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem seguimentos.</p>
          ) : (
            <div className="space-y-2">
              {segsOp.map((s) => (
                <div key={s.id} className="rounded-lg border border-border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span>{s.titulo}</span>
                    <Badge variant="outline">{s.estado}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{formatData(s.data)}{s.hora ? ` · ${s.hora}` : ""}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="space-y-3 p-4">
          <h3 className="text-sm font-semibold">Registar interação</h3>
          <Textarea
            rows={3}
            value={interacao}
            onChange={(e) => setInteracao(e.target.value)}
            placeholder="Ex: Cliente pediu para rever a proposta amanhã."
          />
          <div className="flex justify-end">
            <Button onClick={registarInteracao} disabled={!interacao.trim() || busy}>
              <MessageSquarePlus className="mr-1 h-4 w-4" /> Registar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar esta oportunidade?</DialogTitle>
            <DialogDescription>
              Apaga também {comsOp.length} movimento{comsOp.length === 1 ? "" : "s"} financeiro
              {comsOp.length === 1 ? "" : "s"} e as ligações de ficheiros associadas. Não há forma de recuperar.
              Se só queres tirar isto da frente, usa Arquivar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={busy}>Cancelar</Button>
            <Button variant="destructive" onClick={apagar} disabled={busy}>Eliminar tudo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}