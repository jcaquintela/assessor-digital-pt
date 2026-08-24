import { appTitle } from "@/lib/brand";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { toast } from "sonner";
import { loadMessages, loadOlderMessages, mergeMessages, RECENT_PAGE, type MensagemDb } from "@/lib/assessor/messages";
import { supabase } from "@/integrations/supabase/client";
import { useAssessorName } from "@/lib/assessor/assessor-name";
import { CHANNEL_LABEL, useLinkedChannel } from "@/lib/assessor/use-linked-channel";
import { cn } from "@/lib/utils";
import { MessageCircle, SendHorizonal, Loader2, Copy, Check, Wifi, WifiOff, RefreshCw } from "lucide-react";
import {
  CONNECT_TIMEOUT_MS,
  healthLabel,
  mapSubscribeStatus,
  pollIntervalMs,
  type RealtimeHealth,
} from "@/lib/assessor/realtime-health";
import { useServerFn } from "@tanstack/react-start";
import {
  sendDashboardMessage,
  DASHBOARD_CHAT_MIN_TIER,
  DASHBOARD_CHAT_ERROR,
} from "@/lib/assessor/dashboard-chat.functions";
import {
  makePending,
  reconcilePending,
  withTimeout,
  TIMEOUT_MESSAGE,
  STATUS_LABEL,
  PROCESSING_AFTER_MS,
  setStatus,
  type MessageStatus,
  type PendingMessage,
} from "@/lib/assessor/dashboard-chat-ui";
import { useEffectiveTier } from "@/lib/subscription/use-effective-tier";
import { tierAtLeast } from "@/lib/subscription/tiers";
import { AI_DISCLOSURE } from "@/lib/assessor/ai-disclosure";
import { normalizeSuggestedText } from "@/lib/assessor/culture/suggested-message";
import {
  BulkArchiveConfirmCard,
  usePendingBulkArchive,
} from "@/components/assessor/bulk-archive-confirm";
import {
  PendingConfirmationBanner,
  ReplyQuoteChip,
  usePendingConfirmation,
} from "@/components/assessor/pending-confirmation";
import {
  PersonChoiceCard,
  usePendingPersonChoice,
} from "@/components/assessor/person-choice-card";

export const Route = createFileRoute("/_authenticated/assessor")({

  head: () => ({
    meta: [
      { title: appTitle("Conversa") },
      { name: "description", content: "Histórico da tua conversa com o Afonso." },
      { property: "og:title", content: appTitle("Conversa") },
      { property: "og:description", content: "Histórico da tua conversa com o Afonso." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssessorPage,
});

/**
 * Apps instaladas antes da mudança de arranque guardaram "/assessor" como
 * start_url. Se a app abrir a frio (standalone, sem histórico) nesta rota,
 * reencaminhamos para "Hoje" — sem reinstalar.
 */
function useRedirectColdLaunchToHoje() {
  const navigate = useNavigate();
  useEffect(() => {
    if (typeof window === "undefined") return;
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (!standalone) return;
    if (window.history.length > 1) return;
    if (document.referrer) return;
    navigate({ to: "/hoje", replace: true });
  }, [navigate]);
}

function formatHora(iso: string) {
  return new Intl.DateTimeFormat("pt-PT", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function formatDia(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Hoje";
  const ontem = new Date(now); ontem.setDate(ontem.getDate() - 1);
  if (d.toDateString() === ontem.toDateString()) return "Ontem";
  return new Intl.DateTimeFormat("pt-PT", { weekday: "long", day: "2-digit", month: "long" }).format(d);
}

function AssessorPage() {
  useRedirectColdLaunchToHoje();
  const { name: assessorName } = useAssessorName();
  const { channel } = useLinkedChannel();
  const [recentMsgs, setRecentMsgs] = useState<MensagemDb[]>([]);
  // Histórico antigo carregado a pedido. Fica separado da janela recente para
  // que os recarregamentos nunca substituam nem escondam mensagens novas.
  const [olderMsgs, setOlderMsgs] = useState<MensagemDb[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [noMoreOlder, setNoMoreOlder] = useState(false);
  const msgs = useMemo(() => mergeMessages(olderMsgs, recentMsgs), [olderMsgs, recentMsgs]);
  // A conversa do painel é só o dia corrente. Rever dias anteriores é outro
  // fluxo (por construir), por isso não oferecemos "carregar mais antigas".
  const podeCarregarAntigas = false && !noMoreOlder && recentMsgs.length >= RECENT_PAGE;
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { data: tierData } = useEffectiveTier();
  // Escrita no painel é Pro e Team. Base e Consultor mantêm a vista de só
  // leitura — não mostramos caixa de texto nem promessa de resposta.
  const canWrite = tierAtLeast(tierData?.tier, DASHBOARD_CHAT_MIN_TIER);
  const send = useServerFn(sendDashboardMessage);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  // A mensagem do consultor aparece já na conversa; o motor pode demorar.
  const [pendingMsgs, setPendingMsgs] = useState<PendingMessage[]>([]);
  // Confirmação de arquivo em lote: a lista numerada passa a cartão com
  // botões, em vez de obrigar a escrever "sim".
  const { pending: pendingBulk, reload: reloadBulk } = usePendingBulkArchive(msgs.length);
  const [bulkBusy, setBulkBusy] = useState(false);
  // Pergunta em aberto: o consultor vê que há algo à espera dele, qual é a
  // pergunta exacta e até quando pode responder (24h).
  const { pending: pendingConfirm, reload: reloadConfirm } = usePendingConfirmation(msgs.length);
  // Associação de contacto: candidatos com contexto e botões, em vez de
  // obrigar a escrever o nome outra vez.
  const { pending: pendingPerson, reload: reloadPerson } = usePendingPersonChoice(msgs.length);
  const [personBusy, setPersonBusy] = useState(false);
  // Saúde do websocket: se não ligar (ou cair), passamos a consultar e
  // dizemo-lo — nada fica em silêncio a fingir que está ligado.
  const [health, setHealth] = useState<RealtimeHealth>("connecting");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const reload = () => {
      loadMessages(RECENT_PAGE)
        .then((rows) => {
          if (cancelled) return;
          setRecentMsgs(rows);
          setPendingMsgs((p) => reconcilePending(p, rows));
          setLoading(false);
        })
        .catch((e) => { if (!cancelled) { toast.error((e as Error).message); setLoading(false); } });
    };
    reload();
    const ch = supabase
      .channel("assessor_messages_stream")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "assessor_messages" }, reload)
      .subscribe((status) => {
        if (cancelled) return;
        setHealth(mapSubscribeStatus(status as string));
      });
    // Se a ligação não se estabelecer a tempo, assumimos indisponível.
    const guard = setTimeout(() => {
      if (cancelled) return;
      setHealth((h) => (h === "connecting" ? "degraded" : h));
    }, CONNECT_TIMEOUT_MS);
    return () => { cancelled = true; clearTimeout(guard); supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [recentMsgs.length, pendingMsgs.length]);

  // Rede de segurança: consultamos a conversa ao ritmo que a saúde da ligação
  // pedir — rápido quando há mensagens por resolver ou o websocket caiu,
  // devagar quando está tudo ligado.
  const temPorResolver = sending || pendingMsgs.some((p) => !p.failed);
  const ritmo = pollIntervalMs(health, temPorResolver);
  useEffect(() => {
    const t = setInterval(() => {
      loadMessages(RECENT_PAGE)
        .then((rows) => {
          setRecentMsgs(rows);
          setPendingMsgs((p) => reconcilePending(p, rows));
        })
        .catch(() => {});
    }, ritmo);
    return () => clearInterval(t);
  }, [ritmo]);

  const actualizarAgora = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const rows = await loadMessages(RECENT_PAGE);
      setRecentMsgs(rows);
      setPendingMsgs((p) => reconcilePending(p, rows));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  };

  const carregarAntigas = async () => {
    if (loadingOlder) return;
    const primeira = msgs[0];
    if (!primeira) return;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const antes = el ? el.scrollHeight - el.scrollTop : 0;
    try {
      const rows = await loadOlderMessages(primeira.created_at);
      if (rows.length === 0) setNoMoreOlder(true);
      else setOlderMsgs((p) => mergeMessages(rows, p));
      // Mantemos o ponto de leitura: o que estava à vista continua à vista.
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - antes;
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoadingOlder(false);
    }
  };

  const canalLabel = channel ? CHANNEL_LABEL[channel] : "WhatsApp";

  // Atalho global: Ctrl/Cmd + Shift + C copia o último texto sugerido,
  // sem ser preciso ir com o rato ao botão.
  const lastSuggestion = (() => {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i]!;
      if (m.role !== "user" && (m.message_type as string | null) === "suggested_message") {
        return normalizeSuggestedText(m.content);
      }
    }
    return "";
  })();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return;
      if (e.key.toLowerCase() !== "c") return;
      if (!lastSuggestion) return;
      e.preventDefault();
      void copySuggested(lastSuggestion);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lastSuggestion]);

  const enviar = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    const pending = makePending(text);
    setSending(true);
    setDraft("");
    setPendingMsgs((p) => [...p, pending]);
    // Passados alguns segundos deixa de ser "a enviar": está no motor.
    const toProcessing = setTimeout(
      () => setPendingMsgs((p) => p.map((m) => (m.id === pending.id && !m.failed ? setStatus(m, "processing") : m))),
      PROCESSING_AFTER_MS,
    );
    try {
      const race = await withTimeout(send({ data: { text } }));
      if (!race.ok) {
        marcarFalha(pending.id);
        toast.error(TIMEOUT_MESSAGE);
      } else if (race.value && race.value.ok === false) {
        marcarFalha(pending.id);
        toast.error(race.value.error || DASHBOARD_CHAT_ERROR);
      } else if (race.value && "stillProcessing" in race.value && race.value.stillProcessing) {
        // O servidor confirmou que recebeu; a resposta ainda vem a caminho.
        setPendingMsgs((p) => p.map((m) => (m.id === pending.id ? setStatus(m, "processing") : m)));
      } else {
        setPendingMsgs((p) => p.map((m) => (m.id === pending.id ? setStatus(m, "sent") : m)));
        // O histórico real chega por Realtime; recarregamos para garantir.
        const rows = await loadMessages(RECENT_PAGE).catch(() => null);
        if (rows) {
          setRecentMsgs(rows);
          setPendingMsgs((p) => reconcilePending(p, rows));
        }
      }
    } catch (e) {
      marcarFalha(pending.id);
      toast.error((e as Error).message || DASHBOARD_CHAT_ERROR);
    } finally {
      clearTimeout(toProcessing);
      setSending(false);
      void reloadConfirm();
    }
  };

  const marcarFalha = (id: string) =>
    setPendingMsgs((p) => p.map((m) => (m.id === id ? setStatus(m, "failed") : m)));

  const reenviar = (m: PendingMessage) => {
    // Fica visível como "reagendado" por instantes: nada desaparece sem aviso.
    setPendingMsgs((p) => p.map((x) => (x.id === m.id ? setStatus(x, "requeued") : x)));
    setTimeout(() => setPendingMsgs((p) => p.filter((x) => x.id !== m.id)), 1200);
    setDraft(m.content);
  };

  const responderLote = async (answer: "sim" | "não") => {
    if (bulkBusy) return;
    setBulkBusy(true);
    try {
      await send({ data: { text: answer } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBulkBusy(false);
      void reloadBulk();
      void reloadConfirm();
    }
  };

  const responderPessoa = async (text: string) => {
    if (personBusy) return;
    setPersonBusy(true);
    try {
      await send({ data: { text } });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPersonBusy(false);
      void reloadPerson();
      void reloadConfirm();
    }
  };

  return (
    <AppShell fullBleed>
      <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] md:h-[calc(100vh-7rem)] md:overflow-hidden md:rounded-[16px] md:border md:border-[var(--line)] md:bg-white md:shadow-[var(--c-shadow)]">
        {/* Cabeçalho */}
        <div
          className="flex items-center gap-3 border-b border-[var(--line)] bg-[var(--paper-2)] px-4 py-3"
          style={{ paddingTop: "max(env(safe-area-inset-top), 0.75rem)" }}
        >
          <div className="c-avatar">{(assessorName || "A").trim().charAt(0).toUpperCase()}</div>
          <div className="min-w-0">
            <div className="c-serif truncate text-[15px]">{assessorName}</div>
            <div className="c-muted text-[11.5px]">
              Assistente de IA · {canWrite ? `escreve aqui ou pelo ${canalLabel}` : `conversa via ${canalLabel}, só leitura`}
            </div>
            {lastSuggestion && (
              <div className="c-muted hidden text-[11px] md:block">
                Atalho: {isMac() ? "⌘" : "Ctrl"} + Shift + C copia o último texto sugerido
              </div>
            )}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-[11px]",
                health === "degraded" ? "text-[var(--danger,#b3261e)]" : "c-muted",
              )}
              aria-live="polite"
              title={healthLabel(health, temPorResolver)}
            >
              {health === "live" ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{healthLabel(health, temPorResolver)}</span>
            </span>
            {health !== "live" && (
              <button
                type="button"
                onClick={() => void actualizarAgora()}
                aria-label="Actualizar conversa agora"
                className="inline-flex items-center gap-1 rounded-md border border-[var(--line)] px-2 py-1 text-[11px]"
              >
                <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
                Actualizar
              </button>
            )}
          </div>
        </div>

        {/* Histórico */}
        <div ref={scrollRef} className="min-h-0 overflow-y-auto px-3 py-4 md:px-6" style={{ WebkitOverflowScrolling: "touch" }}>
          {loading && <p className="c-muted text-center text-sm">A carregar…</p>}
          {!loading && podeCarregarAntigas && (
            <div className="mb-3 flex justify-center">
              <button
                type="button"
                onClick={() => void carregarAntigas()}
                disabled={loadingOlder}
                className="rounded-full border border-[var(--line)] px-3 py-1.5 text-[12px] disabled:opacity-60"
              >
                {loadingOlder ? "A carregar…" : "Carregar mais antigas"}
              </button>
            </div>
          )}
          {!loading && pendingConfirm && !pendingBulk && !pendingPerson && (
            <PendingConfirmationBanner pending={pendingConfirm} channel={pendingConfirm.channel} />
          )}
          {!loading && msgs.length === 0 && (
            <div className="c-empty mx-auto mt-8 max-w-md">
              <MessageCircle className="mx-auto mb-2 h-5 w-5" />
              {AI_DISCLOSURE}
              <br />
              Ainda não há mensagens hoje.
              <br />
              {canWrite
                ? <>Escreve aqui em baixo ou pelo {canalLabel}. É a mesma conversa.</>
                : <>Fala com {`o ${assessorName}`} pelo {canalLabel}. O histórico aparece aqui.</>}
            </div>
          )}
          <div className="mx-auto flex max-w-3xl flex-col gap-2">
            {msgs.map((m, i) => {
              const prev = msgs[i - 1];
              const showDivider = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
              const isUser = m.role === "user";
              const isLast = i === msgs.length - 1;
              // A pergunta do lote deixa de ser texto: vira cartão com a
              // lista à vista e dois botões inequívocos.
              const isBulkQuestion =
                !isUser &&
                isLast &&
                !!pendingBulk &&
                m.content.trim() === pendingBulk.question.trim();
              if (isBulkQuestion && pendingBulk) {
                return (
                  <div key={m.id}>
                    {showDivider && <div className="c-daysep">{formatDia(m.created_at)}</div>}
                    <div className="flex justify-start">
                      <BulkArchiveConfirmCard
                        pending={pendingBulk}
                        busy={bulkBusy || sending}
                        onAnswer={(a) => void responderLote(a)}
                      />
                    </div>
                  </div>
                );
              }
              // A pergunta "qual deles é?" vira cartão com os candidatos e o
              // contexto que os distingue.
              const isPersonQuestion =
                !isUser &&
                isLast &&
                !!pendingPerson &&
                m.content.trim() === pendingPerson.question.trim();
              if (isPersonQuestion && pendingPerson) {
                return (
                  <div key={m.id}>
                    {showDivider && <div className="c-daysep">{formatDia(m.created_at)}</div>}
                    <div className="flex justify-start">
                      <PersonChoiceCard
                        pending={pendingPerson}
                        busy={personBusy || sending}
                        onAnswer={(t) => void responderPessoa(t)}
                      />
                    </div>
                  </div>
                );
              }
              // Texto sugerido para reenviar chega como mensagem isolada:
              // aqui o equivalente ao long-press do WhatsApp é o "Copiar".
              const isSuggestion = !isUser && (m.message_type as string | null) === "suggested_message";
              return (
                <div key={m.id}>
                  {showDivider && <div className="c-daysep">{formatDia(m.created_at)}</div>}
                   <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
                     <div
                       className={cn(
                         "c-bubble",
                         isUser ? "user" : "bot",
                         isSuggestion && "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink,#333)]",
                       )}
                       {...(isSuggestion
                         ? {
                             tabIndex: 0,
                             role: "group",
                             "aria-label": "Mensagem sugerida. Ctrl ou Cmd + C para copiar.",
                             onKeyDown: (e: React.KeyboardEvent) => {
                               const isCopy = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c";
                               const isShortcut = !e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "c";
                               if (!isCopy && !isShortcut) return;
                               // Se o consultor já selecionou texto à mão, não interferimos.
                               if (isCopy && String(window.getSelection() ?? "").trim()) return;
                               e.preventDefault();
                               void copySuggested(normalizeSuggestedText(m.content));
                             },
                           }
                         : {})}
                     >
                       {/* Mesma normalização do que sai no canal: o que se vê é o que se copia. */}
                       <span className="whitespace-pre-line">
                         {isSuggestion ? normalizeSuggestedText(m.content) : m.content}
                       </span>
                       {isSuggestion && <CopyButton text={normalizeSuggestedText(m.content)} />}
                       <span className={cn("c-when flex items-center gap-1.5", isUser ? "justify-end" : "justify-start")}>
                         {formatHora(m.created_at)}
                         {/* Mesma conversa, canais diferentes: mostramos a origem
                             quando não veio do próprio painel. */}
                         {m.channel && m.channel !== "dashboard" && (
                           <span className="rounded-full border border-[var(--line)] px-1.5 text-[10px] uppercase tracking-wide">
                             {m.channel === "whatsapp" ? "WhatsApp" : m.channel === "telegram" ? "Telegram" : m.channel}
                           </span>
                         )}
                         {isUser && <StatusChip status="sent" />}
                       </span>
                     </div>
                   </div>
                </div>
              );
            })}
            {/* Mensagens já enviadas, à espera do motor: visíveis desde o
                primeiro segundo, mesmo que a resposta demore. */}
            {pendingMsgs.map((p) => (
              <div key={p.id} className="flex justify-end">
                <div className={cn("c-bubble user", p.failed ? "opacity-70" : "opacity-60")}>
                  <span className="whitespace-pre-line">{p.content}</span>
                  <span className="c-when flex justify-end">
                    <StatusChip status={p.status} />
                  </span>
                  {p.failed && (
                    <button
                      type="button"
                      className="mt-1 block text-[12px] underline"
                      onClick={() => reenviar(p)}
                    >
                      Tentar de novo
                    </button>
                  )}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="c-bubble bot flex items-center gap-2 opacity-70">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span className="text-[13px]">{assessorName} está a pensar…</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Rodapé fixo */}
        <div className="c-chatbar" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)" }}>
          {canWrite ? (
            <>
            {pendingConfirm && !pendingBulk && <ReplyQuoteChip question={pendingConfirm.question} />}
            {/* Entrada explícita no treino: o estado nasce deste clique, não da
                interpretação do texto enviado. */}
            <div className="mx-auto mb-2 flex w-full max-w-3xl justify-start">
              <button
                type="button"
                disabled={treinoBusy || sending}
                onClick={() => void comecarTreino()}
                className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-[12.5px] disabled:opacity-40"
              >
                {treinoBusy ? "A preparar treino…" : "Treino de objeções"}
              </button>
            </div>
            <form
              className="mx-auto flex w-full max-w-3xl items-end gap-2"
              onSubmit={(e) => { e.preventDefault(); void enviar(); }}
            >
              <textarea
                rows={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(); }
                }}
                placeholder={`Escreve ao ${assessorName}…`}
                aria-label="Mensagem para o assessor"
                className="max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-[12px] border border-[var(--line)] bg-white px-3 py-2 text-[15px] outline-none focus:border-[var(--ink-3,#999)]"
              />
              <button
                type="submit"
                disabled={!draft.trim() || sending}
                aria-label="Enviar"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-white disabled:opacity-40"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
              </button>
            </form>
            </>
          ) : (
            <>Continua a conversa no {canalLabel}</>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function isMac() {
  return typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
}

/** Estado da mensagem, sempre à vista: enviado, a processar, falhou, reagendado. */
function StatusChip({ status }: { status: MessageStatus }) {
  const tone: Record<MessageStatus, string> = {
    sending: "opacity-70",
    processing: "opacity-90",
    sent: "opacity-70",
    failed: "text-[var(--danger,#b3261e)] opacity-100",
    requeued: "opacity-90",
  };
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-[11px]", tone[status])}
      aria-live="polite"
    >
      {(status === "sending" || status === "processing") && (
        <Loader2 className="h-3 w-3 animate-spin" />
      )}
      {status === "sent" && <Check className="h-3 w-3" />}
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Copia o texto sugerido (botão e atalhos usam exatamente a mesma string). */
async function copySuggested(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Mensagem copiada.");
    return true;
  } catch {
    toast.error("Não consegui copiar. Seleciona o texto e copia à mão.");
    return false;
  }
}

/** Copia a mensagem sugerida inteira, de uma vez, sem seleção manual. */
function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={`${isMac() ? "⌘" : "Ctrl"} + Shift + C`}
      className="mt-2 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] opacity-80 hover:opacity-100"
      onClick={async () => {
        if (await copySuggested(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        }
      }}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? "Copiado" : "Copiar"}
    </button>
  );
}
