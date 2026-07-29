import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { toast } from "sonner";
import { loadMessages, type MensagemDb } from "@/lib/assessor/messages";
import { supabase } from "@/integrations/supabase/client";
import { useAssessorName } from "@/lib/assessor/assessor-name";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { MessageCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/assessor")({
  head: () => ({
    meta: [
      { title: "Conversa — Assessor do Consultor" },
      { name: "description", content: "Histórico da conversa com o teu assessor via WhatsApp." },
      { property: "og:title", content: "Conversa — Assessor do Consultor" },
      { property: "og:description", content: "Histórico da conversa com o teu assessor via WhatsApp." },
    ],
  }),
  component: AssessorPage,
});

function formatHora(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("pt-PT", { hour: "2-digit", minute: "2-digit" }).format(d);
}

function formatDia(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const ontem = new Date(now); ontem.setDate(ontem.getDate() - 1);
  const isOntem = d.toDateString() === ontem.toDateString();
  if (sameDay) return "Hoje";
  if (isOntem) return "Ontem";
  return new Intl.DateTimeFormat("pt-PT", { weekday: "long", day: "2-digit", month: "long" }).format(d);
}

function AssessorPage() {
  const isMobile = useIsMobile();
  const { name: assessorName } = useAssessorName();
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
    // Realtime: atualiza sempre que chegar mensagem nova (ex: via WhatsApp).
    const channel = supabase
      .channel("assessor_messages_stream")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "assessor_messages" }, reload)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [msgs.length]);

  const content = (
    <div ref={scrollRef} className="h-full min-h-0 overflow-y-auto px-3 py-4 md:px-6" style={{ WebkitOverflowScrolling: "touch" }}>
      {loading && <p className="text-center text-sm text-muted-foreground">A carregar…</p>}
      {!loading && msgs.length === 0 && (
        <div className="mx-auto mt-10 max-w-md rounded-2xl border border-border bg-card p-6 text-center">
          <MessageCircle className="mx-auto h-6 w-6 text-primary" />
          <p className="mt-3 text-sm font-medium">Ainda não há mensagens.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Fala com {assessorName === "Assessor" ? "o teu assessor" : `o ${assessorName}`} pelo WhatsApp. O histórico aparece aqui.
          </p>
        </div>
      )}
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        {msgs.map((m, i) => {
          const prev = msgs[i - 1];
          const showDivider = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
          const isUser = m.role === "user";
          return (
            <div key={m.id}>
              {showDivider && (
                <div className="my-3 text-center text-[11px] uppercase tracking-wide text-muted-foreground">
                  {formatDia(m.created_at)}
                </div>
              )}
              <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap",
                  isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                )}>
                  <div>{m.content}</div>
                  <div className={cn("mt-0.5 text-[10px] opacity-70", isUser ? "text-right" : "text-left")}>
                    {formatHora(m.created_at)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <AppShell fullBleed>
        <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
          <div className="border-b border-border bg-background px-4 py-2" style={{ paddingTop: "max(env(safe-area-inset-top), 0.5rem)" }}>
            <div className="text-sm font-semibold">{assessorName}</div>
            <div className="text-[11px] text-muted-foreground">Conversa via WhatsApp — só leitura</div>
          </div>
          <div className="min-h-0">{content}</div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader title="Conversa" subtitle="Histórico da conversa com o teu assessor via WhatsApp. Só leitura." />
      <div className="h-[calc(100vh-14rem)] rounded-2xl border border-border bg-card">{content}</div>
    </AppShell>
  );
}