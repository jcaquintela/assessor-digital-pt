import { appTitle } from "@/lib/brand";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, AlertTriangle, Camera, ChevronRight, Archive, Signpost, Clock, XCircle, Euro } from "lucide-react";
import { formatData, formatEUR } from "@/lib/demo-data";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  createDeal, listDeals, listOrphanMovements, linkMovementToDeal, createDealFromMovement,
  setDealStage, updateDeal,
  type DealListItem,
} from "@/lib/deals/deals.functions";
import {
  DEAL_KINDS, KIND_LABEL, STAGE_GROUPS, STAGE_LABEL, groupOfStage,
  daysInStage, isDealStalled, STALLED_DAYS, type DealStage,
} from "@/lib/deals/stages";
import { GroupCardsRow } from "@/components/group-cards-row";
import { ProInsightCard } from "@/components/pro-insight-card";
import { EmptyState } from "@/components/empty-state";
import { buildGroupCards, nextSearchForGroup, resolveCardsView } from "@/lib/ui/group-cards";
import { applyProInsight, factualInsight, stalledFacts } from "@/lib/insights/factual";
import { useEffectiveTier } from "@/lib/subscription/use-effective-tier";
import { foldText } from "@/lib/search/normalize";
import { useAssessorName } from "@/lib/assessor/assessor-name";

/** Colunas do quadro: os grupos em curso + Perdido, sempre no fim. */
const BOARD_COLUMNS: { key: string; label: string; stages: DealStage[] }[] = [
  ...STAGE_GROUPS.map((g) => ({ key: g.key, label: g.label, stages: g.stages as DealStage[] })),
  { key: "perdido", label: "Perdido", stages: ["perdido"] as DealStage[] },
];

/** Cartões canónicos: o quadro + Concluído. Um negócio fechado nunca fica sem cartão. */
const CARD_COLUMNS: { key: string; label: string }[] = [
  ...BOARD_COLUMNS.map((c) => ({ key: c.key, label: c.label })),
  { key: "concluido", label: "Concluído" },
];

export const Route = createFileRoute("/_authenticated/negocios/")({
  validateSearch: (search: Record<string, unknown>): { grp?: string; q?: string } => ({
    grp: typeof search.grp === "string" && search.grp ? search.grp : undefined,
    q: typeof search.q === "string" && search.q ? search.q : undefined,
  }),
  head: () => ({
    meta: [
      { title: appTitle("Negócios") },
      { name: "description", content: "Quadro de negócios do consultor: fase, pessoa, imóveis e próxima ação." },
      { property: "og:title", content: appTitle("Negócios") },
      { property: "og:description", content: "Cada negócio com a sua história, do primeiro contacto à escritura." },
    ],
  }),
  component: NegociosPage,
});

function NegociosPage() {
  const { name: assessorName } = useAssessorName();
  const listFn = useServerFn(listDeals);
  const createFn = useServerFn(createDeal);
  const qc = useQueryClient();
  const { pessoas, imoveis } = useStore();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const tier = useEffectiveTier().data?.tier;

  const [mostrarArquivados, setMostrarArquivados] = useState(false);
  const [novo, setNovo] = useState(false);
  const [form, setForm] = useState({ title: "", kind: "venda", personId: "", propertyId: "", value: "", notes: "" });

  const deals = useQuery({ queryKey: ["deals"], queryFn: () => listFn(), retry: false });

  const criar = useMutation({
    mutationFn: () => createFn({
      data: {
        title: form.title,
        kind: form.kind,
        personId: form.personId || null,
        propertyId: form.propertyId || null,
        value: form.value.trim() ? Number(form.value) : null,
        notes: form.notes || null,
      },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      setNovo(false);
      setForm({ title: "", kind: "venda", personId: "", propertyId: "", value: "", notes: "" });
      toast.success("Negócio criado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const all = deals.data?.deals ?? [];
  // Pesquisa transversal: atravessa todas as fases, tal como no Drive.
  const termo = foldText(search.q ?? "");
  const visiveis = useMemo(
    () =>
      all
        .filter((d) => (mostrarArquivados ? !!d.archivedAt : !d.archivedAt))
        .filter((d) =>
          !termo
            ? true
            : foldText(
                [d.title, d.personName, KIND_LABEL[d.kind], ...d.properties.map((p) => p.title)]
                  .filter(Boolean)
                  .join(" "),
              ).includes(termo),
        ),
    [all, mostrarArquivados, termo],
  );
  // Concluído sai do quadro ativo e não conta como "em curso".
  const concluidos = useMemo(() => visiveis.filter((d) => d.stage === "concluido"), [visiveis]);
  const ativos = useMemo(
    () => visiveis.filter((d) => d.stage !== "concluido" && d.stage !== "perdido"),
    [visiveis],
  );
  const emRisco = ativos.filter((d) => d.alert?.level === "risco");
  const precisamAtencao = ativos.filter((d) => !!d.alert).length;

  // Cartões por fase do pipeline; o estado vive no URL para o link ser partilhável.
  const vista = resolveCardsView({ q: search.q, grp: search.grp });
  const abrirGrupo = (key: string) =>
    navigate({ search: (p: Record<string, unknown>) => ({ ...p, ...nextSearchForGroup({ grp: search.grp }, key) }) });
  const setQ = (v: string) =>
    navigate({ search: (p: Record<string, unknown>) => ({ ...p, q: v || undefined }), replace: true });
  const colunas = useMemo(
    () => (vista.mode === "aberto" ? BOARD_COLUMNS.filter((c) => c.key === vista.key) : BOARD_COLUMNS),
    [vista.mode, vista.key],
  );
  const cartoes = useMemo(
    () =>
      buildGroupCards(
        CARD_COLUMNS.map((g) => ({
          key: g.key,
          label: g.label,
          items:
            g.key === "perdido" || g.key === "concluido"
              ? visiveis.filter((d) => d.stage === g.key)
              : ativos.filter((d) => groupOfStage(d.stage) === g.key),
        })),
      ),
    [visiveis, ativos],
  );

  // Análise proativa (Pro): negócios sem qualquer movimento registado.
  const analise = useMemo(
    () =>
      applyProInsight(
        factualInsight(
          stalledFacts(
            ativos.map((d) => ({
              id: d.id,
              label: d.title,
              days: Math.floor((Date.now() - new Date(d.lastActivityAt ?? Date.now()).getTime()) / 864e5),
              since: d.lastActivityAt ?? null,
            })),
            STALLED_DAYS,
          ),
          {
            key: "negocios-parados",
            noun: ["negócio", "negócios"],
            movimento: "último evento registado no negócio (fase, nota, seguimento ou movimento)",
            linkLabel: "Ver negócios →",
            to: "/negocios",
          },
        ),
        tier,
      ),
    [ativos, tier],
  );

  const moverFn = useServerFn(setDealStage);
  const atualizarFn = useServerFn(updateDeal);
  const [aArrastar, setAArrastar] = useState<string | null>(null);
  const [colunaAlvo, setColunaAlvo] = useState<string | null>(null);

  const mover = useMutation({
    mutationFn: (v: { id: string; stage: DealStage; note?: string | null }) =>
      moverFn({ data: { id: v.id, stage: v.stage, note: v.note ?? null } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      qc.invalidateQueries({ queryKey: ["hoje"] });
      toast.success("Fase atualizada.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const definirValor = useMutation({
    mutationFn: (v: { id: string; value: number }) => atualizarFn({ data: { id: v.id, value: v.value } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["hoje"] });
      toast.success("Valor estimado guardado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function largarNaColuna(colunaKey: string) {
    const id = aArrastar;
    setAArrastar(null);
    setColunaAlvo(null);
    if (!id) return;
    const deal = all.find((d) => d.id === id);
    const coluna = BOARD_COLUMNS.find((c) => c.key === colunaKey);
    if (!deal || !coluna) return;
    if (coluna.stages.includes(deal.stage as DealStage)) return;
    mover.mutate({ id, stage: coluna.stages[0] as DealStage });
  }

  return (
    <AppShell>
      <PageHeader
        title="Negócios"
        subtitle={`${mostrarArquivados ? `${visiveis.length} arquivado(s)` : `${ativos.length} em curso${concluidos.length ? ` · ${concluidos.length} concluído${concluidos.length > 1 ? "s" : ""}` : ""}`} · ${
          precisamAtencao === 0
            ? "nenhum precisa de atenção"
            : `${precisamAtencao} precisa${precisamAtencao > 1 ? "m" : ""} de atenção`
        }`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setMostrarArquivados((v) => !v)}>
              <Archive className="mr-1 h-4 w-4" /> {mostrarArquivados ? "Ver em curso" : "Ver arquivados"}
            </Button>
            <Dialog open={novo} onOpenChange={setNovo}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-1 h-4 w-4" /> Novo negócio</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Novo negócio</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="grid gap-2">
                    <Label htmlFor="t">Título</Label>
                    <Input id="t" value={form.title} placeholder="Ex: Venda T3 Alvalade — Marta Santana"
                      onChange={(e) => setForm({ ...form, title: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="grid gap-2">
                      <Label>Tipo</Label>
                      <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {DEAL_KINDS.map((k) => <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="v">Valor (€)</Label>
                      <Input id="v" type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Pessoa</Label>
                    <Select value={form.personId || "__none"} onValueChange={(v) => setForm({ ...form, personId: v === "__none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">— sem pessoa —</SelectItem>
                        {pessoas.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Imóvel</Label>
                    <Select value={form.propertyId || "__none"} onValueChange={(v) => setForm({ ...form, propertyId: v === "__none" ? "" : v })}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">— sem imóvel —</SelectItem>
                        {imoveis.map((i) => <SelectItem key={i.id} value={i.id}>{i.titulo}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="n">Notas</Label>
                    <Textarea id="n" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setNovo(false)}>Cancelar</Button>
                  <Button onClick={() => criar.mutate()} disabled={criar.isPending || !form.title.trim()}>Criar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <Link to="/oportunidades/prospecao" className="mb-4 block">
        <Card className="border-primary/30 bg-primary/5 transition-colors hover:border-primary/50">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
              <Camera className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">Prospeção</div>
              <div className="text-xs text-muted-foreground">Placas na rua e leads antes de virarem negócio.</div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>

      {emRisco.length > 0 && !mostrarArquivados && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <div className="mb-1 flex items-center gap-2 font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" /> {emRisco.length} negócio{emRisco.length === 1 ? "" : "s"} a precisar de ti
          </div>
          <div className="text-muted-foreground">
            {emRisco.slice(0, 3).map((d) => `${d.title} (${d.alert?.label})`).join(" · ")}
          </div>
        </div>
      )}

      <ProInsightCard
        insight={analise}
        emptyHint={
          tier !== "pro" || analise
            ? undefined
            : ativos.length === 0
              ? "Não tens negócios em curso, por isso não há nada para eu analisar. Assim que abrires um, começo a seguir o ritmo dele."
              : ativos.length < 3
                ? "Ainda há poucos negócios em curso para eu tirar conclusões. Com três ou mais aviso-te dos que ficam parados."
                : "Analisei os negócios em curso e nenhum está parado tempo suficiente para eu te chamar a atenção."
        }
      />

      <div className="mb-3">
        <Input
          value={search.q ?? ""}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Procurar negócio, pessoa ou imóvel…"
          aria-label="Procurar negócios"
        />
      </div>
      {vista.mode === "pesquisa" ? (
        <p className="mb-2 text-xs text-muted-foreground">
          {visiveis.length} resultado{visiveis.length === 1 ? "" : "s"} em todas as fases.
        </p>
      ) : null}
      <GroupCardsRow cards={cartoes} openKey={vista.key} onOpen={abrirGrupo} pathname="/negocios" />
      {vista.mode === "aberto" ? (
        <Button size="sm" variant="ghost" className="mb-2" onClick={() => abrirGrupo(vista.key!)}>
          ← Ver todo o quadro
        </Button>
      ) : null}

      {!mostrarArquivados && <OrphanMovements deals={visiveis} />}

      {deals.isLoading && <p className="text-sm text-muted-foreground">A carregar negócios…</p>}
      {!deals.isLoading && visiveis.length === 0 && (
        mostrarArquivados ? (
          <EmptyState
            title="Sem negócios arquivados."
            hint="Quando arquivares um negócio, ele fica guardado aqui."
            actionLabel="Ver em curso"
            onAction={() => setMostrarArquivados(false)}
          />
        ) : search.q ? (
          <EmptyState
            title="Nenhum negócio corresponde à pesquisa."
            hint="Tenta outro nome, imóvel ou tipo de negócio."
            actionLabel="Limpar pesquisa"
            onAction={() => setQ("")}
          />
        ) : (
          <EmptyState
            title="Ainda não há negócios no quadro."
            hint={`Cria o primeiro ou conta ao ${assessorName} o que está a andar — ele trata do registo.`}
            actionLabel="Novo negócio"
            onAction={() => setNovo(true)}
          />
        )
      )}

      {/* Mobile: fases empilhadas (lista agrupada) — sem scroll horizontal.
          Desktop: quadro em colunas. */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {colunas.map((g) => {
          const items =
            g.key === "perdido"
              ? visiveis.filter((d) => d.stage === "perdido")
              : ativos.filter((d) => groupOfStage(d.stage) === g.key);
          return (
            <section
              key={g.key}
              onDragOver={(e) => {
                e.preventDefault();
                if (colunaAlvo !== g.key) setColunaAlvo(g.key);
              }}
              onDragLeave={() => setColunaAlvo((c) => (c === g.key ? null : c))}
              onDrop={() => largarNaColuna(g.key)}
              className={cn(
                "min-w-0 rounded-lg border border-transparent p-1 transition-colors",
                items.length === 0 && "hidden md:block",
                colunaAlvo === g.key && "border-primary/50 bg-primary/5",
              )}
            >
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold">{g.label}</h2>
                <span className="text-xs text-muted-foreground">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.length === 0 && (
                  <button
                    type="button"
                    onClick={() => setNovo(true)}
                    className="w-full rounded-lg border border-dashed border-border p-3 text-left text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  >
                    Nada em {g.label.toLowerCase()}. Criar negócio nesta fase →
                  </button>
                )}
                {items.map((d) => (
                  <DealCard
                    key={d.id}
                    deal={d}
                    onDragStart={() => setAArrastar(d.id)}
                    onDragEnd={() => { setAArrastar(null); setColunaAlvo(null); }}
                    onPerdido={(motivo) => mover.mutate({ id: d.id, stage: "perdido", note: motivo || null })}
                    onValor={(valor) => definirValor.mutate({ id: d.id, value: valor })}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Arrasta um cartão para outra coluna para mudar de fase. Fica tudo registado no histórico do negócio.
      </p>

      {(vista.mode !== "aberto" || vista.key === "concluido") && (
        <section className="mt-6">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">Concluídos</h2>
            <span className="text-xs text-muted-foreground">{concluidos.length}</span>
          </div>
          {concluidos.length === 0 ? (
            <p className="text-xs text-muted-foreground">Ainda não fechaste nenhum negócio.</p>
          ) : (
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
            {concluidos.map((d) => <DealCard key={d.id} deal={d} />)}
          </div>
          )}
        </section>
      )}
    </AppShell>
  );
}

function DealCard({
  deal,
  onDragStart,
  onDragEnd,
  onPerdido,
  onValor,
}: {
  deal: DealListItem;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onPerdido?: (motivo: string) => void;
  onValor?: (valor: number) => void;
}) {
  const [perder, setPerder] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [valorAberto, setValorAberto] = useState(false);
  const [valor, setValor] = useState("");

  const dias = daysInStage(deal.stageChangedAt);
  const parado = isDealStalled({
    stage: deal.stage,
    stageChangedAt: deal.stageChangedAt,
    archivedAt: deal.archivedAt,
  });
  const podeAgir = deal.stage !== "concluido" && deal.stage !== "perdido";

  return (
    <Card
      draggable={!!onDragStart && podeAgir}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "transition-colors hover:border-primary/40",
        podeAgir && onDragStart && "cursor-grab active:cursor-grabbing",
        parado && "border-amber-500/60 bg-amber-500/5",
      )}
    >
      <CardContent className="space-y-2 p-3">
        <Link to="/negocios/$id" params={{ id: deal.id }} className="block space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{deal.title}</div>
              <div className="truncate text-xs text-muted-foreground">
                {[KIND_LABEL[deal.kind], deal.personName, deal.properties[0]?.title].filter(Boolean).join(" · ")}
              </div>
            </div>
            <Badge variant="outline" className="shrink-0">{STAGE_LABEL[deal.stage]}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="font-medium">
              {deal.valueEstimate != null && deal.valueEstimate > 0
                ? formatEUR(deal.valueEstimate)
                : <span className="text-muted-foreground">Sem valor estimado</span>}
            </span>
            {dias !== null && (
              <span className={cn("inline-flex items-center gap-1", parado ? "font-medium text-amber-600" : "text-muted-foreground")}>
                <Clock className="h-3 w-3" />
                {dias === 0 ? "hoje nesta fase" : `${dias} dia${dias === 1 ? "" : "s"} nesta fase`}
              </span>
            )}
            {deal.sourceLeadId && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Signpost className="h-3 w-3" /> via prospeção
              </span>
            )}
            {deal.commission.previsto > 0 && (
              <span className="text-muted-foreground">Com. {formatEUR(deal.commission.previsto)}</span>
            )}
          </div>
          {parado && (
            <div className="text-xs font-medium text-amber-600">
              Parado há mais de {STALLED_DAYS} dias — talvez mereça um empurrão.
            </div>
          )}
          {deal.nextAction && (
            <div className="text-xs text-muted-foreground">
              Próx.: <strong className="text-foreground">{deal.nextAction.title}</strong>
              {deal.nextAction.dueAt ? ` · ${formatData(deal.nextAction.dueAt)}` : ""}
            </div>
          )}
          {deal.alert && (
            <div className={deal.alert.level === "risco" ? "text-xs font-medium text-destructive" : "text-xs text-amber-600"}>
              {deal.alert.label}
            </div>
          )}
          {!deal.personName && podeAgir && (
            <div className="text-xs text-amber-600">Sem pessoa associada</div>
          )}
        </Link>

        {podeAgir && (onPerdido || onValor) && (
          <div className="flex flex-wrap gap-1 border-t pt-2">
            {onValor && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                onClick={() => { setValor(deal.valueEstimate ? String(deal.valueEstimate) : ""); setValorAberto(true); }}>
                <Euro className="mr-1 h-3 w-3" /> Valor estimado
              </Button>
            )}
            {onPerdido && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground"
                onClick={() => setPerder(true)}>
                <XCircle className="mr-1 h-3 w-3" /> Marcar como perdido
              </Button>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={perder} onOpenChange={setPerder}>
        <DialogContent>
          <DialogHeader><DialogTitle>Marcar como perdido</DialogTitle></DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={`m-${deal.id}`}>Motivo (opcional)</Label>
            <Input id={`m-${deal.id}`} value={motivo} placeholder="Ex: foi com outra agência"
              onChange={(e) => setMotivo(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPerder(false)}>Cancelar</Button>
            <Button onClick={() => { onPerdido?.(motivo.trim()); setPerder(false); setMotivo(""); }}>
              Marcar como perdido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={valorAberto} onOpenChange={setValorAberto}>
        <DialogContent>
          <DialogHeader><DialogTitle>Valor estimado</DialogTitle></DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={`v-${deal.id}`}>Quanto vale este negócio (€)?</Label>
            <Input id={`v-${deal.id}`} type="number" value={valor} onChange={(e) => setValor(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setValorAberto(false)}>Cancelar</Button>
            <Button disabled={!valor.trim() || Number.isNaN(Number(valor))}
              onClick={() => { onValor?.(Number(valor)); setValorAberto(false); }}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/**
 * Comissões e despesas registadas sem negócio: dinheiro sem história.
 * Aqui o consultor liga a um negócio que já existe ou abre um novo.
 */
function OrphanMovements({ deals }: { deals: DealListItem[] }) {
  const listFn = useServerFn(listOrphanMovements);
  const linkFn = useServerFn(linkMovementToDeal);
  const createFromFn = useServerFn(createDealFromMovement);
  const qc = useQueryClient();
  const { pessoas } = useStore();

  const [aberto, setAberto] = useState<string | null>(null);
  const [dealId, setDealId] = useState("");
  const [titulo, setTitulo] = useState("");
  const [pessoaId, setPessoaId] = useState("");

  const q = useQuery({ queryKey: ["orphan-movements"], queryFn: () => listFn(), retry: false });
  const movements = q.data?.movements ?? [];

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["orphan-movements"] });
    qc.invalidateQueries({ queryKey: ["deals"] });
    setAberto(null);
    setDealId(""); setTitulo(""); setPessoaId("");
  };

  const ligar = useMutation({
    mutationFn: (movementId: string) => linkFn({ data: { movementId, dealId } }),
    onSuccess: () => { toast.success("Ligado ao negócio."); refrescar(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const criar = useMutation({
    mutationFn: (m: (typeof movements)[number]) => createFromFn({
      data: {
        movementId: m.id,
        title: titulo.trim() || m.description || "Novo negócio",
        kind: "venda",
        personId: pessoaId || null,
        propertyId: m.propertyId,
        value: 0,
      },
    }),
    onSuccess: () => { toast.success("Negócio criado com a comissão ligada."); refrescar(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading || movements.length === 0) return null;

  return (
    <Card className="mb-4 border-amber-500/30 bg-amber-500/5">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4" />
          {movements.length === 1
            ? "Tens 1 valor registado sem negócio"
            : `Tens ${movements.length} valores registados sem negócio`}
        </div>
        <div className="space-y-2">
          {movements.map((m) => (
            <div key={m.id} className="rounded-lg border bg-background p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {m.description || (m.type === "expense" ? "Despesa" : "Comissão")}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {[formatEUR(m.amount), m.date ? formatData(m.date) : null, m.propertyTitle]
                      .filter(Boolean).join(" · ")}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={aberto === m.id ? "secondary" : "outline"}
                  onClick={() => {
                    setAberto(aberto === m.id ? null : m.id);
                    setTitulo(m.description || "");
                  }}
                >
                  {aberto === m.id ? "Fechar" : "Ligar a um negócio"}
                </Button>
              </div>

              {aberto === m.id && (
                <div className="mt-3 space-y-3 border-t pt-3">
                  {deals.length > 0 && (
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                      <div className="grid gap-2">
                        <Label>Negócio existente</Label>
                        <Select value={dealId} onValueChange={setDealId}>
                          <SelectTrigger><SelectValue placeholder="Escolhe um negócio" /></SelectTrigger>
                          <SelectContent>
                            {deals.map((d) => <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button disabled={!dealId || ligar.isPending} onClick={() => ligar.mutate(m.id)}>
                        Ligar
                      </Button>
                    </div>
                  )}
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <div className="grid gap-2">
                      <Label>Ou abrir negócio novo</Label>
                      <Input value={titulo} placeholder="Título do negócio"
                        onChange={(e) => setTitulo(e.target.value)} />
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
                    <Button
                      variant="outline"
                      disabled={criar.isPending || (!pessoaId && !m.propertyId)}
                      onClick={() => criar.mutate(m)}
                    >
                      Criar negócio
                    </Button>
                  </div>
                  {!pessoaId && !m.propertyId && (
                    <p className="text-xs text-muted-foreground">
                      Um negócio precisa pelo menos de uma pessoa ou de um imóvel.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
