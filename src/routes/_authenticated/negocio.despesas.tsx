import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatData, formatEUR, type Despesa } from "@/lib/demo-data";
import { Plus, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { TierGate } from "@/components/tier-gate";

const CATEGORIAS: Despesa["categoria"][] = ["Deslocação", "Marketing", "Escritório", "Formação", "Outros"];

export const Route = createFileRoute("/_authenticated/negocio/despesas")({
  head: () => ({
    meta: [
      { title: "Despesas — Assessor do Consultor" },
      { name: "description", content: "Registo e gestão de despesas do consultor." },
      { property: "og:title", content: "Despesas — Assessor do Consultor" },
      { property: "og:description", content: "CRUD de despesas com categorias e valores." },
    ],
  }),
  component: () => (
    <TierGate min="pro" title="Despesas">
      <DespesasPage />
    </TierGate>
  ),
});

function DespesasPage() {
  const { despesas, addDespesa } = useStore();
  const [open, setOpen] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState<Despesa["categoria"]>("Outros");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const total = despesas.reduce((s, d) => s + d.valor, 0);

  async function submit() {
    if (!descricao.trim() || !valor) return;
    setSaving(true);
    try {
      await addDespesa({ descricao: descricao.trim(), categoria, valor: Number(valor.replace(",", ".")), data });
      toast.success("Despesa registada");
      setDescricao(""); setValor(""); setCategoria("Outros"); setOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao registar");
    } finally { setSaving(false); }
  }

  return (
    <AppShell>
      <PageHeader title="Despesas" subtitle={`${despesas.length} registos · Total ${formatEUR(total)}`} />
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setOpen((o) => !o)}><Plus className="mr-1 h-4 w-4" />Nova despesa</Button>
      </div>
      {open && (
        <Card className="mb-4"><CardContent className="p-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div><Label>Descrição</Label><Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Combustível, anúncios, ..." /></div>
            <div><Label>Categoria</Label>
              <Select value={categoria} onValueChange={(v) => setCategoria(v as Despesa["categoria"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Valor (€)</Label><Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" /></div>
            <div><Label>Data</Label><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={saving}>Guardar</Button>
          </div>
        </CardContent></Card>
      )}
      <div className="space-y-2">
        {despesas.length === 0 && <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Sem despesas registadas.</div>}
        {despesas.map((d) => (
          <Link key={d.id} to="/negocio/despesas/$id" params={{ id: d.id }} className="flex items-center justify-between rounded-lg border border-border bg-card p-3 text-sm hover:border-primary/40">
            <div className="min-w-0">
              <div className="truncate font-medium">{d.descricao}</div>
              <div className="text-xs text-muted-foreground">{d.categoria} · {formatData(d.data)}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="font-medium">{formatEUR(d.valor)}</div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}