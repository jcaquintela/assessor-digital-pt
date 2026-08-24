// Leitura/escrita da pergunta em aberto do Afonso e da janela de rajada da
// confirmação órfã. A lógica de decisão vive em ./open-question.ts (puro).

import { findActivePendingAction, markPendingActionStatus } from "../memory.server";
import type { PendingActionRow } from "../memory.server";
import { formatQueryResults } from "./query-results";
import type { ToolExecResult } from "./act.server";
import {
  OPEN_QUESTION_INTENT,
  OPEN_QUESTION_TTL_MS,
  ORPHAN_BURST_MS,
  looksLikeEntityAnswer,
  shouldRecordOpenQuestion,
} from "./open-question";

/** Grava a pergunta em aberto (ranhura própria: não compete com o assunto principal). */
export async function recordOpenQuestion(
  supabase: any,
  args: {
    userId: string;
    channel: string;
    question: string;
    sourceMessageId?: string | null;
    subject?: string | null;
    toolsExecuted?: number;
  },
): Promise<string | null> {
  if (!shouldRecordOpenQuestion({ reply: args.question, toolsExecuted: args.toolsExecuted })) {
    return null;
  }
  try {
    // Só uma pergunta em aberto de cada vez.
    const prev = await findActivePendingAction(supabase, args.userId, args.channel, "clarify");
    if (prev) await markPendingActionStatus(supabase, prev.id, "cancelled");

    const { data } = await supabase
      .from("pending_actions")
      .insert({
        user_id: args.userId,
        channel: args.channel,
        intent: OPEN_QUESTION_INTENT,
        original_content: args.question,
        structured_payload: {
          question: args.question,
          subject: args.subject ?? null,
        } as never,
        missing_fields: [],
        status: "collecting_information",
        confidence: null,
        pending_question: args.question,
        current_question: args.question,
        source_message_id: args.sourceMessageId ?? null,
        expires_at: new Date(Date.now() + OPEN_QUESTION_TTL_MS).toISOString(),
      } as never)
      .select("id")
      .maybeSingle();
    return (data as any)?.id ? String((data as any).id) : null;
  } catch {
    return null;
  }
}

/** Pergunta em aberto ainda viva (findActivePendingAction já expira as velhas). */
export async function findOpenQuestion(
  supabase: any,
  args: { userId: string; channel: string },
): Promise<PendingActionRow | null> {
  try {
    const row = await findActivePendingAction(supabase, args.userId, args.channel, "clarify");
    return row && row.intent === OPEN_QUESTION_INTENT ? row : null;
  } catch {
    return null;
  }
}

export async function closeOpenQuestion(
  supabase: any,
  id: string,
  status: "executed" | "cancelled" = "executed",
): Promise<void> {
  try { await markPendingActionStatus(supabase, id, status); } catch { /* best-effort */ }
}

/**
 * Pendente que a mesma rajada acabou de fechar (o "Ainda não" que consumiu a
 * pergunta 2s antes do "sim"). Serve para a confirmação órfã ter contexto.
 */
export async function findJustClosedPending(
  supabase: any,
  args: { userId: string; channel: string; withinMs?: number },
): Promise<PendingActionRow | null> {
  const withinMs = args.withinMs ?? ORPHAN_BURST_MS;
  try {
    const { data } = await supabase
      .from("pending_actions")
      .select("*")
      .eq("user_id", args.userId)
      .eq("channel", args.channel)
      .in("status", ["executed", "cancelled"])
      .order("updated_at", { ascending: false })
      .limit(5);
    const rows = ((data as PendingActionRow[] | null) ?? []).filter((r) => {
      if (r.intent === OPEN_QUESTION_INTENT) return false;
      const at = new Date(r.updated_at ?? r.created_at).getTime();
      return Number.isFinite(at) && Date.now() - at <= withinMs;
    });
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

/** Assunto legível de um pendente, para a pergunta órfã não ser às cegas. */
export function subjectOfPending(row: PendingActionRow | null | undefined): string {
  if (!row) return "";
  const payload = (row.structured_payload ?? {}) as Record<string, any>;
  const raw =
    payload.title ||
    payload.description ||
    payload.subject ||
    row.original_content ||
    "";
  return String(raw).replace(/\s+/g, " ").trim().slice(0, 80);
}

type Lookup = (tool: string, args: Record<string, unknown>) => Promise<ToolExecResult>;

/**
 * Resposta do consultor lida contra a pergunta em aberto. Resolve a entidade
 * nomeada pelos caminhos de pesquisa que já existem (imóvel → pessoa →
 * negócio); sem resultado, devolve null e o turno segue o fluxo normal.
 */
export async function answerOpenQuestion(
  supabase: any,
  args: { userId: string; channel: string; text: string; lookup: Lookup },
): Promise<{ reply: string; tool: string } | null> {
  if (!looksLikeEntityAnswer(args.text)) return null;
  const open = await findOpenQuestion(supabase, { userId: args.userId, channel: args.channel });
  if (!open) return null;

  const query = args.text.trim();
  for (const tool of ["search_properties", "search_people"] as const) {
    let r: ToolExecResult;
    try {
      r = await args.lookup(tool, { query });
    } catch {
      continue;
    }
    if (!r?.ok) continue;
    const rows = (((r.data as any)?.results ?? (r.data as any)?.items ?? []) as unknown[]);
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const reply = formatQueryResults([{ name: tool, ok: true, data: r.data } as ToolExecResult]);
    if (!reply) continue;
    await closeOpenQuestion(supabase, open.id, "executed");
    return { reply, tool };
  }
  return null;
}

export { orphanBurstReply, looksLikeEntityAnswer, shouldRecordOpenQuestion, OPEN_QUESTION_TTL_MS, ORPHAN_BURST_MS } from "./open-question";
