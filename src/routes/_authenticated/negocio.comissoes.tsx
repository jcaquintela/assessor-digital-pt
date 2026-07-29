import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatData, formatEUR, type Comissao } from "@/lib/demo-data";
import { Plus, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { TierGate } from "@/components/tier-gate";

const ESTADOS: Comissao["estado"][] = ["Prevista", "Faturada", "Recebida"];

export const Route = createFileRoute("/_authenticated/negocio/comissoes")({
  head: () => ({
    meta: [
      { title: "Comissões — Assessor do Consultor" },
      { name: "description", content: "Registo e gestão de comissões previstas, faturadas e recebidas." },
      { property: "og:title", content: "Comissões — Assessor do Consultor" },
      { property: "og:description", content: "CRUD de comissões por oportunidade." },
    ],
  }),
  component: () => (
    <TierGate min="pro" title="Comissões">
      <ComissoesPage />
    </TierGate>
  ),
});

function ComissoesPage() {
  const { comissoes, oportunidades, pessoas, addComissaoReturning } = useStore();
  const [open, setOpen] = useState(false);
  const [valor, setValor] = useState("");
  const [estado, setEstado] = useState<Comissao["estado"]>("Prevista");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [oportunidadeId, setOportunidadeId] = useState<string>("");
  const [descricao, setDescricao] = useState("");
  const [saving, setSaving] = useState(false);

  const total = comissoes.reduce((s, c) => s + c.valor, 0);

  function nomeOportunidade(id?: string) {
    if (!id) return "—";
    const o = oportunidades.find((x) => x.id === id);
    if (!o) return "—";
    const p = pessoas.find((x) => x.id === o.pessoaId);
    return `${o.tipo} · ${p?.nome ?? "Sem pessoa"}`;
  }

  async function submit() {
    if (!valor) return;
    setSaving(true);
    try {
      await addComissaoReturning({ oportunidadeId, valor: Number(valor.replace(",", ".")), data, estado, descricao: descricao || undefined });
      toast.success("Comissão registada");
      setValor(""); setDescricao(""); setOportunidadeId(""); setEstado("Prevista"); setOpen(false);
    } catch (e: any) { toast.error(e?.message ?? "Erro ao registar"); }
    finally { setSaving(false); }
  }

  return (
    <AppShell>
      <PageHeader title="Comissões" subtitle={`${comissoes.length} registos · Total ${formatEUR(total)}`} />
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setOpen((o) => !o)}><Plus className="mr-1 h-4 w-4" />Nova comissão</Button>
      </div>
      {open && (
        <Card className="mb-4"><CardContent className="p-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div><Label>Valor (€)</Label><Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" /></div>
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
                  {oportunidades.map((o) => <SelectItem key={o.id} value={o.id}>{nomeOportunidade(o.id)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2"><Label>Descrição (opcional)</Label><Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Comissão CPCV" /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={saving}>Guardar</Button>
          </div>
        </CardContent></Card>
      )}
      <div className="space-y-2">
        {comissoes.length === 0 && <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Sem comissões registadas.</div>}
        {comissoes.map((c) => (
          <Link key={c.id} to="/negocio/comissoes/$id" params={{ id: c.id }} className="flex items-center justify-between rounded-lg border border-border bg-card p-3 text-sm hover:border-primary/40">
            <div className="min-w-0">
              <div className="truncate font-medium">{nomeOportunidade(c.oportunidadeId)}</div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{formatData(c.data)}</span>
                <Badge variant="secondary" className="text-[10px]">{c.estado}</Badge>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="font-medium">{formatEUR(c.valor)}</div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}