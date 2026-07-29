import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { formatEUR } from "@/lib/demo-data";
import { Receipt, Wallet, FileText, ArrowRight } from "lucide-react";
import { TierGate } from "@/components/tier-gate";

export const Route = createFileRoute("/_authenticated/negocio")({
  head: () => ({
    meta: [
      { title: "O Meu Negócio — Assessor do Consultor" },
      { name: "description", content: "Visão geral de comissões, faturação, despesas e rentabilidade." },
      { property: "og:title", content: "O Meu Negócio — Assessor do Consultor" },
      { property: "og:description", content: "Visão geral do negócio do consultor." },
    ],
  }),
  component: () => (
    <TierGate min="pro" title="O Meu Negócio">
      <NegocioPage />
    </TierGate>
  ),
});

function NegocioPage() {
  const { comissoes, despesas } = useStore();
  const faturado = comissoes.filter((c) => c.estado !== "Prevista").reduce((s, c) => s + c.valor, 0);
  const recebido = comissoes.filter((c) => c.estado === "Recebida").reduce((s, c) => s + c.valor, 0);
  const previstas = comissoes.filter((c) => c.estado === "Prevista").reduce((s, c) => s + c.valor, 0);
  const porReceber = faturado - recebido + previstas;
  const totalDespesas = despesas.reduce((s, d) => s + d.valor, 0);
  const resultado = recebido - totalDespesas;

  return (
    <AppShell>
      <PageHeader title="O Meu Negócio" subtitle="Visão simples. Não substitui contabilidade certificada." />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Indicador label="Faturado" value={formatEUR(faturado)} />
        <Indicador label="Recebido" value={formatEUR(recebido)} />
        <Indicador label="Por receber" value={formatEUR(porReceber)} />
        <Indicador label="Despesas" value={formatEUR(totalDespesas)} />
      </div>
      <Card className="mb-6 border-primary/20 bg-primary/5">
        <CardContent className="p-5">
          <div className="text-sm text-muted-foreground">Resultado antes de impostos</div>
          <div className="mt-1 text-2xl font-semibold">{formatEUR(resultado)}</div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <HubLink to="/negocio/comissoes" icon={<Wallet className="h-5 w-5" />} title="Comissões" desc={`${comissoes.length} registos`} />
        <HubLink to="/negocio/faturacao" icon={<FileText className="h-5 w-5" />} title="Faturação" desc="Prevista, Faturada, Recebida" />
        <HubLink to="/negocio/despesas" icon={<Receipt className="h-5 w-5" />} title="Despesas" desc={`${despesas.length} registos`} />
      </div>
    </AppShell>
  );
}

function Indicador({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function HubLink({ to, icon, title, desc }: { to: string; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Link to={to} className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-primary/5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div>
          <div>
            <div className="font-medium">{title}</div>
            <div className="text-xs text-muted-foreground">{desc}</div>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}