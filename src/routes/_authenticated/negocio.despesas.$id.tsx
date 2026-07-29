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
import { ChevronLeft, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { TierGate } from "@/components/tier-gate";

const CATEGORIAS: Despesa["categoria"][] = ["Deslocação", "Marketing", "Escritório", "Formação", "Outros"];

export const Route = createFileRoute("/_authenticated/negocio/despesas/$id")({
  head: () => ({
    meta: [
      { title: "Ficha de despesa — Assessor do Consultor" },
      { name: "description", content: "Editar ou eliminar despesa." },
      { property: "og:title", content: "Ficha de despesa — Assessor do Consultor" },
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
  const { despesas, atualizarMovimento, eliminarMovimento } = useStore();
  const d = useMemo(() => despesas.find((x) => x.id === id), [despesas, id]);

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
  async function apagar() {
    if (!confirm("Eliminar esta despesa?")) return;
    try {
      await eliminarMovimento(id);
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
          <Button variant="ghost" className="text-destructive" onClick={apagar}><Trash2 className="mr-1 h-4 w-4" />Eliminar</Button>
          <Button onClick={guardar}><Save className="mr-1 h-4 w-4" />Guardar</Button>
        </div>
      </CardContent></Card>
    </AppShell>
  );
}