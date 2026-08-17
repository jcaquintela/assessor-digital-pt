import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatData, formatEUR, type Comissao, type Despesa } from "@/lib/demo-data";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { TierGate } from "@/components/tier-gate";
import { GroupCardsRow } from "@/components/group-cards-row";
import { ProInsightCard } from "@/components/pro-insight-card";
import { buildGroupCards, nextSearchForGroup, resolveCardsView } from "@/lib/ui/group-cards";
import { applyProInsight, factualInsight, stalledFacts } from "@/lib/insights/factual";
import { useEffectiveTier } from "@/lib/subscription/use-effective-tier";

const ESTADOS: Comissao["estado"][] = ["Prevista", "Faturada", "Recebida"];
const CATEGORIAS: Despesa["categoria"][] = ["Deslocação", "Marketing", "Escritório", "Formação", "Outros"];

export const Route = createFileRoute("/_authenticated/negocio/faturacao")({
  validateSearch: (search: Record<string, unknown>): { grp?: string; tipo?: "despesas" } => ({
    grp: typeof search.grp === "string" && search.grp ? search.grp : undefined,
    tipo: search.tipo === "despesas" ? "despesas" : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Faturação — Afonso" },
      { name: "description", content: "Ciclo de faturação: comissões previstas, faturadas e recebidas, e despesas." },
      { property: "og:title", content: "Faturação — Afonso" },
      { property: "og:description", content: "Gestão do ciclo de faturação de comissões e despesas." },
    ],
  }),
  component: () => (
    <TierGate min="pro" title="Faturação">
      <FaturacaoPage />
    </TierGate>
  ),
});

function FaturacaoPage() {
  // Comissões e despesas vêm ambas de financial_movements (type = commission | expense).
  const { comissoes, despesas, oportunidades, pessoas, atualizarMovimento } = useStore();
  // Gate Pro explícito: a rota já é Pro, mas a análise proativa nunca deve
  // depender só do guard de rota (simulação "ver como", futuras mudanças).
  const tier = useEffectiveTier().data?.tier;
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const aba: "comissoes" | "despesas" = search.tipo === "despesas" ? "despesas" : "comissoes";
  const vista = resolveCardsView({ grp: search.grp });
  const abrirGrupo = (key: string) =>
    navigate({ search: (p: Record<string, unknown>) => ({ ...p, ...nextSearchForGroup({ grp: search.grp }, key) }) });
  const abrirAba = (t: "comissoes" | "despesas") =>
    navigate({ search: () => (t === "despesas" ? { tipo: "despesas" as const } : {}) });

  const totais = useMemo(() => ({
    Prevista: comissoes.filter((c) => c.estado === "Prevista").reduce((s, c) => s + c.valor, 0),
    Faturada: comissoes.filter((c) => c.estado === "Faturada").reduce((s, c) => s + c.valor, 0),
    Recebida: comissoes.filter((c) => c.estado === "Recebida").reduce((s, c) => s + c.valor, 0),
  }), [comissoes]);
  const totalDespesas = useMemo(() => despesas.reduce((s, d) => s + d.valor, 0), [despesas]);

  // Cartões por estado do ciclo: a mesma navegação do Drive e dos Imóveis.
  const cartoes = useMemo<ReturnType<typeof buildGroupCards<Comissao | Despesa>>>(
    () =>
      aba === "comissoes"
        ? buildGroupCards<Comissao | Despesa>(ESTADOS.map((e) => ({ key: e, label: e, items: comissoes.filter((c) => c.estado === e) })))
        : buildGroupCards<Comissao | Despesa>(CATEGORIAS.map((c) => ({ key: c, label: c, items: despesas.filter((d) => d.categoria === c) }))),
    [aba, comissoes, despesas],
  );
  const lista = vista.mode === "aberto" ? comissoes.filter((c) => c.estado === vista.key) : comissoes;
  const listaDespesas = vista.mode === "aberto" ? despesas.filter((d) => d.categoria === vista.key) : despesas;

  // Análise factual: comissões que ficaram para trás no ciclo.
  const analise = useMemo(() => {
    const hoje = Date.now();
    const paradas = comissoes
      .filter((c) => c.estado !== "Recebida")
      .map((c) => ({
        id: c.id,
        label: `${formatEUR(c.valor)} · ${c.estado.toLowerCase()}`,
        days: Math.floor((hoje - new Date(c.data).getTime()) / 864e5),
      }));
    return applyProInsight(
      factualInsight(stalledFacts(paradas, 30), {
        key: "faturacao-parada",
        noun: ["comissão", "comissões"],
        movimento: "data do movimento e estado no ciclo Prevista → Faturada → Recebida",
        linkLabel: "Ver comissões →",
        to: "/negocio/comissoes",
      }),
      tier,
    );
  }, [comissoes, tier]);

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
      <PageHeader title="Faturação" subtitle="Comissões e despesas, no mesmo sítio" />
      <div className="mb-4 flex gap-2">
        <Button size="sm" variant={aba === "comissoes" ? "default" : "outline"} onClick={() => abrirAba("comissoes")}>Comissões</Button>
        <Button size="sm" variant={aba === "despesas" ? "default" : "outline"} onClick={() => abrirAba("despesas")}>Despesas</Button>
      </div>
      {aba === "comissoes" ? <ProInsightCard insight={analise} /> : null}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Prevista</div><div className="mt-1 text-lg font-semibold">{formatEUR(totais.Prevista)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Faturada</div><div className="mt-1 text-lg font-semibold">{formatEUR(totais.Faturada)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">{aba === "despesas" ? "Despesas" : "Recebida"}</div><div className="mt-1 text-lg font-semibold">{formatEUR(aba === "despesas" ? totalDespesas : totais.Recebida)}</div></CardContent></Card>
      </div>
      <GroupCardsRow cards={cartoes} openKey={vista.key} onOpen={abrirGrupo} pathname="/negocio/faturacao" />
      {vista.mode === "aberto" ? (
        <Button size="sm" variant="ghost" className="mb-2" onClick={() => abrirGrupo(vista.key!)}>
          {aba === "despesas" ? "← Ver todas as categorias" : "← Ver todos os estados"}
        </Button>
      ) : null}
      {aba === "despesas" ? (
        <div className="space-y-2">
          {listaDespesas.length === 0 && <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Sem despesas registadas.</div>}
          {listaDespesas.map((d) => (
            <Link key={d.id} to="/negocio/despesas/$id" params={{ id: d.id }} className="flex items-center justify-between rounded-lg border border-border bg-card p-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{d.descricao}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatData(d.data)}</span>
                  <Badge variant="secondary" className="text-[10px]">{d.categoria}</Badge>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="font-medium">{formatEUR(d.valor)}</div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </Link>
          ))}
        </div>
      ) : (
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
      )}
    </AppShell>
  );
}