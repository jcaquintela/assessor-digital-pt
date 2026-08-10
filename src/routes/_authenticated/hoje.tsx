import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import { formatData, formatDataHora, formatEUR } from "@/lib/demo-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, CalendarClock, CheckCircle2, Clock, MessageSquare, Sparkles,
  FileText, Briefcase, ChevronRight, MoreHorizontal, StickyNote, Archive,
  Home, X,
} from "lucide-react";
import { PaymentPortalButton } from "@/components/payment-portal-button";
import { useAssessorName } from "@/lib/assessor/assessor-name";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { dismissPriority, getHojeSupreme } from "@/lib/assessor/supreme/priorities.functions";
import { eventWindow, isWindowOver } from "@/lib/assessor/supreme/event-window";
import { saveFollowUpOutcome } from "@/lib/assessor/supreme/outcomes.functions";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EventDrawer, type EventDrawerItem } from "@/components/hoje/event-drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { explainPriority } from "@/lib/assessor/priority-explain";
import { assuntoDe, fraseComAcao } from "@/lib/assessor/assunto";
import { AssuntoCard } from "@/components/assunto-card";
import { isOpenFollowUpStatus } from "@/lib/assessor/outcome-status";
import { getHojeOverview } from "@/lib/assessor/supreme/overview.functions";
import { Lightbulb, ArrowRight } from "lucide-react";
import { HojeSumGrid } from "@/components/hoje/sum-grid";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { isDealActive } from "@/lib/deals/stages";
import { useNow } from "@/hooks/use-now";
import { buildAgendaView, tomorrowLabel, type DayEvent } from "@/lib/agenda/day-events";
import { lisbonYmd } from "@/lib/assessor/lisbon-day";

type HojeSearch = { filtro?: "imoveis-por-confirmar" };

export const Route = createFileRoute("/_authenticated/hoje")({
  head: () => ({
    meta: [
      { title: "Hoje — Afonso" },
      { name: "description", content: "Briefing diário, compromissos e prioridades do consultor." },
      { property: "og:title", content: "Hoje — Afonso" },
      { property: "og:description", content: "Briefing diário, compromissos e prioridades do consultor." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): HojeSearch => {
    const filtro = s.filtro;
    return { filtro: filtro === "imoveis-por-confirmar" ? filtro : undefined };
  },
  component: HojePage,
});

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function greeting(now: Date) {
  const h = now.getHours();
  if (h < 12) return "Bom dia";
  if (h < 20) return "Boa tarde";
  return "Boa noite";
}

type Priority = {
  subject_type: "follow_up" | "opportunity" | "property";
  subject_id: string;
  action: string;
  reasons: string[];
  priority_score: number;
  due_at: string | null;
  entity_label: string | null;
  deal_id?: string | null;
  deal_label?: string | null;
  origin?: "calendario" | "compromisso" | "tarefa" | "negocio";
  origin_label?: string | null;
  state_label?: string | null;
  /** Janela do compromisso: um cartão de preparação expira quando ela passa. */
  event_start_at?: string | null;
  event_end_at?: string | null;
};

type Settled = {
  subject_id: string;
  action: string;
  state_label: string;
  origin_label: string;
  due_at: string | null;
};

type Awaiting = {
  id: string;
  title: string;
  due_at: string;
  entity_label: string | null;
  property_id: string | null;
  deal_id: string | null;
};

function HojePage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const filtroAtivo = search.filtro === "imoveis-por-confirmar";
  const setFiltro = (ativo: boolean) => {
    void navigate({
      to: "/hoje",
      search: ativo ? { filtro: "imoveis-por-confirmar" } : {},
      replace: true,
    });
  };

  const { seguimentos, oportunidades, pessoas, imoveis, concluirSeguimento, reagendarSeguimento, arquivarSeguimento } = useStore();
  void oportunidades;
  const { name: assessorName } = useAssessorName();
  // Relógio partilhado: reavalia de 5 em 5 minutos e ao voltar à página,
  // para que um compromisso que termina saia dos widgets sem recarregar.
  const now = useNow();
  const supremeQ = useServerFn(getHojeSupreme);
  const dismissFn = useServerFn(dismissPriority);
  const outcomeFn = useServerFn(saveFollowUpOutcome);
  const qc = useQueryClient();

  const supreme = useQuery({
    queryKey: ["supreme", "hoje"],
    queryFn: () => supremeQ(),
    retry: false,
  });

  // Resumo geral (contagens simples) + sugestão do mentor.
  const overviewQ = useServerFn(getHojeOverview);
  const overview = useQuery({
    queryKey: ["hoje", "overview"],
    queryFn: () => overviewQ(),
    retry: false,
  });
  const [tipOff, setTipOff] = useState<string | null>(null);
  const mentor = overview.data?.mentor ?? null;
  const resumo = overview.data?.summary ?? null;

  const docsPending = useQuery({
    queryKey: ["uploaded_files", "unclassified"],
    queryFn: async () => {
      const { count } = await supabase
        .from("uploaded_files")
        .select("id", { count: "exact", head: true })
        .is("classification", null);
      return count ?? 0;
    },
  });

  // Primeiro nome do consultor para a saudação pessoal.
  const profileQ = useQuery({
    queryKey: ["profile", "first-name"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("name").maybeSingle();
      return (data?.name as string | null) ?? null;
    },
  });
  const firstName = (profileQ.data ?? "").trim().split(/\s+/)[0] || "";

  const outcome = useMutation({
    mutationFn: (v: { id: string; outcome: string; notes?: string }) => outcomeFn({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supreme", "hoje"] });
      qc.invalidateQueries({ queryKey: ["follow_ups"] });
      toast.success("Resultado registado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dismiss = useMutation({
    mutationFn: (v: { id: string }) => dismissFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["supreme", "hoje"] }),
  });

  const [drawer, setDrawer] = useState<EventDrawerItem | null>(null);
  const [noteFor, setNoteFor] = useState<Awaiting | null>(null);
  const [noteText, setNoteText] = useState("");

  const nomePessoa = (id?: string) => pessoas.find((p) => p.id === id)?.nome ?? "";
  const tituloImovel = (id?: string) => imoveis.find((i) => i.id === id)?.titulo ?? "";

  // Fonte única dos compromissos: o resumo do servidor (hoje + amanhã). Só se cai
  // no store local enquanto o resumo ainda não chegou. Toda a seleção temporal
  // vive em `@/lib/agenda/day-events` — nenhum widget filtra eventos por si.
  const eventosBrutos: DayEvent[] = useMemo(() => {
    const doServidor = overview.data?.summary?.agenda.items;
    if (doServidor) {
      return doServidor.map((e) => ({
        id: e.id,
        title: e.title,
        time: e.time ?? null,
        date: (e as any).date ?? lisbonYmd(new Date()),
        type: e.type ?? null,
        personId: e.personId ?? null,
        propertyId: e.propertyId ?? null,
      }));
    }
    return seguimentos
      .filter((s) => isOpenFollowUpStatus(s.estado))
      .map((s) => ({
        id: s.id,
        title: s.titulo,
        time: s.hora ?? null,
        date: lisbonYmd(s.data),
        personId: s.pessoaId ?? null,
        propertyId: (s as any).imovelId ?? null,
      }));
  }, [overview.data, seguimentos]);

  const agenda = useMemo(() => buildAgendaView(eventosBrutos, now), [eventosBrutos, now]);
  const eventosHoje = agenda.upcoming;
  const atrasados = useMemo(
    () =>
      seguimentos.filter(
        (s) => isOpenFollowUpStatus(s.estado) && new Date(s.data) < now && !isSameDay(new Date(s.data), now),
      ),
    [seguimentos, now],
  );
  const oportSemAcao = useMemo(
    () => oportunidades.filter((o) => !o.proximaAcao && isDealActive({
      stage: o.fase,
      status: o.estado,
      arquivadoEm: o.arquivadoEm,
    })),
    [oportunidades],
  );

  // Fallback local para prioridades quando o motor Supremo está desligado ou vazio.
  const localPriorities: Priority[] = useMemo(() => {
    const items: Priority[] = [];
    for (const s of atrasados.slice(0, 3)) {
      items.push({
        subject_type: "follow_up",
        subject_id: s.id,
        action: s.titulo,
        reasons: ["em atraso"],
        priority_score: 80,
        due_at: s.data,
        entity_label: nomePessoa(s.pessoaId) || null,
        deal_id: null,
        deal_label: null,
      });
    }
    for (const e of eventosHoje.slice(0, 2)) {
      const janela = eventWindow({ due_date: e.date, due_time: e.time });
      // Compromisso já terminado não se prepara.
      if (isWindowOver(janela.endIso, now)) continue;
      items.push({
        subject_type: "follow_up",
        subject_id: e.id,
        action: `Preparar o compromisso${e.time ? ` das ${e.time}` : ""}: ${e.title}`,
        reasons: ["compromisso de hoje"],
        priority_score: 70,
        due_at: now.toISOString(),
        entity_label: nomePessoa(e.personId ?? undefined) || null,
        deal_id: null,
        deal_label: null,
        event_start_at: janela.startIso,
        event_end_at: janela.endIso,
      });
    }
    for (const o of oportSemAcao.slice(0, 2)) {
      const nome = nomePessoa(o.pessoaId);
      items.push({
        subject_type: "opportunity",
        subject_id: o.id,
        action: `Definir próxima ação${nome ? ` com ${nome}` : ""}`,
        reasons: ["sem próxima ação"],
        priority_score: 55,
        due_at: null,
        entity_label: nome || null,
        deal_id: o.id,
        deal_label: o.titulo?.trim() || o.tipo || "Negócio",
      });
    }
    return items.slice(0, 5);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atrasados, eventosHoje, oportSemAcao, pessoas]);

  // Segunda validação, agora na renderização: um cartão gerado às 8h não pode
  // continuar a sugerir preparar um compromisso que já terminou às 11h.
  const priorities: Priority[] = (
    supreme.data?.priorities?.length
      ? (supreme.data.priorities as Priority[])
      : localPriorities
  ).filter((p) => !isWindowOver(p.event_end_at ?? null, now));

  // Itens do briefing anterior que entretanto foram cancelados/arquivados.
  const settled: Settled[] = ((supreme.data as any)?.settled ?? []) as Settled[];

  const localAwaiting: Awaiting[] = useMemo(
    () => atrasados
      .filter((s) => s.tipo === "Evento")
      .slice(0, 5)
      .map((s) => ({
        id: s.id,
        title: s.titulo,
        due_at: s.data,
        entity_label: nomePessoa(s.pessoaId) || null,
        property_id: null,
        deal_id: null,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [atrasados, pessoas],
  );
  const awaiting: Awaiting[] = supreme.data?.awaitingOutcome?.length
    ? (supreme.data.awaitingOutcome as Awaiting[])
    : localAwaiting;

  const openEvent = (id: string, extra?: { motivo?: string | null; dealId?: string | null; dealLabel?: string | null }) => {
    const s = seguimentos.find((x) => x.id === id);
    if (!s) {
      // Não está na cache local: abre a ficha, que sabe ir buscá-lo à base de dados.
      void navigate({ to: "/seguimentos/$id", params: { id } });
      return;
    }
    const pessoa = pessoas.find((p) => p.id === s.pessoaId);
    const deal = oportunidades.find((o) => o.id === s.oportunidadeId);
    setDrawer({
      id: s.id,
      titulo: s.titulo,
      data: s.data,
      hora: s.hora,
      pessoaId: s.pessoaId ?? null,
      pessoaNome: nomePessoa(s.pessoaId),
      pessoaTelefone: pessoa?.telefone ?? null,
      imovelId: null,
      imovelTitulo: null,
      negocioId: extra?.dealId ?? s.oportunidadeId ?? null,
      negocioLabel: extra?.dealLabel ?? (deal?.titulo?.trim() || deal?.tipo || null),
      notas: s.notas ?? null,
      estado: s.estado,
      tipo: s.tipo,
      prioridade: s.prioridade,
      motivo: extra?.motivo ?? null,
    });
  };

  const openPriority = (p: Priority) => {
    if (p.subject_type === "follow_up") {
      openEvent(p.subject_id, {
        motivo: explainPriority(p),
        dealId: p.deal_id ?? null,
        dealLabel: p.deal_label ?? null,
      });
      return;
    }
    if (p.deal_id) void navigate({ to: "/negocios/$id", params: { id: p.deal_id } });
    // oportunidade e imóvel são navegações diretas via Link nas ações
  };

  const savePriorityDone = (p: Priority) => {
    if (p.subject_type === "follow_up") {
      outcome.mutate({ id: p.subject_id, outcome: "concluido" });
      concluirSeguimento(p.subject_id).catch(() => {/* já tratado via outcome */});
    } else {
      dismiss.mutate({ id: p.subject_id });
    }
  };

  const snoozePriority = (p: Priority, when: "1h" | "amanha" | "semana") => {
    if (p.subject_type !== "follow_up") { dismiss.mutate({ id: p.subject_id }); return; }
    const base = p.due_at ? new Date(p.due_at) : new Date();
    const target = new Date(base);
    if (when === "1h") target.setHours(target.getHours() + 1);
    else if (when === "amanha") { target.setDate(target.getDate() + 1); }
    else target.setDate(target.getDate() + 7);
    reagendarSeguimento(p.subject_id, target.toISOString())
      .then(() => { toast.success("Adiado."); qc.invalidateQueries({ queryKey: ["supreme", "hoje"] }); })
      .catch((e) => toast.error(e.message));
  };

  // Arquivar é sempre acção do dashboard — nunca do chat. Nada se apaga aqui.
  const deletePriority = async (p: Priority) => {
    if (p.subject_type !== "follow_up") return;
    if (!window.confirm(`Arquivar “${p.action}”? Sai da lista, mas podes repor na ficha.`)) return;
    try {
      await arquivarSeguimento(p.subject_id);
      qc.invalidateQueries({ queryKey: ["supreme", "hoje"] });
      toast.success("Eliminado.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const compromissosCount = agenda.todayCount;
  const prioridadesCount = priorities.length;

  const awaitingImoveis = useMemo(
    () => awaiting.filter((a) => a.property_id),
    [awaiting],
  );
  const awaitingToShow = filtroAtivo ? awaitingImoveis : awaiting;

  // Uma só observação em destaque — a mais pressionante do dia.
  const atencao: Priority | null = !filtroAtivo && priorities.length ? priorities[0] : null;

  return (
    <AppShell>
      {/* A. Cabeçalho */}
      <header className="mb-6 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <h1 className="c-serif text-[26px] font-medium md:text-[34px]">
              {greeting(now)}{firstName ? `, ${firstName}` : ""}.
            </h1>
            <p className="c-soft mt-1 text-sm">
              Hoje tens <strong style={{ color: "var(--ink)" }}>{prioridadesCount}</strong> prioridade{prioridadesCount === 1 ? "" : "s"} e{" "}
              <strong style={{ color: "var(--ink)" }}>{compromissosCount}</strong> compromisso{compromissosCount === 1 ? "" : "s"}.
              {" "}
              <span className="c-mono c-muted text-xs">
                {new Intl.DateTimeFormat("pt-PT", { weekday: "long", day: "2-digit", month: "long" }).format(now)}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/assessor" className="c-cta">
              <MessageSquare className="h-4 w-4" /> Falar com {assessorName}
            </Link>
          </div>
        </div>
      </header>

      {/* Filtro rápido: ações por confirmar ligadas a imóveis. */}
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setFiltro(!filtroAtivo)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
            filtroAtivo
              ? "border-[var(--sage)] bg-[var(--sage)]/10 text-[var(--sage-dark)]"
              : "border-[var(--border)] hover:bg-[var(--muted)]/5"
          }`}
          aria-pressed={filtroAtivo}
        >
          <Home className="h-3.5 w-3.5" />
          {filtroAtivo ? "A mostrar imóveis por confirmar" : "Imóveis por confirmar"}
          {filtroAtivo && <X className="h-3.5 w-3.5" />}
        </button>
        {filtroAtivo && (
          <span className="text-[12px]" style={{ color: "var(--muted)" }}>
            {awaitingImoveis.length} ação{awaitingImoveis.length === 1 ? "" : "ões"}
          </span>
        )}
      </div>

      {/* A-bis. "Isto merece atenção": UMA observação por dia, nunca uma lista. */}
      {!filtroAtivo && atencao && (
        <section className="c-spotlight mb-4">
          <AssuntoCard
            destaque
            tag={<><AlertTriangle className="h-4 w-4" /> Isto merece atenção</>}
            titulo={assuntoDe(atencao)}
            frase={fraseComAcao(atencao, explainPriority(atencao))}
            actions={<>
            {atencao.subject_type === "follow_up" ? (
              <Link className="c-cta" to="/seguimentos/$id" params={{ id: atencao.subject_id }}>
                <ArrowRight className="h-3.5 w-3.5" /> Tratar
              </Link>
            ) : atencao.subject_type === "opportunity" ? (
              <Link className="c-cta" to="/negocios/$id" params={{ id: atencao.subject_id }}>
                <ArrowRight className="h-3.5 w-3.5" /> Tratar
              </Link>
            ) : (
              <Link className="c-cta" to="/imoveis/$id" params={{ id: atencao.subject_id }}>
                <ArrowRight className="h-3.5 w-3.5" /> Tratar
              </Link>
            )}
            {atencao.deal_id ? (
              <Link
                className="c-btn"
                to="/negocios/$id"
                params={{ id: atencao.deal_id }}
                search={atencao.subject_type === "follow_up" ? { destaque: `seguimento:${atencao.subject_id}` } : {}}
              >
                <Briefcase className="h-3.5 w-3.5" /> Ver negócio
              </Link>
            ) : null}
            </>}
          />
        </section>
      )}

      {/* A-ter. Sugestão do mentor — conselho, não urgência. Só aparece se houver padrão real. */}
      {!filtroAtivo && mentor && tipOff !== mentor.key && (
        <section className="c-mentor mb-6">
          <div className="c-mentor-tag mb-2">
            <Lightbulb className="h-4 w-4" /> O teu mentor sugere
          </div>
          <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--ink)" }}>{mentor.text}</p>
          {mentor.reason ? (
            <p className="mt-2 text-[12px] leading-relaxed" style={{ color: "var(--muted)" }}>
              Porquê: {mentor.reason}
            </p>
          ) : null}
          <div className="mt-3 flex items-center gap-3">
            <Link to={mentor.to as never} className="text-[12.5px] font-semibold" style={{ color: "var(--sage)" }}>
              {mentor.linkLabel}
            </Link>
            <button
              type="button"
              className="text-[12.5px] font-semibold"
              style={{ color: "var(--muted)" }}
              onClick={() => setTipOff(mentor.key)}
            >
              Ignorar
            </button>
          </div>
        </section>
      )}

      {/* A-quater. Resumo geral — 6 rubricas, contagens simples, cada uma clicável. */}
      {!filtroAtivo && resumo && (
        <HojeSumGrid
          resumo={{
            ...resumo,
            // Agenda vem sempre do seletor central, reavaliado com o relógio local.
            agenda: {
              today: agenda.todayCount,
              nextLabel: agenda.next?.title ?? null,
              nextTime: agenda.next?.time ?? null,
              meta: agenda.cardMeta,
            },
          }}
        />
      )}

      <div className={filtroAtivo ? "space-y-6" : "grid gap-6 lg:grid-cols-2"}>
        {!filtroAtivo && (
          <div className="space-y-6">
            {/* B. As minhas prioridades */}
            <Card className="c-card border-0 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="c-section-title flex items-center gap-2">
                  <Sparkles className="h-4 w-4" style={{ color: "var(--brass)" }} /> As minhas prioridades
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {priorities.length === 0 && (
                  <p className="c-muted text-sm">Nenhuma prioridade urgente. Bom trabalho.</p>
                )}
                {priorities.map((p) => (
                  <AssuntoCard
                    key={`${p.subject_type}:${p.subject_id}`}
                    titulo={assuntoDe(p)}
                    /* A pontuação numérica não diz nada ao consultor: explicamos o porquê. */
                    frase={fraseComAcao(p, explainPriority(p))}
                    meta={[
                      p.entity_label,
                      p.due_at ? formatData(p.due_at) : null,
                    ].filter(Boolean).join(" · ")}
                    extra={
                      <>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {/* Origem exata: o consultor tem de saber se isto veio
                              do calendário ligado ou se é um seguimento do Afonso. */}
                          <span className="c-badge inline-flex max-w-full truncate text-xs">
                            {p.origin_label ?? (p.subject_type === "opportunity" ? "Negócio em curso" : "Seguimento")}
                          </span>
                          {p.state_label ? (
                            <span className="c-badge inline-flex max-w-full truncate text-xs text-muted-foreground">
                              Estado: {p.state_label}
                            </span>
                          ) : null}
                        </div>
                        {p.deal_id && p.deal_label ? (
                          <Link
                            to="/negocios/$id"
                            params={{ id: p.deal_id }}
                            search={p.subject_type === "follow_up" ? { destaque: `seguimento:${p.subject_id}` } : {}}
                            className="c-badge mt-1.5 inline-flex max-w-full truncate text-xs"
                          >
                            Negócio: {p.deal_label}
                          </Link>
                        ) : null}
                      </>
                    }
                    actions={<>
                      <button type="button" className="c-btn" onClick={() => savePriorityDone(p)}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Concluir
                      </button>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button type="button" className="c-btn-ghost">Adiar</button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-40 p-1">
                          <button className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted" onClick={() => snoozePriority(p, "1h")}>+1 hora</button>
                          <button className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted" onClick={() => snoozePriority(p, "amanha")}>Amanhã</button>
                          <button className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted" onClick={() => snoozePriority(p, "semana")}>Próxima semana</button>
                        </PopoverContent>
                      </Popover>
                      {p.subject_type === "opportunity" ? (
                        <Link className="c-btn-ghost" to="/negocios/$id" params={{ id: p.subject_id }}>Abrir contexto</Link>
                      ) : p.deal_id ? (
                        <Link
                          className="c-btn-ghost"
                          to="/negocios/$id"
                          params={{ id: p.deal_id }}
                          search={{ destaque: `seguimento:${p.subject_id}` }}
                        >
                          Abrir contexto
                        </Link>
                      ) : (
                        <button type="button" className="c-btn-ghost" onClick={() => openPriority(p)}>Abrir contexto</button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" className="c-btn-ghost ml-auto" aria-label="Mais ações">
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuItem asChild>
                            <Link to="/assessor">
                              <MessageSquare className="mr-2 h-3.5 w-3.5" /> Falar com {assessorName}
                            </Link>
                          </DropdownMenuItem>
                          {p.subject_type === "follow_up" && (
                            <DropdownMenuItem className="text-destructive" onSelect={() => void deletePriority(p)}>
                              <Archive className="mr-2 h-3.5 w-3.5" /> Arquivar
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>}
                  />
                ))}
                {settled.length > 0 && (
                  <div className="mt-3 border-t pt-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="c-muted text-xs">Já não se aplicam (estavam no briefing anterior):</p>
                      <Link to="/briefing/detalhes" className="c-btn-ghost shrink-0 text-xs">
                        Ver detalhes
                      </Link>
                    </div>
                    <div className="space-y-1.5">
                      {settled.map((s) => (
                        <Link
                          key={s.subject_id}
                          to="/briefing/detalhes"
                          hash={s.subject_id}
                          className="flex items-start gap-2 text-xs text-muted-foreground hover:opacity-80"
                        >
                          <span className="c-badge shrink-0">{s.state_label}</span>
                          <span className="min-w-0 flex-1">
                            <span className="line-through">{s.action}</span>
                            <span className="block">
                              {[s.origin_label, s.due_at ? formatData(s.due_at) : null].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* C. Próximos compromissos */}
            <Card className="c-card border-0 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="c-section-title flex items-center gap-2">
                  <CalendarClock className="h-4 w-4" style={{ color: "var(--muted)" }} /> Próximos compromissos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {eventosHoje.length === 0 && (
                  <div className="space-y-1">
                    <p className="c-muted text-sm">{agenda.emptyLabel}</p>
                    {tomorrowLabel(agenda.tomorrow) && (
                      <p className="text-sm" style={{ color: "var(--ink)" }}>
                        {tomorrowLabel(agenda.tomorrow)}
                      </p>
                    )}
                  </div>
                )}
                {eventosHoje.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => openEvent(e.id)}
                    className="c-card c-card-hover flex w-full items-start gap-3 p-3 text-left"
                  >
                    <div className="c-mono shrink-0 rounded-md px-2 py-1 text-xs font-semibold" style={{ background: "var(--amber-bg)", color: "var(--amber)" }}>
                      {e.time ?? "—"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold" style={{ color: "var(--ink)" }}>{e.title}</div>
                      <div className="c-muted text-xs">
                        {[nomePessoa(e.personId ?? undefined), tituloImovel(e.propertyId ?? undefined)].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "var(--muted)" }} />
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Coluna lateral — ou vista completa quando filtro ativo */}
        <div className="space-y-6">
          {/* D. Aguardam resultado */}
          <Card className="c-card border-0 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="c-section-title flex items-center gap-2">
                <Clock className="h-4 w-4" style={{ color: "var(--muted)" }} />
                {filtroAtivo ? "Imóveis por confirmar" : "Aguardam resultado"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {awaitingToShow.length === 0 && (
                <p className="c-muted text-sm">
                  {filtroAtivo
                    ? "Nenhuma ação por confirmar ligada a imóveis."
                    : "Não há nada a aguardar resultado."}
                </p>
              )}
              {awaitingToShow.map((a) => (
                <Link
                  key={a.id}
                  to="/seguimentos/$id"
                  params={{ id: a.id }}
                  className="c-card c-card-hover group block p-3 outline-none"
                  aria-label={`Abrir ${a.title}`}
                >
                  <div className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{a.title}</div>
                  <div className="c-mono c-muted text-xs">
                    {formatDataHora(a.due_at)}
                    {a.entity_label ? ` · ${a.entity_label}` : ""}
                    {a.property_id ? ` · ${tituloImovel(a.property_id) ?? "Imóvel"}` : ""}
                  </div>
                  {a.property_id && (
                    <Link
                      to="/imoveis/$id"
                      params={{ id: a.property_id }}
                      className="c-badge mt-1.5 inline-flex max-w-full truncate text-xs"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Home className="mr-1 h-3 w-3" /> {tituloImovel(a.property_id) ?? "Ver imóvel"}
                    </Link>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button type="button" className="c-btn" onClick={(e) => { e.preventDefault(); e.stopPropagation(); outcome.mutate({ id: a.id, outcome: "concluido" }); }}>Correu bem</button>
                    <button type="button" className="c-btn-ghost" onClick={(e) => { e.preventDefault(); e.stopPropagation(); outcome.mutate({ id: a.id, outcome: "precisa_nova_acao" }); }}>Precisa seguimento</button>
                    <button type="button" className="c-btn-ghost" onClick={(e) => { e.preventDefault(); e.stopPropagation(); outcome.mutate({ id: a.id, outcome: "nao_realizado" }); }}>Sem efeito</button>
                    <button type="button" className="c-btn-ghost" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setNoteFor(a); setNoteText(""); }}>
                      <StickyNote className="h-3.5 w-3.5" /> Nota
                    </button>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* E. Banner de atenção agregado, no fundo da página */}
      {!filtroAtivo && (atrasados.length > 0 || oportSemAcao.length > 0 || (docsPending.data ?? 0) > 0) && (
        <section className="c-alert mt-6">
          <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
            <AlertTriangle className="h-4 w-4" /> A precisar de atenção
          </div>
          <div className="grid gap-1">
            {atrasados.length > 0 && (
              <AlertRow to="/seguimentos" search={{ status: "overdue" }} icon={AlertTriangle} label={`${atrasados.length} seguimento${atrasados.length === 1 ? "" : "s"} em atraso`} />
            )}
            {oportSemAcao.length > 0 && (
              <AlertRow to="/negocios" icon={Briefcase} label={`${oportSemAcao.length} negócio${oportSemAcao.length === 1 ? "" : "s"} sem próxima ação · ${formatEUR(oportSemAcao.reduce((s, o) => s + o.valor, 0))} em risco`} />
            )}
            {(docsPending.data ?? 0) > 0 && (
              <AlertRow to="/documentos" icon={FileText} label={`${docsPending.data} documento${docsPending.data === 1 ? "" : "s"} por classificar`} />
            )}
          </div>
        </section>
      )}

      {/* FAB mobile */}
      <Link
        to="/assessor"
        className="fixed bottom-20 right-4 z-10 flex h-12 items-center gap-2 rounded-full px-4 text-sm font-semibold shadow-lg md:hidden"
        style={{ background: "var(--brass)", color: "#241703" }}
      >
        <MessageSquare className="h-4 w-4" /> Falar com {assessorName}
      </Link>

      <EventDrawer item={drawer} onClose={() => setDrawer(null)} />

      <Dialog open={!!noteFor} onOpenChange={(o) => { if (!o) setNoteFor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registar nota</DialogTitle>
          </DialogHeader>
          <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="O que aconteceu?" rows={4} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNoteFor(null)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (!noteFor) return;
                outcome.mutate({ id: noteFor.id, outcome: "precisa_nova_acao", notes: noteText || undefined });
                setNoteFor(null);
              }}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function AlertRow({
  to, search, icon: Icon, label,
}: {
  to: string;
  search?: Record<string, string>;
  icon: any;
  label: string;
}) {
  return (
    <Link
      to={to as any}
      search={search as any}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13.5px] outline-none transition-colors hover:bg-white/50"
      aria-label={label}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-70" />
      <span className="flex-1">{label}</span>
      <ChevronRight className="h-4 w-4 opacity-70" />
    </Link>
  );
}
