import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatData, formatEUR, type Comissao } from "@/lib/demo-data";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { TierGate } from "@/components/tier-gate";

const ESTADOS: Comissao["estado"][] = ["Prevista", "Faturada", "Recebida"];

export const Route = createFileRoute("/_authenticated/negocio/faturacao")({
  head: () => ({
    meta: [
      { title: "Faturação — Assessor do Consultor" },
      { name: "description", content: "Ciclo de faturação: prevista, faturada e recebida." },
      { property: "og:title", content: "Faturação — Assessor do Consultor" },
      { property: "og:description", content: "Gestão do ciclo de faturação de comissões." },
    ],
  }),
  component: () => (
    <TierGate min="pro" title="Faturação">
      <FaturacaoPage />
    </TierGate>
  ),
});

function FaturacaoPage() {
  const { comissoes, oportunidades, pessoas, atualizarMovimento } = useStore();
  const [filtro, setFiltro] = useState<"Todas" | Comissao["estado"]>("Todas");

  const totais = useMemo(() => ({
    Prevista: comissoes.filter((c) => c.estado === "Prevista").reduce((s, c) => s + c.valor, 0),
    Faturada: comissoes.filter((c) => c.estado === "Faturada").reduce((s, c) => s + c.valor, 0),
    Recebida: comissoes.filter((c) => c.estado === "Recebida").reduce((s, c) => s + c.valor, 0),
  }), [comissoes]);

  const lista = comissoes.filter((c) => filtro === "Todas" || c.estado === filtro);

  function nomeOportunidade(id?: string) {
    if (!id) return "—";
    const o = oportunidades.find((x) => x.id === id);
    if (!o) return "—";
    const p = pessoas.find((x) => x.id === o.pessoaId);
    return `${o.tipo} · ${p?.nome ?? "Sem pessoa"}`;
  }

  async function avancarEstado(c: Comissao) {
    const idx = ESTADOS.indexOf(c.estado);
    const next = ESTADOS[Math.min(idx + 1, ESTADOS.length - 1)];
    if (next === c.estado) return;
    try {
      await atualizarMovimento(c.id, { status: next });
      toast.success(`Marcada como ${next}`);
    } catch (e: any) { toast.error(e?.message ?? "Erro"); }
  }

  return (
    <AppShell>
      <PageHeader title="Faturação" subtitle="Ciclo Prevista → Faturada → Recebida" />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Prevista</div><div className="mt-1 text-lg font-semibold">{formatEUR(totais.Prevista)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Faturada</div><div className="mt-1 text-lg font-semibold">{formatEUR(totais.Faturada)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Recebida</div><div className="mt-1 text-lg font-semibold">{formatEUR(totais.Recebida)}</div></CardContent></Card>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {(["Todas", ...ESTADOS] as const).map((f) => (
          <Button key={f} size="sm" variant={filtro === f ? "default" : "outline"} onClick={() => setFiltro(f)}>{f}</Button>
        ))}
      </div>
      <div className="space-y-2">
        {lista.length === 0 && <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Sem registos.</div>}
        {lista.map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-3 text-sm">
            <Link to="/negocio/comissoes/$id" params={{ id: c.id }} className="min-w-0 flex-1">
              <div className="truncate font-medium">{nomeOportunidade(c.oportunidadeId)}</div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{formatData(c.data)}</span>
                <Badge variant="secondary" className="text-[10px]">{c.estado}</Badge>
              </div>
            </Link>
            <div className="flex items-center gap-2">
              <div className="font-medium">{formatEUR(c.valor)}</div>
              {c.estado !== "Recebida" && (
                <Button size="sm" variant="outline" onClick={() => avancarEstado(c)}>
                  {c.estado === "Prevista" ? "Faturar" : "Receber"}
                </Button>
              )}
              <Link to="/negocio/comissoes/$id" params={{ id: c.id }}><ChevronRight className="h-4 w-4 text-muted-foreground" /></Link>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}