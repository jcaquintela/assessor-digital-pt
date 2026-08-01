import { createFileRoute, Link } from "@tanstack/react-router";
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
import { Plus, AlertTriangle, Camera, ChevronRight, Archive } from "lucide-react";
import { formatData, formatEUR } from "@/lib/demo-data";
import { useStore } from "@/lib/store";
import { createDeal, listDeals, type DealListItem } from "@/lib/deals/deals.functions";
import { DEAL_KINDS, KIND_LABEL, STAGE_GROUPS, STAGE_LABEL, groupOfStage } from "@/lib/deals/stages";

export const Route = createFileRoute("/_authenticated/negocios/")({
  head: () => ({
    meta: [
      { title: "Negócios — Assessor do Consultor" },
      { name: "description", content: "Quadro de negócios do consultor: fase, pessoa, imóveis e próxima ação." },
      { property: "og:title", content: "Negócios — Assessor do Consultor" },
      { property: "og:description", content: "Cada negócio com a sua história, do primeiro contacto à escritura." },
    ],
  }),
  component: NegociosPage,
});

function NegociosPage() {
  const listFn = useServerFn(listDeals);
  const createFn = useServerFn(createDeal);
  const qc = useQueryClient();
  const { pessoas, imoveis } = useStore();

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
        value: Number(form.value) || 0,
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
  const visiveis = useMemo(
    () => all.filter((d) => (mostrarArquivados ? !!d.archivedAt : !d.archivedAt)),
    [all, mostrarArquivados],
  );
  const emRisco = visiveis.filter((d) => d.alert?.level === "risco");
  const valorAtivo = visiveis.reduce((s, d) => s + d.value, 0);

  return (
    <AppShell>
      <PageHeader
        title="Negócios"
        subtitle={`${visiveis.length} ${mostrarArquivados ? "arquivado(s)" : "em curso"} · ${formatEUR(valorAtivo)} em jogo`}
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

      {deals.isLoading && <p className="text-sm text-muted-foreground">A carregar negócios…</p>}
      {!deals.isLoading && visiveis.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {mostrarArquivados ? "Sem negócios arquivados." : "Ainda não há negócios. Cria o primeiro ou fala com o Assessor."}
        </p>
      )}

      {/* Mobile: fases empilhadas (lista agrupada) — sem scroll horizontal.
          Desktop: quadro em colunas. */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {STAGE_GROUPS.map((g) => {
          const items = visiveis.filter((d) => groupOfStage(d.stage) === g.key);
          return (
            <section key={g.key} className={cn("min-w-0", items.length === 0 && "hidden md:block")}>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold">{g.label}</h2>
                <span className="text-xs text-muted-foreground">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
                {items.map((d) => <DealCard key={d.id} deal={d} />)}
              </div>
            </section>
          );
        })}
      </div>
    </AppShell>
  );
}

function DealCard({ deal }: { deal: DealListItem }) {
  return (
    <Link to="/oportunidades/$id" params={{ id: deal.id }} className="block">
      <Card className="transition-colors hover:border-primary/40">
        <CardContent className="space-y-2 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{deal.title}</div>
              <div className="truncate text-xs text-muted-foreground">
                {[KIND_LABEL[deal.kind], deal.personName, deal.properties[0]?.title].filter(Boolean).join(" · ")}
              </div>
            </div>
            <Badge variant="outline" className="shrink-0">{STAGE_LABEL[deal.stage]}</Badge>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">{formatEUR(deal.value)}</span>
            {deal.commission.previsto > 0 && (
              <span className="text-muted-foreground">Com. {formatEUR(deal.commission.previsto)}</span>
            )}
          </div>
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
        </CardContent>
      </Card>
    </Link>
  );
}
