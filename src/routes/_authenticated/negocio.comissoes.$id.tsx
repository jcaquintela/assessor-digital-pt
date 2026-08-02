import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type Comissao } from "@/lib/demo-data";
import { ChevronLeft, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { TierGate } from "@/components/tier-gate";

const ESTADOS: Comissao["estado"][] = ["Prevista", "Faturada", "Recebida"];

export const Route = createFileRoute("/_authenticated/negocio/comissoes/$id")({
  head: () => ({
    meta: [
      { title: "Ficha de comissão — Afonso" },
      { name: "description", content: "Editar ou eliminar comissão." },
      { property: "og:title", content: "Ficha de comissão — Afonso" },
      { property: "og:description", content: "Editar comissão." },
    ],
  }),
  component: () => (
    <TierGate min="pro" title="Comissões">
      <ComissaoFicha />
    </TierGate>
  ),
});

function ComissaoFicha() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const { comissoes, oportunidades, pessoas, atualizarMovimento, eliminarMovimento } = useStore();
  const c = useMemo(() => comissoes.find((x) => x.id === id), [comissoes, id]);

  const [valor, setValor] = useState("");
  const [estado, setEstado] = useState<Comissao["estado"]>("Prevista");
  const [data, setData] = useState("");
  const [oportunidadeId, setOportunidadeId] = useState<string>("");

  useEffect(() => {
    if (!c) return;
    setValor(String(c.valor)); setEstado(c.estado); setData(c.data); setOportunidadeId(c.oportunidadeId ?? "");
  }, [c]);

  if (!c) return (<AppShell><PageHeader title="Comissão não encontrada" /><Link to="/negocio/comissoes" className="text-sm text-primary">← Voltar</Link></AppShell>);

  const opp = oportunidades.find((o) => o.id === oportunidadeId);
  const pessoa = opp ? pessoas.find((p) => p.id === opp.pessoaId) : undefined;

  async function guardar() {
    try {
      await atualizarMovimento(id, {
        amount: Number(String(valor).replace(",", ".")),
        status: estado,
        movement_date: data,
        opportunity_id: oportunidadeId || null,
      });
      toast.success("Guardado");
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }
  async function apagar() {
    if (!confirm("Eliminar esta comissão?")) return;
    try {
      await eliminarMovimento(id);
      toast.success("Eliminada");
      nav({ to: "/negocio/comissoes" });
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  return (
    <AppShell>
      <Link to="/negocio/comissoes" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="h-4 w-4" />Comissões</Link>
      <PageHeader title="Ficha de comissão" subtitle={pessoa?.nome} />
      <Card><CardContent className="p-4 space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div><Label>Valor (€)</Label><Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></div>
          <div><Label>Estado</Label>
            <Select value={estado} onValueChange={(v) => setEstado(v as Comissao["estado"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{ESTADOS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Data</Label><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
          <div><Label>Oportunidade</Label>
            <Select value={oportunidadeId || "none"} onValueChange={(v) => setOportunidadeId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem oportunidade</SelectItem>
                {oportunidades.map((o) => {
                  const p = pessoas.find((x) => x.id === o.pessoaId);
                  return <SelectItem key={o.id} value={o.id}>{o.tipo} · {p?.nome ?? "—"}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          </div>
        </div>
        {opp && (
          <Link to="/oportunidades/$id" params={{ id: opp.id }} className="text-sm text-primary hover:underline">Abrir oportunidade →</Link>
        )}
        <div className="flex justify-between">
          <Button variant="ghost" className="text-destructive" onClick={apagar}><Trash2 className="mr-1 h-4 w-4" />Eliminar</Button>
          <Button onClick={guardar}><Save className="mr-1 h-4 w-4" />Guardar</Button>
        </div>
      </CardContent></Card>
    </AppShell>
  );
}