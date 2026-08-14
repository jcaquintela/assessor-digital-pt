// Escolha de contacto dentro da conversa do painel.
//
// A pergunta "qual deles é?" deixa de ser uma lista escrita: aparecem os
// candidatos plausíveis com o contexto que distingue (relação e telefone) e
// botões claros. A decisão viaja pelo MESMO pipeline dos canais (texto), por
// isso o motor determinístico continua a ser o único a escrever na base.

import { useCallback, useEffect, useState } from "react";
import { Loader2, UserRound, UserPlus, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type PersonChoiceCandidate = {
  id: string;
  name: string;
  phone?: string | null;
  relationship_type?: string | null;
};

export type PendingPersonChoice = {
  id: string;
  question: string;
  personName: string;
  mode: string;
  candidates: PersonChoiceCandidate[];
};

/** Pergunta de associação de contacto ainda em aberto nesta conversa. */
export function usePendingPersonChoice(reloadKey: unknown) {
  const [pending, setPending] = useState<PendingPersonChoice | null>(null);

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from("pending_actions")
      .select("id, structured_payload, pending_question, current_question, expires_at, created_at")
      .eq("channel", "dashboard")
      .eq("intent", "confirm_event_person")
      .eq("status", "pending_confirmation")
      .order("created_at", { ascending: false })
      .limit(1);
    const row = (data ?? [])[0] as
      | {
          id: string;
          structured_payload: any;
          pending_question: string | null;
          current_question: string | null;
          expires_at: string | null;
        }
      | undefined;
    if (!row) { setPending(null); return; }
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) { setPending(null); return; }
    const payload = (row.structured_payload ?? {}) as Record<string, any>;
    const candidates = (Array.isArray(payload.suggestions) ? payload.suggestions : [])
      .filter((c: any) => c?.id)
      .map((c: any) => ({
        id: String(c.id),
        name: String(c.name ?? "Sem nome"),
        phone: c.phone ?? null,
        relationship_type: c.relationship_type ?? null,
      }));
    setPending({
      id: row.id,
      question: (row.current_question ?? row.pending_question ?? "").trim(),
      personName: String(payload.personName ?? "").trim(),
      mode: String(payload.mode ?? ""),
      candidates,
    });
  }, []);

  useEffect(() => { void reload(); }, [reload, reloadKey]);

  return { pending, reload };
}

function contexto(c: PersonChoiceCandidate): string[] {
  return [c.relationship_type ?? "", c.phone ?? ""].filter(Boolean).map(String);
}

export function PersonChoiceCard({
  pending,
  busy,
  onAnswer,
}: {
  pending: PendingPersonChoice;
  busy: boolean;
  /** Envia a resposta como texto — o mesmo caminho do WhatsApp/Telegram. */
  onAnswer: (text: string) => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const quem = pending.personName || "esta pessoa";

  const escolher = (c: PersonChoiceCandidate) => {
    setChosen(c.id);
    onAnswer(c.name);
  };

  return (
    <div
      className="max-w-[85%] rounded-[16px] border border-[var(--line)] bg-white p-3.5 shadow-[var(--c-shadow)]"
      role="group"
      aria-label={`Escolher a que contacto ligar ${quem}`}
    >
      <div className="flex items-center gap-2 text-[13px] font-medium">
        <UserRound className="h-4 w-4" aria-hidden />
        {pending.candidates.length > 1
          ? `Tenho mais do que um ${quem}`
          : `É este o ${quem}?`}
      </div>
      <p className="c-muted mt-1 text-[12.5px]">
        Escolhe a quem ligo este registo — só grava depois de escolheres.
      </p>

      <ul className="mt-2.5 space-y-1.5">
        {pending.candidates.map((c) => {
          const isChosen = chosen === c.id;
          return (
            <li key={c.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => escolher(c)}
                aria-pressed={isChosen}
                className={[
                  "flex w-full min-h-[44px] items-center justify-between gap-3 rounded-[12px] border px-3 py-2 text-left disabled:opacity-50",
                  isChosen ? "border-[var(--ink)] bg-[var(--paper-2)]" : "border-[var(--line)]",
                ].join(" ")}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[14px]">{c.name}</span>
                  {contexto(c).length > 0 && (
                    <span className="c-muted flex flex-wrap items-center gap-2 text-[12px]">
                      {c.relationship_type && <span>{c.relationship_type}</span>}
                      {c.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" aria-hidden />
                          {c.phone}
                        </span>
                      )}
                    </span>
                  )}
                </span>
                {busy && isChosen
                  ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                  : <span className="c-muted shrink-0 text-[12.5px]">É esta</span>}
              </button>
            </li>
          );
        })}
        {pending.candidates.length === 0 && (
          <li className="c-muted text-[13px]">
            Não tenho ninguém com esse nome na tua lista.
          </li>
        )}
      </ul>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onAnswer(`criar contacto novo com o nome ${pending.personName}`.trim())}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-[12px] border border-[var(--line)] px-3.5 text-[14px] disabled:opacity-50"
        >
          <UserPlus className="h-4 w-4" aria-hidden />
          Criar contacto novo
        </button>
        {pending.candidates.length > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAnswer("não é nenhum destes")}
            className="inline-flex min-h-[44px] items-center rounded-[12px] border border-[var(--line)] px-3.5 text-[14px] disabled:opacity-50"
          >
            Não é nenhum destes
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => onAnswer("avança sem associar")}
          className="inline-flex min-h-[44px] items-center rounded-[12px] px-3.5 text-[14px] underline underline-offset-4 disabled:opacity-50"
        >
          Avançar sem associar
        </button>
      </div>
    </div>
  );
}
