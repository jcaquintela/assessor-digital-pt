// Ficha completa do imóvel: absorve o que existe no Negócio ligado para o
// consultor não ter de saltar de página. Conversa e dashboard escrevem nos
// mesmos registos.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteProperty, updatePropertyFields } from "@/lib/assessor/properties.functions";
import {
  addMarketingActivity, addPropertyCost, addPropertyInterest, addPropertyNote,
  addPropertyOffer, addPropertyVisit, createDealForProperty, deleteInterest,
  deleteMarketingActivity, dismissPropertyQuestion, getPropertyDossier, setInterestStatus, setOfferStatus,
  setPropertyCommercialState, setPropertyValues, setVisitState, toggleMarketingActivity,
} from "@/lib/imoveis/ficha.functions";
import { propertySummary } from "@/lib/imoveis/summary";
import { propertyOpenQuestions } from "@/lib/imoveis/questions";
import { setDealStage } from "@/lib/deals/deals.functions";
import { StagePath } from "@/components/negocios/stage-path";
import { PROPERTY_STATUSES, propertyStatusLabel } from "@/lib/assessor/properties-status";
import { STAGE_LABEL } from "@/lib/deals/stages";
import { EntityFilesCard } from "@/components/drive/entity-files-card";
import { formatData, formatEUR } from "@/lib/demo-data";
import { ChevronLeft, MoreHorizontal, Pencil, Trash2, Archive, MessageSquare, Plus } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useAssessorName } from "@/lib/assessor/assessor-name";
import { TierGate } from "@/components/tier-gate";

const ORIGEM_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp", telegram: "Telegram", web: "Dashboard", dashboard: "Dashboard",
  placa: "placa na rua", prospecting: "placa na rua",
};

export const Route = createFileRoute("/_authenticated/imoveis/$id")({
  head: () => ({
    meta: [
      { title: "Ficha do imóvel — Afonso" },
      { name: "description", content: "Negócio, valores, visitas, propostas, marketing, custos e documentos do imóvel." },
      { property: "og:title", content: "Ficha do imóvel — Afonso" },
      { property: "og:description", content: "Tudo sobre o imóvel numa página, sem saltar de ecrã." },
    ],
  }),
  component: () => (
    <TierGate min="consultor" title="Imóveis">
      <PropertyDetail />
    </TierGate>
  ),
});

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 mt-4 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        {action}
      </div>
      <Card><CardContent className="p-4">{children}</CardContent></Card>
    </div>
  );
}

function RowItem({ main, meta, right }: { main: React.ReactNode; meta?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border py-2.5 first:border-t-0 first:pt-0">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{main}</div>
        {meta && <div className="mt-0.5 text-xs text-muted-foreground">{meta}</div>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

function PropertyDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { name: assessorName } = useAssessorName();

  const fetchDossier = useServerFn(getPropertyDossier);
  const update = useServerFn(updatePropertyFields);
  const remove = useServerFn(deleteProperty);
  const values = useServerFn(setPropertyValues);
  const commercial = useServerFn(setPropertyCommercialState);
  const newDeal = useServerFn(createDealForProperty);
  const stageFn = useServerFn(setDealStage);
  const addInterest = useServerFn(addPropertyInterest);
  const interestStatus = useServerFn(setInterestStatus);
  const dropInterest = useServerFn(deleteInterest);
  const addVisit = useServerFn(addPropertyVisit);
  const visitStateFn = useServerFn(setVisitState);
  const addOffer = useServerFn(addPropertyOffer);
  const offerStatus = useServerFn(setOfferStatus);
  const addMkt = useServerFn(addMarketingActivity);
  const toggleMkt = useServerFn(toggleMarketingActivity);
  const dropMkt = useServerFn(deleteMarketingActivity);
  const addCost = useServerFn(addPropertyCost);
  const addNote = useServerFn(addPropertyNote);
  const dismissQuestion = useServerFn(dismissPropertyQuestion);

  const { data, isLoading } = useQuery({
    queryKey: ["property-dossier", id],
    queryFn: () => fetchDossier({ data: { id } }),
    retry: false,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["property-dossier", id] });
    qc.invalidateQueries({ queryKey: ["properties"] });
    qc.invalidateQueries({ queryKey: ["deals"] });
  };
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); refresh(); toast.success(msg); }
    catch (e) { toast.error((e as Error).message); }
  };
  const mutation = useMutation({
    mutationFn: (patch: Record<string, unknown>) => update({ data: { id, patch } }),
    onSuccess: () => { refresh(); toast.success("Alterações guardadas."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [draft, setDraft] = useState<Record<string, any> | null>(null);
  const [novoInteressado, setNovoInteressado] = useState({ name: "", contact: "", source: "" });
  const [novaVisita, setNovaVisita] = useState({ who: "", date: "", time: "" });
  const [novaProposta, setNovaProposta] = useState({ amount: "", from: "" });
  const [novaAtividade, setNovaAtividade] = useState("");
  const [novaDespesa, setNovaDespesa] = useState({ description: "", amount: "" });
  const [novaNota, setNovaNota] = useState("");
  const [com, setCom] = useState<{ pct: string; amount: string } | null>(null);

  if (isLoading) {
    return <AppShell><PageHeader title="Imóvel" /><div className="text-sm text-muted-foreground">A carregar...</div></AppShell>;
  }
  if (!data) {
    return (
      <AppShell>
        <PageHeader title="Imóvel não encontrado" />
        <div className="text-sm text-muted-foreground">
          Este imóvel não existe ou não tens acesso. <Link to="/imoveis" className="underline">Voltar à lista</Link>.
        </div>
      </AppShell>
    );
  }

  const p: any = data.property;
  const deal = data.deal as any | null;
  const editing = draft !== null;
  const editValues = draft ?? p;

  const startEdit = () => setDraft({ ...p });
  const save = () => {
    if (!draft) return;
    const patch: Record<string, unknown> = {};
    for (const k of Object.keys(draft)) if (draft[k] !== p[k]) patch[k] = draft[k];
    if (Object.keys(patch).length === 0) return setDraft(null);
    mutation.mutate(patch, { onSuccess: () => setDraft(null) });
  };

  const eliminar = async () => {
    if (!confirm(`Apagar "${p.title}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await remove({ data: { id } });
      qc.invalidateQueries({ queryKey: ["properties"] });
      toast.success("Imóvel eliminado.");
      navigate({ to: "/imoveis" });
    } catch (e) { toast.error((e as Error).message); }
  };

  const caracteristicas = [p.typology, p.area_useful ? `${p.area_useful} m²` : p.area_gross ? `${p.area_gross} m²` : null]
    .filter(Boolean).join(" · ");

  const comissaoPct = com?.pct ?? (p.commission_pct != null ? String(p.commission_pct) : "");
  const comissaoVal = com?.amount ?? (p.commission_amount != null ? String(p.commission_amount) : "");

  // Resumo e dúvidas: calculados a partir dos dados que já estão na ficha.
  const resumo = propertySummary({
    property: p,
    owner: data.owner as any,
    deal,
    currentOffer: data.currentOffer,
    visitsDone: data.visits.filter((v) => v.state === "feita").length,
    interestsOpen: data.interests.filter((i) => i.status !== "descartado" && i.status !== "fechado").length,
  });
  const duvidas = propertyOpenQuestions({
    property: p,
    owner: data.owner as any,
    offers: data.offers,
    visits: data.visits,
    assistantPending: (data as any).assistantPending ?? [],
    dismissedKeys: (data as any).dismissedKeys ?? [],
  });
  const ignorar = (key: string, question: string) =>
    void act(() => dismissQuestion({ data: { propertyId: id, key, question } }), "Dúvida ignorada.");

  const field = (label: string, key: string, type: "text" | "number" = "text") => (
    <div className="grid gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {editing ? (
        <Input
          type={type}
          value={editValues[key] ?? ""}
          onChange={(e) => setDraft({ ...(draft as any), [key]: type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value })}
        />
      ) : (
        <div className="text-sm">
          {key === "asking_price" && p[key] != null ? formatEUR(Number(p[key])) : (p[key] ?? <span className="text-muted-foreground">—</span>)}
        </div>
      )}
    </div>
  );

  return (
    <AppShell>
      <div className="mb-2">
        <Link to="/imoveis" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> Imóveis
        </Link>
      </div>

      {/* ===== Cabeçalho ===== */}
      <PageHeader title={p.title} subtitle={[p.address, p.city || p.location].filter(Boolean).join(" · ")} />
      <div className="mb-1 flex flex-wrap items-center gap-2">
        {deal && <Badge>{STAGE_LABEL[deal.stage as keyof typeof STAGE_LABEL] ?? deal.stage}</Badge>}
        <Badge variant="outline">{propertyStatusLabel(p.status)}</Badge>
        {p.category && <Badge variant="secondary">● {p.category}</Badge>}
        {p.source_channel && <Badge variant="secondary">via {ORIGEM_LABEL[p.source_channel] ?? p.source_channel}</Badge>}
        {caracteristicas && <Badge variant="secondary">{caracteristicas}</Badge>}
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" aria-label="Mais ações"><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem asChild>
                <Link to="/assessor">
                  <MessageSquare className="mr-2 h-3.5 w-3.5" />
                  Falar com {assessorName} sobre este imóvel
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => startEdit()}>
                <Pencil className="mr-2 h-3.5 w-3.5" /> Editar dados
              </DropdownMenuItem>
              {p.status !== "arquivado" && (
                <DropdownMenuItem onSelect={() => mutation.mutate({ status: "arquivado" })}>
                  <Archive className="mr-2 h-3.5 w-3.5" /> Arquivar
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onSelect={() => void eliminar()}>
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ===== Percurso do negócio ===== */}
      <Section
        title="O que sabemos"
      >
        <ul className="grid gap-1.5">
          {resumo.map((frase, i) => (
            <li key={i} className="text-sm text-muted-foreground">{frase}</li>
          ))}
        </ul>
      </Section>

      {duvidas.length > 0 && (
        <Section title="Informação por confirmar">
          <div className="grid gap-3">
            {duvidas.map((q) => (
              <div key={q.key} className="border-t border-border pt-3 first:border-t-0 first:pt-0">
                <p className="text-sm">{q.text}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {q.kind === "offer_pending" && q.refId && (
                    <>
                      <Button size="sm" onClick={() => void act(() => offerStatus({ data: { id: q.refId as string, status: "aceite" } }), "Proposta aceite.")}>
                        {q.confirmLabel}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void act(() => offerStatus({ data: { id: q.refId as string, status: "recusada" } }), "Proposta recusada.")}>
                        {q.correctLabel}
                      </Button>
                    </>
                  )}
                  {q.kind === "visit_no_outcome" && q.refId && (
                    <>
                      <Button size="sm" onClick={() => void act(() => visitStateFn({ data: { id: q.refId as string, state: "feita" } }), "Visita marcada como feita.")}>
                        {q.confirmLabel}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void act(() => visitStateFn({ data: { id: q.refId as string, state: "cancelada" } }), "Visita cancelada.")}>
                        {q.correctLabel}
                      </Button>
                    </>
                  )}
                  {(q.kind === "sold_without_price" || q.kind === "owner_missing") && (
                    <Button size="sm" variant="outline" onClick={() => startEdit()}>Corrigir na ficha</Button>
                  )}
                  <Button size="sm" variant="ghost" asChild>
                    <Link to="/assessor">Perguntar {`ao ${assessorName}`}</Link>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => ignorar(q.key, q.text)}>Ignorar</Button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ===== Percurso do negócio ===== */}
      <Section
        title="Percurso do negócio"
        action={deal ? <Link to="/oportunidades/$id" params={{ id: deal.id }} className="text-xs underline">Abrir negócio</Link> : null}
      >
        {deal ? (
          <>
            <StagePath
              stage={deal.stage}
              onChange={(s) => void act(() => stageFn({ data: { id: deal.id, stage: s } }), "Fase atualizada.")}
            />
            <div className="mt-3 text-xs text-muted-foreground">
              {deal.title}
              {deal.stage_changed_at ? ` · nesta fase desde ${formatData(deal.stage_changed_at)}` : ""}
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">Este imóvel ainda não tem negócio ligado.</p>
            <Button
              size="sm"
              onClick={() => void act(() => newDeal({ data: { propertyId: id } }), "Negócio criado e ligado.")}
            >
              <Plus className="mr-1 h-4 w-4" /> Criar negócio
            </Button>
          </div>
        )}
      </Section>

      <div className="grid gap-0 md:grid-cols-2 md:gap-4">
        {/* ===== Valores ===== */}
        <Section title="Valores">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="text-xs text-muted-foreground">Valor promoção</div>
              <div className="text-base font-medium">{p.asking_price != null ? formatEUR(Number(p.asking_price)) : "—"}</div>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="text-xs text-muted-foreground">Proposta atual</div>
              <div className="text-base font-medium">{data.currentOffer != null ? formatEUR(data.currentOffer) : "—"}</div>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="text-xs text-muted-foreground">Valor de venda</div>
              <div className="text-base font-medium">{p.sale_price != null ? formatEUR(Number(p.sale_price)) : "—"}</div>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="text-xs text-muted-foreground">Comissão</div>
              <div className="text-base font-medium">
                {[p.commission_pct != null ? `${p.commission_pct}%` : null,
                  p.commission_amount != null ? formatEUR(Number(p.commission_amount)) : null]
                  .filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Input placeholder="Comissão %" inputMode="decimal" value={comissaoPct}
              onChange={(e) => setCom({ pct: e.target.value, amount: com?.amount ?? "" })} />
            <Input placeholder="Comissão €" inputMode="decimal" value={comissaoVal}
              onChange={(e) => setCom({ pct: com?.pct ?? "", amount: e.target.value })} />
            <Button
              variant="outline"
              onClick={() => void act(() => values({
                data: {
                  propertyId: id,
                  commissionPct: comissaoPct === "" ? null : Number(comissaoPct),
                  ...(com?.amount ? { commissionAmount: Number(com.amount) } : {}),
                },
              }), "Valores guardados.").then(() => setCom(null))}
            >
              Guardar comissão
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Basta um dos dois: com valor de venda (ou de promoção) conhecido, o outro é calculado.
          </p>
        </Section>

        {/* ===== Pessoa associada ===== */}
        <Section title="Pessoa associada">
          {data.owner ? (
            <Link to="/pessoas/$id" params={{ id: (data.owner as any).id }}
              className="flex items-center gap-3 rounded-lg bg-muted/40 p-3 hover:bg-muted">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold">
                {String((data.owner as any).name ?? "?").charAt(0)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{(data.owner as any).name}</span>
                <span className="block text-xs text-muted-foreground">
                  {(data.owner as any).relationship_type || "proprietário"}
                  {(data.owner as any).phone ? ` · ${(data.owner as any).phone}` : ""}
                </span>
              </span>
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">Sem proprietário associado. Podes associar em “Editar dados”.</p>
          )}
        </Section>
      </div>

      {/* ===== Estado comercial ===== */}
      <Section title="Estado comercial">
        <RowItem
          main="Reserva"
          meta="Sinal confirmado antes de CPCV"
          right={
            <Switch
              checked={Boolean(p.reserved_at)}
              onCheckedChange={(v) => void act(() => commercial({ data: { propertyId: id, reserved: v } }),
                v ? "Reserva registada." : "Reserva retirada.")}
            />
          }
        />
        <RowItem
          main="Vendido"
          meta="Marca o negócio como concluído"
          right={
            <Switch
              checked={Boolean(p.sold_at)}
              onCheckedChange={(v) => void act(() => commercial({ data: { propertyId: id, sold: v } }),
                v ? "Imóvel marcado como vendido." : "Venda anulada.")}
            />
          }
        />
      </Section>

      {/* ===== Contactos interessados ===== */}
      <Section title="Contactos interessados">
        {data.interests.length === 0 && <p className="text-sm text-muted-foreground">Ainda ninguém registado.</p>}
        {data.interests.map((i) => (
          <RowItem
            key={i.id}
            main={i.personId ? <Link to="/pessoas/$id" params={{ id: i.personId }} className="underline">{i.name}</Link> : i.name}
            meta={[i.contact, i.source, formatData(i.createdAt)].filter(Boolean).join(" · ")}
            right={
              <div className="flex items-center gap-1">
                <Select value={i.status} onValueChange={(v) => void act(() => interestStatus({ data: { id: i.id, status: v } }), "Estado atualizado.")}>
                  <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="a_contactar">A contactar</SelectItem>
                    <SelectItem value="a_follow_up">A follow-up</SelectItem>
                    <SelectItem value="visitou">Visitou</SelectItem>
                    <SelectItem value="sem_interesse">Sem interesse</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="ghost" onClick={() => void act(() => dropInterest({ data: { id: i.id } }), "Removido.")}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            }
          />
        ))}
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <Input placeholder="Nome" value={novoInteressado.name} onChange={(e) => setNovoInteressado({ ...novoInteressado, name: e.target.value })} />
          <Input placeholder="Contacto" value={novoInteressado.contact} onChange={(e) => setNovoInteressado({ ...novoInteressado, contact: e.target.value })} />
          <Input placeholder="Origem (placa, portal…)" value={novoInteressado.source} onChange={(e) => setNovoInteressado({ ...novoInteressado, source: e.target.value })} />
          <Button
            variant="outline"
            onClick={() => void act(() => addInterest({ data: { propertyId: id, ...novoInteressado } }), "Interessado registado.")
              .then(() => setNovoInteressado({ name: "", contact: "", source: "" }))}
          >
            <Plus className="mr-1 h-4 w-4" /> Registar
          </Button>
        </div>
      </Section>

      {/* ===== Visitas ===== */}
      <Section title="Visitas">
        {data.visits.length === 0 && <p className="text-sm text-muted-foreground">Sem visitas registadas.</p>}
        {data.visits.map((v) => (
          <RowItem
            key={v.id}
            main={v.who ?? v.title}
            meta={`${formatData(v.dueAt)}${v.dueTime ? `, ${String(v.dueTime).slice(0, 5)}` : ""} — ${v.title}`}
            right={
              <Select value={v.state} onValueChange={(s) => void act(() => visitStateFn({ data: { id: v.id, state: s as any } }), "Visita atualizada.")}>
                <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="agendada">Agendada</SelectItem>
                  <SelectItem value="feita">Feita</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            }
          />
        ))}
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <Input placeholder="Quem visita" value={novaVisita.who} onChange={(e) => setNovaVisita({ ...novaVisita, who: e.target.value })} />
          <Input type="date" value={novaVisita.date} onChange={(e) => setNovaVisita({ ...novaVisita, date: e.target.value })} />
          <Input type="time" value={novaVisita.time} onChange={(e) => setNovaVisita({ ...novaVisita, time: e.target.value })} />
          <Button
            variant="outline"
            onClick={() => void act(() => addVisit({ data: { propertyId: id, ...novaVisita } }), "Visita agendada.")
              .then(() => setNovaVisita({ who: "", date: "", time: "" }))}
          >
            <Plus className="mr-1 h-4 w-4" /> Agendar visita
          </Button>
        </div>
      </Section>

      {/* ===== Propostas ===== */}
      <Section title="Propostas">
        {data.offers.length === 0 && <p className="text-sm text-muted-foreground">Sem propostas recebidas.</p>}
        {data.offers.map((o) => (
          <RowItem
            key={o.id}
            main={`${formatEUR(o.amount)}${o.from ? ` — ${o.from}` : ""}`}
            meta={`Recebida ${formatData(o.date)}`}
            right={
              <Select value={o.status} onValueChange={(s) => void act(() => offerStatus({ data: { id: o.id, status: s as any } }), "Proposta atualizada.")}>
                <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="aceite">Aceite</SelectItem>
                  <SelectItem value="recusada">Recusada</SelectItem>
                </SelectContent>
              </Select>
            }
          />
        ))}
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Input placeholder="Valor (€)" inputMode="decimal" value={novaProposta.amount} onChange={(e) => setNovaProposta({ ...novaProposta, amount: e.target.value })} />
          <Input placeholder="De quem" value={novaProposta.from} onChange={(e) => setNovaProposta({ ...novaProposta, from: e.target.value })} />
          <Button
            variant="outline"
            onClick={() => void act(() => addOffer({ data: { propertyId: id, amount: Number(novaProposta.amount), from: novaProposta.from } }), "Proposta registada.")
              .then(() => setNovaProposta({ amount: "", from: "" }))}
          >
            <Plus className="mr-1 h-4 w-4" /> Registar proposta
          </Button>
        </div>
      </Section>

      {/* ===== Atividades de marketing ===== */}
      <Section title="Atividades de marketing">
        {data.marketing.length === 0 && <p className="text-sm text-muted-foreground">Ainda sem atividades registadas.</p>}
        {data.marketing.map((m) => (
          <RowItem
            key={m.id}
            main={m.title}
            meta={m.status === "feito" && m.doneAt ? `Feito em ${formatData(m.doneAt)}` : "Por fazer"}
            right={
              <div className="flex items-center gap-2">
                <Switch
                  checked={m.status === "feito"}
                  onCheckedChange={(v) => void act(() => toggleMkt({ data: { id: m.id, done: v } }), "Atividade atualizada.")}
                />
                <Button size="sm" variant="ghost" onClick={() => void act(() => dropMkt({ data: { id: m.id } }), "Removida.")}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            }
          />
        ))}
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
          <Input placeholder="Ex.: fotos profissionais, anúncio no portal, vídeo…" value={novaAtividade} onChange={(e) => setNovaAtividade(e.target.value)} />
          <Button
            variant="outline"
            onClick={() => void act(() => addMkt({ data: { propertyId: id, title: novaAtividade } }), "Atividade registada.")
              .then(() => setNovaAtividade(""))}
          >
            <Plus className="mr-1 h-4 w-4" /> Registar atividade
          </Button>
        </div>
      </Section>

      {/* ===== Custos ===== */}
      <Section title="Custos">
        {data.costs.length === 0 && <p className="text-sm text-muted-foreground">Sem despesas ligadas a este imóvel.</p>}
        {data.costs.map((c) => (
          <RowItem key={c.id} main={c.description} meta={formatData(c.date)} right={<span className="text-sm">{formatEUR(c.amount)}</span>} />
        ))}
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Input placeholder="Descrição" value={novaDespesa.description} onChange={(e) => setNovaDespesa({ ...novaDespesa, description: e.target.value })} />
          <Input placeholder="Valor (€)" inputMode="decimal" value={novaDespesa.amount} onChange={(e) => setNovaDespesa({ ...novaDespesa, amount: e.target.value })} />
          <Button
            variant="outline"
            onClick={() => void act(() => addCost({ data: { propertyId: id, description: novaDespesa.description, amount: Number(novaDespesa.amount) } }), "Despesa registada.")
              .then(() => setNovaDespesa({ description: "", amount: "" }))}
          >
            <Plus className="mr-1 h-4 w-4" /> Registar despesa
          </Button>
        </div>
      </Section>

      {/* ===== Documentos ===== */}
      <div className="mt-4">
        <EntityFilesCard entityType="property" entityId={id} />
      </div>

      {/* ===== Notas ===== */}
      <Section title="Notas">
        {data.notes.length === 0 && <p className="text-sm text-muted-foreground">Sem notas registadas.</p>}
        {data.notes.map((n) => (
          <RowItem key={n.id} main={n.content} meta={`${formatData(n.at)}${n.channel ? ` · ${ORIGEM_LABEL[n.channel] ?? n.channel}` : ""}`} />
        ))}
        <div className="mt-3 grid gap-2">
          <Textarea rows={2} placeholder="Escreve uma nota sobre este imóvel…" value={novaNota} onChange={(e) => setNovaNota(e.target.value)} />
          <div>
            <Button
              variant="outline"
              onClick={() => void act(() => addNote({ data: { propertyId: id, note: novaNota } }), "Nota registada.")
                .then(() => setNovaNota(""))}
            >
              <Plus className="mr-1 h-4 w-4" /> Adicionar nota
            </Button>
          </div>
        </div>
      </Section>

      {/* ===== Dados do imóvel ===== */}
      <Section
        title="Dados do imóvel"
        action={
          <div className="flex gap-2">
            {!editing && <Button size="sm" variant="outline" onClick={startEdit}>Editar</Button>}
            {editing && <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancelar</Button>}
            {editing && <Button size="sm" onClick={save} disabled={mutation.isPending}>Guardar</Button>}
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {field("Título", "title")}
          {field("Tipologia", "typology")}
          {field("Tipo", "property_type")}
          <div className="grid gap-1">
            <Label className="text-xs text-muted-foreground">Estado</Label>
            {editing ? (
              <Select value={editValues.status ?? "em_angariacao"} onValueChange={(v) => setDraft({ ...(draft as any), status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROPERTY_STATUSES.map((s) => <SelectItem key={s} value={s}>{propertyStatusLabel(s)}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : <div className="text-sm">{propertyStatusLabel(p.status)}</div>}
          </div>
          {field("Categoria", "category")}
          {field("Cidade", "city")}
          {field("Freguesia", "parish")}
          {field("Morada", "address")}
          {field("Cód. postal", "postal_code")}
          {field("Preço pedido (€)", "asking_price", "number")}
          {field("Valor estimado (€)", "estimated_value", "number")}
          {field("Área útil (m²)", "area_useful", "number")}
          {field("Área bruta (m²)", "area_gross", "number")}
          {field("Quartos", "bedrooms", "number")}
          {field("WCs", "bathrooms", "number")}
          {field("Estacionamento", "parking", "number")}
          {field("Certificado energético", "energy_rating")}
        </div>
        <div className="mt-3">
          <Label className="text-xs text-muted-foreground">Notas da ficha</Label>
          {editing ? (
            <Textarea value={editValues.notes ?? ""} onChange={(e) => setDraft({ ...(draft as any), notes: e.target.value })} rows={3} />
          ) : (
            <div className="whitespace-pre-wrap text-sm">{p.notes ?? <span className="text-muted-foreground">—</span>}</div>
          )}
        </div>
      </Section>

      {/* ===== Outros seguimentos ===== */}
      {data.followUps.length > 0 && (
        <Section title="Outros seguimentos">
          {data.followUps.map((f) => (
            <RowItem key={f.id} main={f.title} meta={`${formatData(f.dueAt)}${f.dueTime ? ` · ${String(f.dueTime).slice(0, 5)}` : ""}`}
              right={<Badge variant="outline">{f.status}</Badge>} />
          ))}
        </Section>
      )}
    </AppShell>
  );
}
