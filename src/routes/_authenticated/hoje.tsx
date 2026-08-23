import { appTitle } from "@/lib/brand";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { MobileFab } from "@/components/mobile-fab";
import { UI_EVENTS, trackCtaAfonso, trackUi } from "@/lib/telemetry/ui-events";
import { useStore } from "@/lib/store";
import { formatData, formatDataHora, formatEUR } from "@/lib/demo-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, CheckCircle2, Clock, MessageSquare,
  FileText, Briefcase, ChevronRight, MoreHorizontal, StickyNote, Archive,
  Home, X,
} from "lucide-react";
import { useAssessorName } from "@/lib/assessor/assessor-name";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { dismissPriority, getHojeSupreme } from "@/lib/assessor/supreme/priorities.functions";
import { getNextBestAction } from "@/lib/assessor/supreme/next-best-action.functions";
import { NextBestActionCard } from "@/components/hoje/next-best-action";
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
import { isOpenFollowUpStatus } from "@/lib/assessor/outcome-status";
import { getHojeOverview } from "@/lib/assessor/supreme/overview.functions";
import { saveMentorDecision, undoMentorDecision } from "@/lib/assessor/supreme/mentor-decisions.functions";
import { type MentorDecisionKind } from "@/lib/assessor/supreme/mentor-decisions";
import { createMentorFollowUp } from "@/lib/assessor/supreme/mentor-followup.functions";
import { mentorFollowUpSuggestion } from "@/lib/assessor/supreme/mentor-followup";
import { usePreviewTier } from "@/lib/subscription/tier-preview";
import { Lightbulb, ArrowRight } from "lucide-react";
import { HojeSumGrid } from "@/components/hoje/sum-grid";
import { OpportunityAlertsCard } from "@/components/hoje/opportunity-alerts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { isDealActive } from "@/lib/deals/stages";
import { useNow } from "@/hooks/use-now";
import { buildAgendaView, tomorrowLabel, type DayEvent } from "@/lib/agenda/day-events";
import { lisbonYmd } from "@/lib/assessor/lisbon-day";
import { fromSeguimento, isOverdueFollowUp, requiresOutcome } from "@/lib/follow-ups/pending";

type HojeSearch = { filtro?: "imoveis-por-confirmar" };

export const Route = createFileRoute("/_authenticated/hoje")({
  head: () => ({
    meta: [
      { title: appTitle("Hoje") },
      { name: "description", content: "Briefing diário, compromissos e prioridades do consultor." },
      { property: "og:title", content: appTitle("Hoje") },
      { property: "og:description", content: "Briefing diário, compromissos e prioridades do consultor." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): HojeSearch => {
    const filtro = s.filtro;
    return { filtro: filtro === "imoveis-por-confirmar" ? filtro : undefined };
  },
  component: HojePage,
});

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
  // Telemetria: uma abertura por carregamento da página.
  useEffect(() => {
    trackUi(UI_EVENTS.hojeVisto, {}, { once: "hoje-visto" });
  }, []);

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
  // Simulação "ver como" (super admin): o servidor reconfirma o papel.
  const previewTier = usePreviewTier();
  const overview = useQuery({
    queryKey: ["hoje", "overview", previewTier ?? "real"],
    queryFn: () => overviewQ({ data: { previewTier } }),
    retry: false,
  });
  const [tipOff, setTipOff] = useState<string | null>(null);
  const [factosAbertos, setFactosAbertos] = useState(false);
  const [ajusteAberto, setAjusteAberto] = useState(false);
  const [ajusteTexto, setAjusteTexto] = useState("");
  const [tratadoNota, setTratadoNota] = useState("");
  const [tratadoAberto, setTratadoAberto] = useState(false);
  const mentor = overview.data?.mentor ?? null;
  const resumo = overview.data?.summary ?? null;
  const tierInfo = overview.data?.tierInfo ?? null;

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

  // Prospeção saiu da barra lateral no redesenho v2: aparece aqui, e só
  // quando há mesmo placas por contactar.
  const designV2 = useDesignV2();
  const placasPorTratar = useQuery({
    queryKey: ["prospecting_leads", "to_contact", "count"],
    enabled: designV2,
    queryFn: async () => {
      const { count } = await supabase
        .from("prospecting_leads" as never)
        .select("id", { count: "exact", head: true })
        .eq("status", "to_contact")
        .is("archived_at", null);
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

  // Decisões sobre as sugestões do Mentor: ficam guardadas e mudam o que
  // aparece a seguir para o mesmo sinal (silêncio + retoma do assunto).
  const decisionFn = useServerFn(saveMentorDecision);
  const undoDecisionFn = useServerFn(undoMentorDecision);
  const mentorDecision = useMutation({
    mutationFn: (v: {
      tipKey: string;
      decision: MentorDecisionKind;
      note?: string | null;
    }) =>
      decisionFn({ data: v }),
    onSuccess: (_r, v) => {
      setAjusteAberto(false);
      setAjusteTexto("");
      setTratadoAberto(false);
      setTratadoNota("");
      setTipOff(v.tipKey);
      qc.invalidateQueries({ queryKey: ["hoje", "overview"] });
      if (v.decision === "tratado") {
        toast.success("Assunto dado como tratado — só volto se reaparecer.", {
          action: {
            label: "Desfazer",
            onClick: () => undoMentor.mutate({ tipKey: v.tipKey }),
          },
        });
      } else {
        toast.success(
          v.decision === "confirmar"
            ? "Anotado — não volto a insistir nos próximos dias."
            : v.decision === "editar"
            ? "Guardei o teu ajuste para a próxima vez."
            : "Não te volto a trazer este sinal tão cedo.",
        );
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const undoMentor = useMutation({
    mutationFn: (v: { tipKey: string }) => undoDecisionFn({ data: v }),
    onSuccess: () => {
      setTipOff(null);
      qc.invalidateQueries({ queryKey: ["hoje", "overview"] });
      toast.success("Desfeito — este sinal volta a ser considerado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [drawer, setDrawer] = useState<EventDrawerItem | null>(null);

  // Seguimento a partir da sugestão do Mentor: tipo, notas e prazo já preenchidos.
  const mentorFollowUpFn = useServerFn(createMentorFollowUp);
  const mentorFollowUp = useMutation({
    mutationFn: (v: { tipKey: string }) => mentorFollowUpFn({ data: v }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["follow_ups"] });
      qc.invalidateQueries({ queryKey: ["supreme", "hoje"] });
      toast.success(`Seguimento criado para ${r?.dueDate ?? "os próximos dias"}.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
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
    // Fonte única: banner, "Isto merece atenção" e "As minhas prioridades"
    // leem daqui — nunca cada um com a sua própria regra.
    () => seguimentos.filter((s) => isOverdueFollowUp(fromSeguimento(s as any), now)),
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

  // Nível 2: só se procura a "próxima melhor ação" quando nada arde.
  const nbaFn = useServerFn(getNextBestAction);
  const nba = useQuery({
    queryKey: ["hoje-next-best-action"],
    queryFn: () => nbaFn({}),
    enabled: priorities.length === 0,
    staleTime: 5 * 60_000,
  });
  const sugestao = priorities.length === 0 ? nba.data?.suggestion ?? null : null;

  const localAwaiting: Awaiting[] = useMemo(
    () => atrasados
      // Mesma regra do servidor: só compromissos de negócio pedem resultado.
      .filter((s) => s.tipo === "Evento" && requiresOutcome(fromSeguimento(s as any)))
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

  // Tom operacional de cada ação: a cor só existe quando indica consequência.
  const tomDe = (p: Priority): { tone: string; label: string } => {
    const atrasado = !!p.due_at && new Date(p.due_at) < now;
    if (atrasado) return { tone: "urgente", label: "Urgente · em atraso" };
    if (p.subject_type === "opportunity") return { tone: "oportunidade", label: "Oportunidade" };
    if (p.origin === "calendario" || p.reasons?.some((r) => r.toLowerCase().includes("compromisso"))) {
      return { tone: "espera", label: "Compromisso de hoje" };
    }
    return { tone: "risco", label: "Merece atenção" };
  };

  const cartaoAcao = (p: Priority, principal: boolean) => {
    const tom = tomDe(p);
    return (
      <article key={`${p.subject_type}:${p.subject_id}`} className={`c-act ${tom.tone}${principal ? " principal" : ""}`}>
        <span className="c-act-kicker">
          <AlertTriangle className="h-3.5 w-3.5" /> {tom.label}
        </span>
        <h3 className="c-act-title">{assuntoDe(p)}</h3>
        <p className="c-act-why">{fraseComAcao(p, explainPriority(p))}</p>
        <div className="c-act-meta">
          {[
            p.origin_label ?? (p.subject_type === "opportunity" ? "Negócio em curso" : "Seguimento"),
            p.entity_label,
            p.due_at ? formatData(p.due_at) : null,
            p.state_label ? `Estado: ${p.state_label}` : null,
          ].filter(Boolean).join(" · ")}
        </div>
        <div className="c-act-actions">
          {p.subject_type === "opportunity" ? (
            <Link className="c-act-primary" to="/negocios/$id" params={{ id: p.subject_id }}>
              <ArrowRight className="h-3.5 w-3.5" /> Tratar agora
            </Link>
          ) : p.subject_type === "property" ? (
            <Link className="c-act-primary" to="/imoveis/$id" params={{ id: p.subject_id }}>
              <ArrowRight className="h-3.5 w-3.5" /> Tratar agora
            </Link>
          ) : (
            <Link className="c-act-primary" to="/seguimentos/$id" params={{ id: p.subject_id }}>
              <ArrowRight className="h-3.5 w-3.5" /> Tratar agora
            </Link>
          )}
          <button type="button" className="c-act-second" onClick={() => savePriorityDone(p)}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Concluir
          </button>
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="c-act-second">Adiar</button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-40 p-1">
              <button className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted" onClick={() => snoozePriority(p, "1h")}>+1 hora</button>
              <button className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted" onClick={() => snoozePriority(p, "amanha")}>Amanhã</button>
              <button className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted" onClick={() => snoozePriority(p, "semana")}>Próxima semana</button>
            </PopoverContent>
          </Popover>
          {p.deal_id && p.deal_label ? (
            <Link
              className="c-act-quiet"
              to="/negocios/$id"
              params={{ id: p.deal_id }}
              search={p.subject_type === "follow_up" ? { destaque: `seguimento:${p.subject_id}` } : {}}
            >
              <Briefcase className="h-3.5 w-3.5" /> {p.deal_label}
            </Link>
          ) : (
            <button type="button" className="c-act-quiet" onClick={() => openPriority(p)}>Abrir contexto</button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="c-act-quiet ml-auto" aria-label="Mais ações">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild>
                <Link to="/assessor" onClick={() => trackCtaAfonso("menu_prioridade")}>
                  <MessageSquare className="mr-2 h-3.5 w-3.5" /> Falar com {assessorName}
                </Link>
              </DropdownMenuItem>
              {p.subject_type === "follow_up" && (
                <DropdownMenuItem onSelect={() => dismiss.mutate({ id: p.subject_id })}>
                  Não é prioridade
                </DropdownMenuItem>
              )}
              {p.subject_type === "follow_up" && (
                <DropdownMenuItem className="text-destructive" onSelect={() => void deletePriority(p)}>
                  <Archive className="mr-2 h-3.5 w-3.5" /> Arquivar
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </article>
    );
  };

  return (
    <AppShell>
      {/* A. A pergunta que abre o dia — ações antes de indicadores. */}
      <header className="mb-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <h1 className="c-focus-title">O que precisa da tua atenção?</h1>
            <p className="c-focus-sub">
              {greeting(now)}{firstName ? `, ${firstName}` : ""}. {prioridadesCount === 0
                ? "Nada urgente neste momento."
                : `${prioridadesCount} ação${prioridadesCount === 1 ? "" : "ões"} por decidir`}
              {compromissosCount > 0 ? ` · ${compromissosCount} compromisso${compromissosCount === 1 ? "" : "s"} hoje` : ""}
              {" · "}
              <span className="c-mono c-muted text-xs">
                {new Intl.DateTimeFormat("pt-PT", { weekday: "long", day: "2-digit", month: "long" }).format(now)}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link to="/assessor" className="c-cta hidden md:inline-flex" onClick={() => trackCtaAfonso("cabecalho")}>
              <MessageSquare className="h-4 w-4" /> Falar com {assessorName}
            </Link>
          </div>
        </div>
      </header>

      {/* Filtro rápido: só aparece quando há mesmo imóveis por confirmar. */}
      {(filtroAtivo || awaitingImoveis.length > 0) && (
        <div className="mb-5 flex items-center gap-2">
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
            {filtroAtivo
              ? "A mostrar imóveis por confirmar"
              : `${awaitingImoveis.length} imóve${awaitingImoveis.length === 1 ? "l aguarda" : "is aguardam"} confirmação — Rever agora`}
            {filtroAtivo && <X className="h-3.5 w-3.5" />}
          </button>
          {filtroAtivo && (
            <span className="text-[12px]" style={{ color: "var(--muted)" }}>
              {awaitingImoveis.length} ação{awaitingImoveis.length === 1 ? "" : "ões"}
            </span>
          )}
        </div>
      )}


      {designV2 && (placasPorTratar.data ?? 0) > 0 && !filtroAtivo && (
        <div className="mb-4">
          <Link
            to="/oportunidades/prospecao"
            className="tap-44 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold"
            style={{ borderColor: "var(--line)", color: "var(--ink-soft)", background: "var(--c-card)" }}
          >
            <MapPin className="h-3.5 w-3.5" />
            {placasPorTratar.data} placa{placasPorTratar.data === 1 ? "" : "s"} por contactar
          </Link>
        </div>
      )}

      {/* B. As decisões do dia, por ordem de impacto. */}
      {!filtroAtivo && (
        <section className="mb-8 space-y-3">
          {priorities.length === 0 ? (
            sugestao ? (
              <NextBestActionCard suggestion={sugestao} assessorName={assessorName} />
            ) : (
              <div className="c-empty compacta">Nada urgente neste momento. O {assessorName} avisa-te quando algo mudar.</div>
            )
          ) : (
            priorities.map((p, i) => cartaoAcao(p, i === 0))
          )}
          {settled.length > 0 && (
            <div className="pt-1">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="c-muted text-xs">Já não se aplicam (estavam no briefing anterior):</p>
                <Link to="/briefing/detalhes" className="c-btn-ghost shrink-0 text-xs">Ver detalhes</Link>
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
        </section>
      )}

      {/* C. Compromissos seguintes e itens à espera de terceiros. */}
      <div className={filtroAtivo ? "space-y-8" : "mb-8 grid gap-8 lg:grid-cols-2"}>
        {!filtroAtivo && (
          <section>
            <div className="c-minihead">Próximos compromissos</div>
            <div className="space-y-2">
              {eventosHoje.length === 0 && (
                <div className="space-y-1">
                  <p className="c-muted text-sm">{agenda.emptyLabel}</p>
                  {tomorrowLabel(agenda.tomorrow) && (
                    <p className="text-sm" style={{ color: "var(--ink)" }}>{tomorrowLabel(agenda.tomorrow)}</p>
                  )}
                </div>
              )}
              {eventosHoje.map((e) => (
                <button key={e.id} type="button" onClick={() => openEvent(e.id)} className="c-row">
                  <span className="c-row-time">{e.time ?? "—"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="c-row-title block truncate">{e.title}</span>
                    <span className="c-row-meta block">
                      {[nomePessoa(e.personId ?? undefined), tituloImovel(e.propertyId ?? undefined)].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </span>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0" style={{ color: "var(--muted)" }} />
                </button>
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="c-minihead">
            {filtroAtivo ? "Imóveis por confirmar" : "À espera de terceiros"}
          </div>
          <div className="space-y-2">
            {awaitingToShow.length === 0 && (
              <p className="c-muted text-sm">
                {filtroAtivo
                  ? "Nenhuma ação por confirmar ligada a imóveis."
                  : "Não há nada à espera de resposta de terceiros."}
              </p>
            )}
            {awaitingToShow.map((a) => (
              <div key={a.id} className="c-row flex-col items-stretch">
                <Link to="/seguimentos/$id" params={{ id: a.id }} className="block" aria-label={`Abrir ${a.title}`}>
                  <span className="c-row-title block">{a.title}</span>
                  <span className="c-row-meta block">
                    <Clock className="mr-1 inline h-3 w-3" />
                    {formatDataHora(a.due_at)}
                    {a.entity_label ? ` · ${a.entity_label}` : ""}
                    {a.property_id ? ` · ${tituloImovel(a.property_id) ?? "Imóvel"}` : ""}
                  </span>
                </Link>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <button type="button" className="c-act-second" onClick={() => outcome.mutate({ id: a.id, outcome: "concluido" })}>Correu bem</button>
                  <button type="button" className="c-act-quiet" onClick={() => outcome.mutate({ id: a.id, outcome: "precisa_nova_acao" })}>Precisa seguimento</button>
                  <button type="button" className="c-act-quiet" onClick={() => outcome.mutate({ id: a.id, outcome: "nao_realizado" })}>Sem efeito</button>
                  <button type="button" className="c-act-quiet" onClick={() => { setNoteFor(a); setNoteText(""); }}>
                    <StickyNote className="h-3.5 w-3.5" /> Nota
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* D. Oportunidades detetadas — resumo agregado, com ação em cada alerta. */}
      {!filtroAtivo && (
        <section className="mb-8">
          <OpportunityAlertsCard />
        </section>
      )}

      {/* E. Sugestão do mentor — conselho, não urgência. */}
      {!filtroAtivo && mentor && tipOff !== mentor.key && (
        <section className="c-mentor mb-8">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="c-mentor-tag">
              <Lightbulb className="h-4 w-4" /> O teu mentor sugere
            </div>
            {tierInfo?.effectiveTier ? (
              <Badge variant="secondary" className="text-[11px] font-normal capitalize">
                {tierInfo.effectiveTier}
              </Badge>
            ) : null}
          </div>
          {tierInfo ? (
            <p className="mb-2 text-[11.5px]" style={{ color: "var(--muted)" }}>
              Fonte: {tierInfo.source === "preview" ? "simulação de super admin" : "subscrição real"}
            </p>
          ) : null}
          <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--ink)" }}>{mentor.text}</p>
          {mentor.context ? (
            <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--ink)" }}>
              {mentor.context}
            </p>
          ) : null}
          {mentor.reason || mentor.facts ? (
            <div className="mt-3">
              <button
                type="button"
                className="text-[12px] font-semibold"
                style={{ color: "var(--muted)" }}
                onClick={() => setFactosAbertos((v) => !v)}
                aria-expanded={factosAbertos}
              >
                {factosAbertos ? "Esconder de onde vem" : "De onde vem isto?"}
              </button>
              {factosAbertos && mentor.reason ? (
                <p className="mt-2 text-[12px] leading-relaxed" style={{ color: "var(--muted)" }}>
                  Porquê: {mentor.reason}
                </p>
              ) : null}
              {factosAbertos && mentor.facts ? (
                <ul className="mt-2 space-y-1 text-[12.5px]" style={{ color: "var(--muted)" }}>
                  <li>Leads novas (7 dias): {mentor.facts.leadsSemana}</li>
                  <li>Seguimentos fechados (7 dias): {mentor.facts.seguimentosFechados}</li>
                  <li>Negócios movidos (7 dias): {mentor.facts.negociosMovidos}</li>
                  <li>
                    Dias sem contacto:{" "}
                    {mentor.facts.diasSemContacto === null ? "sem registo" : mentor.facts.diasSemContacto}
                  </li>
                </ul>
              ) : null}
            </div>
          ) : null}
          <div className="mt-3 flex items-center gap-3">
            <Link to={mentor.to as never} className="text-[12.5px] font-semibold" style={{ color: "var(--sage)" }}>
              {mentor.linkLabel}
            </Link>
            <button
              type="button"
              className="text-[12.5px] font-semibold"
              style={{ color: "var(--sage)" }}
              disabled={mentorDecision.isPending}
              onClick={() => mentorDecision.mutate({ tipKey: mentor.key, decision: "confirmar" })}
            >
              Confirmar
            </button>
            <button
              type="button"
              className="text-[12.5px] font-semibold"
              style={{ color: "var(--sage)" }}
              disabled={mentorDecision.isPending}
              title="Dou este assunto como resolvido — deixa de aparecer nas próximas semanas."
              onClick={() => setTratadoAberto((v) => !v)}
            >
              Já tratei
            </button>
            {mentorFollowUpSuggestion(mentor.key) ? (
              <button
                type="button"
                className="text-[12.5px] font-semibold"
                style={{ color: "var(--sage)" }}
                disabled={mentorFollowUp.isPending}
                title={`${mentorFollowUpSuggestion(mentor.key)!.title} — daqui a ${mentorFollowUpSuggestion(mentor.key)!.dueInDays} dias`}
                onClick={() => mentorFollowUp.mutate({ tipKey: mentor.key })}
              >
                {mentorFollowUp.isPending ? "A criar…" : "Criar seguimento"}
              </button>
            ) : null}
            <button
              type="button"
              className="text-[12.5px] font-semibold"
              style={{ color: "var(--muted)" }}
              onClick={() => setAjusteAberto((v) => !v)}
            >
              Editar
            </button>
            <button
              type="button"
              className="text-[12.5px] font-semibold"
              style={{ color: "var(--muted)" }}
              disabled={mentorDecision.isPending}
              onClick={() => mentorDecision.mutate({ tipKey: mentor.key, decision: "cancelar" })}
            >
              Cancelar
            </button>
          </div>
          {ajusteAberto ? (
            <div className="mt-2">
              <textarea
                className="w-full rounded-md border p-2 text-[12.5px]"
                rows={2}
                placeholder="O que devia ser diferente nesta sugestão?"
                value={ajusteTexto}
                onChange={(e) => setAjusteTexto(e.target.value)}
              />
              <div className="mt-1 flex items-center gap-3">
                <button
                  type="button"
                  className="text-[12.5px] font-semibold"
                  style={{ color: "var(--sage)" }}
                  disabled={mentorDecision.isPending}
                  onClick={() =>
                    mentorDecision.mutate({ tipKey: mentor.key, decision: "editar", note: ajusteTexto })
                  }
                >
                  Guardar ajuste
                </button>
                <button
                  type="button"
                  className="text-[12.5px] font-semibold"
                  style={{ color: "var(--muted)" }}
                  onClick={() => setAjusteAberto(false)}
                >
                  Fechar
                </button>
              </div>
            </div>
          ) : null}
          {tratadoAberto ? (
            <div className="mt-2">
              <textarea
                className="w-full rounded-md border p-2 text-[12.5px]"
                rows={2}
                placeholder="Porque é que este assunto está tratado? (opcional — ajuda a afinar sugestões futuras)"
                value={tratadoNota}
                onChange={(e) => setTratadoNota(e.target.value)}
              />
              <div className="mt-1 flex items-center gap-3">
                <button
                  type="button"
                  className="text-[12.5px] font-semibold"
                  style={{ color: "var(--sage)" }}
                  disabled={mentorDecision.isPending}
                  onClick={() =>
                    mentorDecision.mutate({ tipKey: mentor.key, decision: "tratado", note: tratadoNota })
                  }
                >
                  {mentorDecision.isPending ? "A guardar…" : "Guardar"}
                </button>
                <button
                  type="button"
                  className="text-[12.5px] font-semibold"
                  style={{ color: "var(--muted)" }}
                  onClick={() => {
                    setTratadoAberto(false);
                    setTratadoNota("");
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}
        </section>
      )}

      {/* F. Indicadores da carteira — informação, não decisão. Fica no fim. */}
      {!filtroAtivo && resumo && (
        <section className="c-strip mb-6">
          <HojeSumGrid
            resumo={{
              ...resumo,
              agenda: {
                today: agenda.todayCount,
                nextLabel: agenda.next?.title ?? null,
                nextTime: agenda.next?.time ?? null,
                meta: agenda.cardMeta,
              },
            }}
          />
        </section>
      )}

      {/* G. Banda de atenção agregada. */}
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

      {/* H. Campo permanente para falar com o Afonso (desktop; em mobile é o FAB). */}
      <Link to="/assessor" className="c-askbar hidden md:flex" onClick={() => trackCtaAfonso("barra")}>
        <MessageSquare className="h-4 w-4" style={{ color: "var(--gold)" }} />
        <span>Diz ao {assessorName} o que aconteceu, ou pergunta-lhe o que quiseres…</span>
        <span className="c-askbar-go">Falar <ArrowRight className="h-3.5 w-3.5" /></span>
      </Link>

      {/* FAB mobile — única instância visível em mobile (o CTA do cabeçalho é desktop). */}
      <MobileFab>
        <Link
          to="/assessor"
          onClick={() => trackCtaAfonso("fab")}
          className="flex h-12 items-center gap-2 rounded-full px-4 text-sm font-semibold shadow-lg"
          style={{ background: "var(--brass)", color: "#241703" }}
        >
          <MessageSquare className="h-4 w-4" /> Falar com {assessorName}
        </Link>
      </MobileFab>

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
