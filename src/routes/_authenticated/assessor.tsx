import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { toast } from "sonner";
import { loadMessages, type MensagemDb } from "@/lib/assessor/messages";
import { supabase } from "@/integrations/supabase/client";
import { useAssessorName } from "@/lib/assessor/assessor-name";
import { CHANNEL_LABEL, useLinkedChannel } from "@/lib/assessor/use-linked-channel";
import { cn } from "@/lib/utils";
import { MessageCircle, SendHorizonal, Loader2, Copy, Check } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { sendDashboardMessage, DASHBOARD_CHAT_MIN_TIER } from "@/lib/assessor/dashboard-chat.functions";
import { useEffectiveTier } from "@/lib/subscription/use-effective-tier";
import { tierAtLeast } from "@/lib/subscription/tiers";
import { AI_DISCLOSURE } from "@/lib/assessor/ai-disclosure";
import { normalizeSuggestedText } from "@/lib/assessor/culture/suggested-message";

export const Route = createFileRoute("/_authenticated/assessor")({

  head: () => ({
    meta: [
      { title: "Conversa — Afonso" },
      { name: "description", content: "Histórico da tua conversa com o Afonso." },
      { property: "og:title", content: "Conversa — Afonso" },
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
  const [msgs, setMsgs] = useState<MensagemDb[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { data: tierData } = useEffectiveTier();
  // Escrita no painel é Pro e Team. Base e Consultor mantêm a vista de só
  // leitura — não mostramos caixa de texto nem promessa de resposta.
  const canWrite = tierAtLeast(tierData?.tier, DASHBOARD_CHAT_MIN_TIER);
  const send = useServerFn(sendDashboardMessage);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const reload = () => {
      loadMessages(200)
        .then((rows) => { if (!cancelled) { setMsgs(rows); setLoading(false); } })
        .catch((e) => { if (!cancelled) { toast.error((e as Error).message); setLoading(false); } });
    };
    reload();
    const ch = supabase
      .channel("assessor_messages_stream")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "assessor_messages" }, reload)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [msgs.length]);

  const canalLabel = channel ? CHANNEL_LABEL[channel] : "WhatsApp";

  const enviar = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft("");
    try {
      await send({ data: { text } });
    } catch (e) {
      setDraft(text);
      toast.error((e as Error).message);
    } finally {
      setSending(false);
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
          </div>
        </div>

        {/* Histórico */}
        <div ref={scrollRef} className="min-h-0 overflow-y-auto px-3 py-4 md:px-6" style={{ WebkitOverflowScrolling: "touch" }}>
          {loading && <p className="c-muted text-center text-sm">A carregar…</p>}
          {!loading && msgs.length === 0 && (
            <div className="c-empty mx-auto mt-8 max-w-md">
              <MessageCircle className="mx-auto mb-2 h-5 w-5" />
              {AI_DISCLOSURE}
              <br />
              Ainda não há mensagens.
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
                       <span className={cn("c-when", isUser ? "text-right" : "text-left")}>{formatHora(m.created_at)}</span>
                     </div>
                   </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Rodapé fixo */}
        <div className="c-chatbar" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)" }}>
          {canWrite ? (
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
          ) : (
            <>Continua a conversa no {canalLabel}</>
          )}
        </div>
      </div>
    </AppShell>
  );
}

/** Copia a mensagem sugerida inteira, de uma vez, sem seleção manual. */
function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="mt-2 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] opacity-80 hover:opacity-100"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          toast.success("Mensagem copiada.");
          setTimeout(() => setDone(false), 2000);
        } catch {
          toast.error("Não consegui copiar. Seleciona o texto e copia à mão.");
        }
      }}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? "Copiado" : "Copiar"}
    </button>
  );
}
