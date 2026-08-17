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
import { ChevronLeft, Trash2, Save, Archive, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { formatData, formatEUR } from "@/lib/demo-data";
import { appTitle } from "@/lib/brand";

export const Route = createFileRoute("/_authenticated/interacoes/$id")({
  head: () => ({
    meta: [
      { title: appTitle("Ficha da interação") },
      { name: "description", content: "Conteúdo original, resumo, pessoa e oportunidade associadas." },
      { property: "og:title", content: appTitle("Ficha da interação") },
      { property: "og:description", content: "Memória cronológica do consultor." },
    ],
  }),
  component: InteracaoDetail,
});

function InteracaoDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { interacoesTodas, pessoas, oportunidades, updateInteracao, arquivarInteracao, desarquivarInteracao, apagarInteracaoDefinitivo, loading } = useStore();

  const i = useMemo(() => interacoesTodas.find((x) => x.id === id), [interacoesTodas, id]);

  const [conteudo, setConteudo] = useState(i?.conteudo ?? "");
  const [resumo, setResumo] = useState(i?.resumo ?? "");
  const [tipo, setTipo] = useState(i?.tipo ?? "");
  const [pessoaId, setPessoaId] = useState(i?.pessoaId ?? "");
  const [oportunidadeId, setOportunidadeId] = useState(i?.oportunidadeId ?? "");
  const [busy, setBusy] = useState(false);

  if (loading && !i) {
    return <AppShell><PageHeader title="A carregar…" /></AppShell>;
  }
  if (!i) {
    return (
      <AppShell>
        <PageHeader title="Interação não encontrada" />
        <Button variant="ghost" onClick={() => navigate({ to: "/interacoes" })}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Voltar
        </Button>
      </AppShell>
    );
  }

  const pessoa = pessoas.find((p) => p.id === i.pessoaId);
  const op = oportunidades.find((o) => o.id === i.oportunidadeId);

  const dirty =
    conteudo !== i.conteudo ||
    (resumo || "") !== (i.resumo || "") ||
    (tipo || "") !== (i.tipo || "") ||
    (pessoaId || "") !== (i.pessoaId || "") ||
    (oportunidadeId || "") !== (i.oportunidadeId || "");

  const guardar = async () => {
    setBusy(true);
    try {
      await updateInteracao(i.id, {
        conteudo,
        resumo: resumo || undefined,
        tipo: tipo || undefined,
        pessoaId: pessoaId || undefined,
        oportunidadeId: oportunidadeId || undefined,
      });
      toast.success("Alterações guardadas.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const repor = async () => {
    try { await desarquivarInteracao(i.id); toast.success("Interação reposta."); }
    catch (e) { toast.error((e as Error).message); }
  };

  const apagarDefinitivo = async () => {
    if (!confirm("Apagar definitivamente esta interação? Isto não tem volta.")) return;
    try { await apagarInteracaoDefinitivo(i.id); toast.success("Interação apagada definitivamente."); navigate({ to: "/interacoes" }); }
    catch (e) { toast.error((e as Error).message); }
  };

  const apagar = async () => {
    if (!confirm("Arquivar esta interação? Sai do histórico e podes repor aqui.")) return;
    try {
      await arquivarInteracao(i.id);
      toast.success("Interação apagada.");
      navigate({ to: "/interacoes" });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <AppShell>
      <div className="mb-2">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/interacoes" })}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Interações
        </Button>
      </div>
      <PageHeader
        title={pessoa ? pessoa.nome : "Interação"}
        subtitle={`${formatData(i.data)} · ${i.canal}`}
        action={
          <div className="flex gap-2">
            {i.arquivadoEm ? (
              <>
                <Button variant="ghost" onClick={repor}>
                  <RotateCcw className="mr-1 h-4 w-4" /> Repor
                </Button>
                <Button variant="ghost" className="text-destructive" onClick={apagarDefinitivo}>
                  <Trash2 className="mr-1 h-4 w-4" /> Apagar definitivamente
                </Button>
              </>
            ) : (
            <Button variant="ghost" onClick={apagar}>
              <Archive className="mr-1 h-4 w-4" /> Arquivar
            </Button>
            )}
            <Button onClick={guardar} disabled={!dirty || busy}>
              <Save className="mr-1 h-4 w-4" /> Guardar
            </Button>
          </div>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">{i.canal}</Badge>
        {i.tipo && <Badge variant="secondary">{i.tipo}</Badge>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-semibold">Conteúdo</h3>
            <div className="grid gap-2">
              <Label htmlFor="conteudo">Original</Label>
              <Textarea id="conteudo" rows={6} value={conteudo} onChange={(e) => setConteudo(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="resumo">Resumo</Label>
              <Textarea id="resumo" rows={3} value={resumo} onChange={(e) => setResumo(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tipo">Tipo</Label>
              <Input id="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="Ex: conversa, chamada, email" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-semibold">Relações</h3>
            <div className="grid gap-2">
              <Label>Pessoa</Label>
              <Select value={pessoaId || "__none"} onValueChange={(v) => setPessoaId(v === "__none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— sem pessoa —</SelectItem>
                  {pessoas.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              {pessoa && (
                <Link to="/pessoas/$id" params={{ id: pessoa.id }} className="text-xs text-primary hover:underline">Abrir ficha de {pessoa.nome}</Link>
              )}
            </div>
            <div className="grid gap-2">
              <Label>Oportunidade</Label>
              <Select value={oportunidadeId || "__none"} onValueChange={(v) => setOportunidadeId(v === "__none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— sem oportunidade —</SelectItem>
                  {oportunidades.map((o) => {
                    const pn = pessoas.find((p) => p.id === o.pessoaId)?.nome;
                    return <SelectItem key={o.id} value={o.id}>{o.tipo}{pn ? ` · ${pn}` : ""} · {formatEUR(o.valor)}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
              {op && (
                <Link to="/negocios/$id" params={{ id: op.id }} className="text-xs text-primary hover:underline">Abrir oportunidade</Link>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}