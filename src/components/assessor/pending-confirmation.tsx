// Indicador visível de "há uma pergunta à espera de resposta".
//
// Porquê: o consultor respondia "sim" uma hora depois sem saber se a pergunta
// ainda estava de pé. Agora vê o pendente, a pergunta exacta e até quando é
// válido (24h). Quando responde, a caixa mostra a citação da pergunta — o
// mesmo que um reply-quote no WhatsApp/Telegram.

import { useCallback, useEffect, useState } from "react";
import { Clock, Reply } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CONFIRM_ANSWER_WINDOW_MS } from "@/lib/assessor/pending-answerable";

export type PendingConfirmation = {
  id: string;
  question: string;
  validUntil: Date;
};

const CHANNEL_LABEL: Record<string, string> = {
  dashboard: "aqui no painel",
  whatsapp: "no WhatsApp",
  telegram: "no Telegram",
};

/** Última pergunta de confirmação ainda em aberto, em qualquer canal. */
export function usePendingConfirmation(reloadKey: unknown) {
  const [pending, setPending] = useState<(PendingConfirmation & { channel: string }) | null>(null);

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from("pending_actions")
      .select("id, channel, pending_question, current_question, expires_at, created_at, updated_at")
      .eq("status", "pending_confirmation")
      .order("created_at", { ascending: false })
      .limit(1);
    const row = (data ?? [])[0] as
      | {
          id: string;
          channel: string | null;
          pending_question: string | null;
          current_question: string | null;
          expires_at: string | null;
          created_at: string | null;
          updated_at: string | null;
        }
      | undefined;
    if (!row) { setPending(null); return; }
    const question = (row.current_question ?? row.pending_question ?? "").trim();
    if (!question) { setPending(null); return; }
    const base = new Date(row.updated_at ?? row.created_at ?? Date.now()).getTime();
    const ttl = row.expires_at ? new Date(row.expires_at).getTime() : Number.POSITIVE_INFINITY;
    const validUntil = new Date(Math.min(base + CONFIRM_ANSWER_WINDOW_MS, ttl));
    if (validUntil.getTime() <= Date.now()) { setPending(null); return; }
    setPending({ id: row.id, channel: row.channel ?? "dashboard", question, validUntil });
  }, []);

  useEffect(() => { void reload(); }, [reload, reloadKey]);

  return { pending, reload };
}

function formatValidade(d: Date): string {
  const hora = new Intl.DateTimeFormat("pt-PT", { hour: "2-digit", minute: "2-digit" }).format(d);
  const hoje = new Date().toDateString() === d.toDateString();
  if (hoje) return `hoje às ${hora}`;
  const dia = new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "2-digit" }).format(d);
  return `${dia} às ${hora}`;
}

/** Faixa no topo da conversa: há algo à espera da tua resposta. */
export function PendingConfirmationBanner({
  pending,
  channel,
}: {
  pending: PendingConfirmation;
  channel: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto mb-3 max-w-3xl rounded-[12px] border border-[var(--line)] bg-[var(--paper-2)] px-3 py-2.5"
    >
      <div className="flex items-center gap-2 text-[13px] font-medium">
        <Clock className="h-4 w-4" aria-hidden />
        À espera da tua resposta {CHANNEL_LABEL[channel] ?? ""}
      </div>
      <p className="mt-1 text-[14px] break-words">“{pending.question}”</p>
      <p className="c-muted mt-1 text-[12px]">
        Válida durante 24 horas — até {formatValidade(pending.validUntil)}. Podes responder
        “sim” ou “não” a qualquer momento, ou citar esta pergunta na resposta.
      </p>
    </div>
  );
}

/** Citação acima da caixa de texto: fica claro a que pergunta estás a responder. */
export function ReplyQuoteChip({ question }: { question: string }) {
  return (
    <div
      className="mx-auto mb-2 flex w-full max-w-3xl items-start gap-2 rounded-[10px] border-l-2 border-[var(--ink)] bg-[var(--paper-2)] px-2.5 py-1.5"
      aria-label={`A responder a: ${question}`}
    >
      <Reply className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <div className="min-w-0">
        <div className="c-muted text-[11px]">Em resposta a</div>
        <div className="truncate text-[12.5px]">{question}</div>
      </div>
    </div>
  );
}
