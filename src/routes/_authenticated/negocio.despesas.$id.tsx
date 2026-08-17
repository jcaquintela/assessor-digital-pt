import { appTitle } from "@/lib/brand";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type Despesa } from "@/lib/demo-data";
import { ChevronLeft, Save, Trash2, Archive, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { TierGate } from "@/components/tier-gate";

const CATEGORIAS: Despesa["categoria"][] = ["Deslocação", "Marketing", "Escritório", "Formação", "Outros"];

export const Route = createFileRoute("/_authenticated/negocio/despesas/$id")({
  head: () => ({
    meta: [
      { title: appTitle("Ficha de despesa") },
      { name: "description", content: "Editar ou eliminar despesa." },
      { property: "og:title", content: appTitle("Ficha de despesa") },
      { property: "og:description", content: "Editar despesa." },
    ],
  }),
  component: () => (
    <TierGate min="pro" title="Despesas">
      <DespesaFicha />
    </TierGate>
  ),
});

function DespesaFicha() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const { despesasTodas, atualizarMovimento, arquivarMovimento, desarquivarMovimento, apagarMovimentoDefinitivo } = useStore();
  const d = useMemo(() => despesasTodas.find((x) => x.id === id), [despesasTodas, id]);

  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState<Despesa["categoria"]>("Outros");
  const [valor, setValor] = useState("");
  const [data, setData] = useState("");

  useEffect(() => {
    if (!d) return;
    setDescricao(d.descricao); setCategoria(d.categoria); setValor(String(d.valor)); setData(d.data);
  }, [d]);

  if (!d) {
    return (<AppShell><PageHeader title="Despesa não encontrada" /><Link to="/negocio/despesas" className="text-sm text-primary">← Voltar</Link></AppShell>);
  }

  async function guardar() {
    try {
      await atualizarMovimento(id, {
        description: descricao,
        category: categoria,
        amount: Number(String(valor).replace(",", ".")),
        movement_date: data,
      });
      toast.success("Guardado");
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }
  async function repor() {
    try { await desarquivarMovimento(id); toast.success("Registo reposto."); }
    catch (e) { toast.error((e as Error).message); }
  }

  async function apagarDefinitivo() {
    if (!confirm("Apagar definitivamente? Isto não tem volta.")) return;
    try { await apagarMovimentoDefinitivo(id); toast.success("Registo apagado definitivamente."); nav({ to: "/negocio/despesas" }); }
    catch (e) { toast.error((e as Error).message); }
  }

  async function apagar() {
    if (!confirm("Arquivar esta despesa? Sai das listas e podes repor aqui.")) return;
    try {
      await arquivarMovimento(id);
      toast.success("Eliminada");
      nav({ to: "/negocio/despesas" });
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  return (
    <AppShell>
      <Link to="/negocio/despesas" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="h-4 w-4" />Despesas</Link>
      <PageHeader title={descricao || "Despesa"} />
      <Card><CardContent className="p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div><Label>Descrição</Label><Input value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
          <div><Label>Categoria</Label>
            <Select value={categoria} onValueChange={(v) => setCategoria(v as Despesa["categoria"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Valor (€)</Label><Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></div>
          <div><Label>Data</Label><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
        </div>
        <div className="flex justify-between">
          {d.arquivadoEm ? (
            <>
              <Button variant="ghost" onClick={repor}><RotateCcw className="mr-1 h-4 w-4" />Repor</Button>
              <Button variant="ghost" className="text-destructive" onClick={apagarDefinitivo}><Trash2 className="mr-1 h-4 w-4" />Apagar definitivamente</Button>
            </>
          ) : (
            <Button variant="ghost" onClick={apagar}><Archive className="mr-1 h-4 w-4" />Arquivar</Button>
          )}
          <Button onClick={guardar}><Save className="mr-1 h-4 w-4" />Guardar</Button>
        </div>
      </CardContent></Card>
    </AppShell>
  );
}