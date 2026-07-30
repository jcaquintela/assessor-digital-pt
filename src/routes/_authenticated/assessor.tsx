import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { toast } from "sonner";
import { loadMessages, type MensagemDb } from "@/lib/assessor/messages";
import { supabase } from "@/integrations/supabase/client";
import { useAssessorName } from "@/lib/assessor/assessor-name";
import { CHANNEL_LABEL, useLinkedChannel } from "@/lib/assessor/use-linked-channel";
import { cn } from "@/lib/utils";
import { MessageCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/assessor")({
  head: () => ({
    meta: [
      { title: "Conversa — Assessor do Consultor" },
      { name: "description", content: "Histórico da conversa com o teu assessor." },
      { property: "og:title", content: "Conversa — Assessor do Consultor" },
      { property: "og:description", content: "Histórico da conversa com o teu assessor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssessorPage,
});

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
  const { name: assessorName } = useAssessorName();
  const { channel } = useLinkedChannel();
  const [msgs, setMsgs] = useState<MensagemDb[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

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
            <div className="c-muted text-[11.5px]">Conversa via {canalLabel} — só leitura</div>
          </div>
        </div>

        {/* Histórico */}
        <div ref={scrollRef} className="min-h-0 overflow-y-auto px-3 py-4 md:px-6" style={{ WebkitOverflowScrolling: "touch" }}>
          {loading && <p className="c-muted text-center text-sm">A carregar…</p>}
          {!loading && msgs.length === 0 && (
            <div className="c-empty mx-auto mt-8 max-w-md">
              <MessageCircle className="mx-auto mb-2 h-5 w-5" />
              Ainda não há mensagens.
              <br />
              Fala com {assessorName === "Assessor" ? "o teu assessor" : `o ${assessorName}`} pelo {canalLabel}. O histórico aparece aqui.
            </div>
          )}
          <div className="mx-auto flex max-w-3xl flex-col gap-2">
            {msgs.map((m, i) => {
              const prev = msgs[i - 1];
              const showDivider = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
              const isUser = m.role === "user";
              return (
                <div key={m.id}>
                  {showDivider && <div className="c-daysep">{formatDia(m.created_at)}</div>}
                  <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
                    <div className={cn("c-bubble", isUser ? "user" : "bot")}>
                      {m.content}
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
          Continua a conversa no {canalLabel}
        </div>
      </div>
    </AppShell>
  );
}
