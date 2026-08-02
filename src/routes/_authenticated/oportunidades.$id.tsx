// Ficha do Negócio: a história completa numa página — quem, que imóveis,
// em que fase, o que já aconteceu e o que vem a seguir.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ChevronLeft, Save, Archive, Trash2, MessageSquarePlus, AlertTriangle, Plus, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/store";
import { formatData, formatDataHora, formatEUR } from "@/lib/demo-data";
import {
  addDealNote, archiveDeal, getDeal, linkDealProperty, setDealStage,
  unlinkDealProperty, updateDeal,
} from "@/lib/deals/deals.functions";
import {
  DEAL_KINDS, KIND_LABEL, PROPERTY_ROLE_LABEL, STAGE_LABEL, stageIndex,
} from "@/lib/deals/stages";
import { StagePath } from "@/components/negocios/stage-path";

export const Route = createFileRoute("/_authenticated/oportunidades/$id")({
  // Deep link: /oportunidades/<id>?destaque=seguimento:<uuid>
  // Tipos: seguimento | imovel | movimento | pessoa | documento | historico
  validateSearch: (search: Record<string, unknown>): { destaque?: string } => ({
    destaque: typeof search.destaque === "string" ? search.destaque : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Negócio — Assessor do Consultor" },
      { name: "description", content: "Pessoa, imóveis, fase, histórico, seguimentos e comissões de um negócio." },
      { property: "og:title", content: "Negócio — Assessor do Consultor" },
      { property: "og:description", content: "A história completa do negócio numa página." },
    ],
  }),
  component: DealDetail,
});

// Id DOM estável para cada cartão da ficha — usado pelos deep links.
function cardId(tipo: string, id: string) {
  return `deal-card-${tipo}-${id}`;
}
const RING = "ring-2 ring-primary/60 ring-offset-2 ring-offset-background";

function DealDetail() {
  const { id } = Route.useParams();
  const { destaque } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { pessoas, imoveis, deleteOportunidade } = useStore();

  const getFn = useServerFn(getDeal);
  const updateFn = useServerFn(updateDeal);
  const stageFn = useServerFn(setDealStage);
  const noteFn = useServerFn(addDealNote);
  const archiveFn = useServerFn(archiveDeal);
  const linkFn = useServerFn(linkDealProperty);
  const unlinkFn = useServerFn(unlinkDealProperty);

  const deal = useQuery({ queryKey: ["deal", id], queryFn: () => getFn({ data: { id } }), retry: false });
  const d = deal.data ?? null;

  const [titulo, setTitulo] = useState("");
  const [kind, setKind] = useState("venda");
  const [valor, setValor] = useState("0");
  const [prazo, setPrazo] = useState("");
  const [pessoaId, setPessoaId] = useState("");
  const [notas, setNotas] = useState("");
  const [nota, setNota] = useState("");
  const [novoImovel, setNovoImovel] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);
  const [destacado, setDestacado] = useState(false);
  const [alvo, setAlvo] = useState<string | null>(null);

  // Ao abrir a ficha (badge "Negócio: X", "Abrir negócio", cartão do quadro),
  // garantimos que o consultor cai no topo da ficha certa — sobretudo em mobile,
  // onde a navegação pode manter o scroll da página anterior.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (destaque) return; // o destaque do cartão trata do scroll
    window.requestAnimationFrame(() => {
      const el = headerRef.current;
      if (el) el.scrollIntoView({ block: "start", behavior: "auto" });
      else window.scrollTo({ top: 0, behavior: "auto" });
    });
    setDestacado(true);
    const t = window.setTimeout(() => setDestacado(false), 1600);
    return () => window.clearTimeout(t);
  }, [id, destaque]);

  // Deep link para um cartão concreto: espera os dados, faz scroll até ele e
  // destaca-o durante uns segundos.
  useEffect(() => {
    if (typeof window === "undefined" || !destaque || !d) return;
    const [tipo, alvoId] = destaque.split(":");
    if (!tipo || !alvoId) return;
    const domId = cardId(tipo, alvoId);
    setAlvo(domId);
    const raf = window.requestAnimationFrame(() => {
      const el = document.getElementById(domId);
      if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
      else window.scrollTo({ top: 0, behavior: "auto" });
    });
    const t = window.setTimeout(() => setAlvo(null), 3000);
    return () => { window.cancelAnimationFrame(raf); window.clearTimeout(t); };
  }, [destaque, d?.id]);

  useEffect(() => {
    if (!d) return;
    setTitulo(d.rawTitle || d.title);
    setKind(d.kind);
    setValor(String(d.value ?? 0));
    setPrazo((d.deadline ?? "").slice(0, 10));
    setPessoaId(d.person?.id ?? "");
    setNotas(d.notes ?? "");
  }, [d?.id]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["deal", id] });
    qc.invalidateQueries({ queryKey: ["deals"] });
    qc.invalidateQueries({ queryKey: ["opportunities"] });
  };

  const guardar = useMutation({
    mutationFn: () => updateFn({
      data: {
        id, title: titulo, kind, value: Number(valor) || 0,
        notes: notas, personId: pessoaId || null, deadline: prazo || null,
      },
    }),
    onSuccess: () => { refresh(); toast.success("Alterações guardadas."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const mudarFase = useMutation({
    mutationFn: (stage: string) => stageFn({ data: { id, stage } }),
    onSuccess: () => { refresh(); toast.success("Fase atualizada."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const registarNota = useMutation({
    mutationFn: () => noteFn({ data: { id, note: nota } }),
    onSuccess: () => { setNota(""); refresh(); toast.success("Registado no histórico."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const arquivar = useMutation({
    mutationFn: (archived: boolean) => archiveFn({ data: { id, archived } }),
    onSuccess: () => { refresh(); toast.success("Feito."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const ligarImovel = useMutation({
    mutationFn: (propertyId: string) => linkFn({ data: { id, propertyId } }),
    onSuccess: () => { setNovoImovel(""); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const desligarImovel = useMutation({
    mutationFn: (propertyId: string) => unlinkFn({ data: { id, propertyId } }),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  });

  if (deal.isLoading) return <AppShell><PageHeader title="A carregar…" /></AppShell>;

  if (!d) {
    return (
      <AppShell>
        <PageHeader title="Negócio não encontrado" subtitle="Pode ter sido apagado." />
        <Button variant="ghost" onClick={() => navigate({ to: "/negocios" })}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Voltar
        </Button>
      </AppShell>
    );
  }

  const apagar = async () => {
    try {
      await supabase.from("financial_movements").delete().eq("opportunity_id", d.id);
      await supabase.from("file_links").delete().eq("entity_type", "opportunity").eq("entity_id", d.id);
      await deleteOportunidade(d.id);
      toast.success("Negócio e registos ligados apagados.");
      navigate({ to: "/negocios" });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setConfirmDelete(false);
    }
  };

  const comissaoPrevista = d.movements.filter((m) => m.type === "commission").reduce((s, m) => s + m.amount, 0);
  const comissaoRecebida = d.movements
    .filter((m) => m.type === "commission" && String(m.status ?? "").toLowerCase().startsWith("receb"))
    .reduce((s, m) => s + m.amount, 0);
  const pendentes = d.followUps.filter((f) => !String(f.status ?? "").toLowerCase().startsWith("conclu"));
  const propIds = new Set(d.properties.map((p) => p.id));
  const atual = stageIndex(d.stage);

  return (
    <AppShell>
      <div className="mb-2">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/negocios" })}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Negócios
        </Button>
      </div>

      <div
        ref={headerRef}
        className={`scroll-mt-20 rounded-xl transition-shadow duration-500 ${
          destacado ? "ring-2 ring-primary/50 ring-offset-2 ring-offset-background" : ""
        }`}
      >
        <PageHeader
          title={d.title}
        subtitle={[KIND_LABEL[d.kind], d.person?.name, d.properties[0]?.title].filter(Boolean).join(" · ")}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => arquivar.mutate(!d.archivedAt)}>
              <Archive className="mr-1 h-4 w-4" /> {d.archivedAt ? "Reabrir" : "Arquivar"}
            </Button>
            <Button variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="mr-1 h-4 w-4" /> Eliminar
            </Button>
            <Button onClick={() => guardar.mutate()} disabled={guardar.isPending}>
              <Save className="mr-1 h-4 w-4" /> Guardar
            </Button>
          </div>
          }
        />
      </div>

      {d.alert && (
        <div className={`mb-4 flex items-center gap-2 rounded-lg border p-3 text-sm ${
          d.alert.level === "risco"
            ? "border-destructive/30 bg-destructive/5 text-destructive"
            : "border-amber-500/30 bg-amber-500/5 text-amber-700"
        }`}>
          <AlertTriangle className="h-4 w-4" /> {d.alert.label}
        </div>
      )}

      {/* Linha do tempo das fases */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Fase</h3>
          <StagePath stage={d.stage} onChange={(s) => mudarFase.mutate(s)} disabled={mudarFase.isPending} />
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>Valor: <strong className="text-foreground">{formatEUR(d.value)}</strong></span>
            <span>Comissão prevista: <strong className="text-foreground">{formatEUR(comissaoPrevista)}</strong></span>
            <span>Recebida: <strong className="text-foreground">{formatEUR(comissaoRecebida)}</strong></span>
            {d.stageChangedAt && <span>Nesta fase desde {formatData(d.stageChangedAt)}</span>}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-3 p-4">
            <h3 className="text-sm font-semibold">Dados</h3>
            <div className="grid gap-2">
              <Label htmlFor="titulo">Título</Label>
              <Input id="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label>Tipo</Label>
                <Select value={kind} onValueChange={setKind}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEAL_KINDS.map((k) => <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="valor">Valor (€)</Label>
                <Input id="valor" type="number" value={valor} onChange={(e) => setValor(e.target.value)} />
              </div>
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
            <div className="grid gap-2">
              <Label htmlFor="prazo">Prazo importante</Label>
              <Input id="prazo" type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notas">Notas</Label>
              <Textarea id="notas" rows={4} value={notas} onChange={(e) => setNotas(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <h3 className="mb-3 text-sm font-semibold">Imóveis ({d.properties.length})</h3>
              <div className="space-y-2">
                {d.properties.length === 0 && <p className="text-sm text-muted-foreground">Sem imóveis ligados.</p>}
                {d.properties.map((p) => (
                  <div
                    key={p.id}
                    id={cardId("imovel", p.id)}
                    className={`flex scroll-mt-24 items-center gap-2 rounded-lg border border-border p-3 text-sm transition-shadow ${
                      alvo === cardId("imovel", p.id) ? RING : ""
                    }`}
                  >
                    <Link to="/imoveis/$id" params={{ id: p.id }} className="min-w-0 flex-1 hover:underline">
                      <div className="truncate font-medium">{p.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {[p.location, formatEUR(p.price), PROPERTY_ROLE_LABEL[p.role] ?? p.role].filter(Boolean).join(" · ")}
                      </div>
                    </Link>
                    <button
                      type="button"
                      aria-label={`Desligar ${p.title}`}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => desligarImovel.mutate(p.id)}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <Select value={novoImovel} onValueChange={setNovoImovel}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Ligar imóvel…" /></SelectTrigger>
                  <SelectContent>
                    {imoveis.filter((i) => !propIds.has(i.id)).map((i) => (
                      <SelectItem key={i.id} value={i.id}>{i.titulo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" disabled={!novoImovel} onClick={() => ligarImovel.mutate(novoImovel)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <h3 className="mb-3 text-sm font-semibold">Pessoa</h3>
              {d.person ? (
                <Link
                  to="/pessoas/$id"
                  params={{ id: d.person.id }}
                  id={cardId("pessoa", d.person.id)}
                  className={`block scroll-mt-24 rounded-lg border border-border p-3 text-sm transition-shadow hover:border-primary/40 ${
                    alvo === cardId("pessoa", d.person.id) ? RING : ""
                  }`}
                >
                  <div className="font-medium">{d.person.name}</div>
                  <div className="text-xs text-muted-foreground">{[d.person.phone, d.person.email].filter(Boolean).join(" · ") || "—"}</div>
                </Link>
              ) : <p className="text-sm text-muted-foreground">Sem pessoa associada.</p>}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 text-sm font-semibold">O que vem a seguir ({pendentes.length})</h3>
            {pendentes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada agendado. Combina o próximo passo.</p>
            ) : (
              <div className="space-y-2">
                {pendentes.map((f) => (
                  <Link
                    key={f.id}
                    to="/seguimentos/$id"
                    params={{ id: f.id }}
                    id={cardId("seguimento", f.id)}
                    className={`block scroll-mt-24 rounded-lg border border-border p-3 text-sm transition-shadow hover:border-primary/40 ${
                      alvo === cardId("seguimento", f.id) ? RING : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate">{f.title}</span>
                      <Badge variant="outline" className="shrink-0">{f.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">{formatDataHora(f.dueAt)}</div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Comissões e despesas ({d.movements.length})</h3>
            {d.movements.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem movimentos ligados.</p>
            ) : (
              <div className="space-y-2">
                {d.movements.map((m) => (
                  <div
                    key={m.id}
                    id={cardId("movimento", m.id)}
                    className={`scroll-mt-24 rounded-lg border border-border p-3 text-sm transition-shadow ${
                      alvo === cardId("movimento", m.id) ? RING : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate">{m.description}</span>
                      <span className={m.type === "expense" ? "shrink-0 text-destructive" : "shrink-0"}>
                        {m.type === "expense" ? "−" : "+"}{formatEUR(m.amount)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">{formatData(m.date)} · {m.status}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardContent className="space-y-3 p-4">
          <h3 className="text-sm font-semibold">Histórico</h3>
          <Textarea
            rows={3}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ex: Proprietário aceitou baixar para 320.000 €."
          />
          <div className="flex justify-end">
            <Button onClick={() => registarNota.mutate()} disabled={!nota.trim() || registarNota.isPending}>
              <MessageSquarePlus className="mr-1 h-4 w-4" /> Registar
            </Button>
          </div>

          <div className="space-y-2">
            {d.events.length === 0 && d.interactions.length === 0 && (
              <p className="text-sm text-muted-foreground">Ainda não há histórico neste negócio.</p>
            )}
            {d.events.map((e) => (
              <div key={e.id} className="rounded-lg border border-border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0">{e.summary}</span>
                  <Badge variant="secondary" className="shrink-0">{e.kind}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDataHora(e.occurredAt)}{e.source ? ` · ${e.source}` : ""}
                </div>
              </div>
            ))}
            {d.interactions.map((i) => (
              <div key={i.id} className="rounded-lg border border-border p-3 text-sm">
                <div>{i.content}</div>
                <div className="text-xs text-muted-foreground">
                  {formatDataHora(i.occurredAt)}{i.channel ? ` · ${i.channel}` : ""}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {d.files.length > 0 && (
        <Card className="mt-4">
          <CardContent className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Documentos ({d.files.length})</h3>
            <div className="space-y-2">
              {d.files.map((f) => (
                <Link
                  key={f.id}
                  to="/drive/$id"
                  params={{ id: f.id }}
                  id={cardId("documento", f.id)}
                  className={`block scroll-mt-24 rounded-lg border border-border p-3 text-sm transition-shadow hover:border-primary/40 ${
                    alvo === cardId("documento", f.id) ? RING : ""
                  }`}
                >
                  <div className="truncate font-medium">{f.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {[f.classification, f.via ? `via ${f.via}` : null, formatData(f.createdAt)]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar este negócio?</DialogTitle>
            <DialogDescription>
              Apaga também {d.movements.length} movimento{d.movements.length === 1 ? "" : "s"} financeiro
              {d.movements.length === 1 ? "" : "s"} e as ligações de ficheiros. Não há forma de recuperar.
              Se só queres tirar isto da frente, usa Arquivar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={apagar}>Eliminar tudo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
