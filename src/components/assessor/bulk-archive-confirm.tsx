// Confirmação de arquivo em lote dentro da conversa do painel.
//
// Guardrail intocado: por conversa NUNCA se elimina definitivamente. Aqui só
// se mostra a mesma lista numerada que o Afonso enviou e dois botões claros.
// A decisão viaja pelo MESMO pipeline dos canais ("sim"/"não"), por isso o
// motor determinístico continua a ser o único a escrever na base de dados.

import { useCallback, useEffect, useState } from "react";
import { Archive, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { kindLabel, type BulkKind } from "@/lib/drive/bulk-archive";

export type PendingBulkArchive = {
  id: string;
  kind: BulkKind;
  names: string[];
  count: number;
  question: string;
};

/** Lê o pendente de arquivo em lote criado nesta conversa do painel. */
export function usePendingBulkArchive(reloadKey: unknown) {
  const [pending, setPending] = useState<PendingBulkArchive | null>(null);

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from("pending_actions")
      .select("id, intent, status, structured_payload, pending_question, expires_at, created_at")
      .eq("channel", "dashboard")
      .eq("intent", "confirm_bulk_archive")
      .eq("status", "pending_confirmation")
      .order("created_at", { ascending: false })
      .limit(1);
    const row = (data ?? [])[0] as
      | { id: string; structured_payload: any; pending_question: string | null; expires_at: string | null }
      | undefined;
    if (!row) { setPending(null); return; }
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) { setPending(null); return; }
    const payload = (row.structured_payload ?? {}) as Record<string, unknown>;
    const ids = Array.isArray(payload.file_ids) ? (payload.file_ids as unknown[]).map(String) : [];
    const names = Array.isArray(payload.file_names)
      ? (payload.file_names as unknown[]).map((n) => String(n))
      : ids.map((_, i) => `Ficheiro ${i + 1}`);
    setPending({
      id: row.id,
      kind: (payload.kind as BulkKind) ?? "any",
      names,
      count: ids.length || names.length,
      question: row.pending_question ?? "",
    });
  }, []);

  useEffect(() => { void reload(); }, [reload, reloadKey]);

  return { pending, reload };
}

export function BulkArchiveConfirmCard({
  pending,
  busy,
  onAnswer,
}: {
  pending: PendingBulkArchive;
  busy: boolean;
  onAnswer: (answer: "sim" | "não") => void;
}) {
  const alvo = kindLabel(pending.kind, pending.count);
  return (
    <div
      className="max-w-[85%] rounded-[16px] border border-[var(--line)] bg-white p-3.5 shadow-[var(--c-shadow)]"
      role="group"
      aria-label={`Confirmar arquivar ${pending.count} ${alvo}`}
    >
      <div className="flex items-center gap-2 text-[13px] font-medium">
        <Archive className="h-4 w-4" aria-hidden />
        Encontrei {pending.count} {alvo}
      </div>

      <ol className="mt-2 space-y-1 text-[14px]">
        {pending.names.map((name, i) => (
          <li key={`${name}-${i}`} className="flex gap-2">
            <span className="c-muted w-5 shrink-0 text-right tabular-nums">{i + 1}.</span>
            <span className="min-w-0 break-words">{name}</span>
          </li>
        ))}
        {pending.count > pending.names.length && (
          <li className="c-muted pl-7 text-[13px]">… e mais {pending.count - pending.names.length}</li>
        )}
      </ol>

      <p className="c-muted mt-3 text-[12.5px]">
        Arquivar é reversível — repões no Drive Inteligente quando quiseres. Eliminar
        definitivamente continua a ser só na área de documentos.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onAnswer("sim")}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-[12px] bg-[var(--ink)] px-3.5 text-[14px] text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Archive className="h-4 w-4" aria-hidden />}
          Arquivar {pending.count} {alvo}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onAnswer("não")}
          className="inline-flex min-h-[44px] items-center rounded-[12px] border border-[var(--line)] px-3.5 text-[14px] disabled:opacity-50"
        >
          Não arquivar
        </button>
      </div>
    </div>
  );
}