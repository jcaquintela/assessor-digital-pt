// Ferramentas de email expostas ao motor conversacional.
//
// Só leitura: listar emails recentes e resumir um email a pedido.
// Nunca envia nem escreve na BD. Se a conta não estiver ligada, devolvemos
// `not_connected` para o motor orientar o consultor até às Definições —
// nunca uma negação genérica de "não tenho acesso a email".

import { GMAIL_CONNECTOR_ID } from "./provider";
import { GmailAuthExpiredError, listRecentMessages, type GmailMessageHead } from "./gmail.server";
import { summarizeEmailOnRequest } from "./summarize.server";
import { foldText } from "@/lib/search/normalize";

type Ctx = { userId: string };
type Result = { ok: boolean; data?: unknown; error?: string };

async function connectionKey(userId: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getConnectionKeyForUser } = await import("@/lib/calendar/connections.server");
  return getConnectionKeyForUser(supabaseAdmin, userId, GMAIL_CONNECTOR_ID);
}

function buildQuery(args: { query?: string | null; only_unread?: boolean | null }): string {
  const parts: string[] = [];
  if (args.only_unread) parts.push("is:unread");
  const q = (args.query ?? "").trim();
  if (q) parts.push(q);
  return parts.join(" ").trim();
}

function toRow(m: GmailMessageHead) {
  return {
    id: m.id,
    thread_id: m.threadId,
    from: m.from,
    subject: m.subject,
    snippet: m.snippet,
    sent_at: m.sentAt,
    is_read: m.isRead,
  };
}

export async function execSearchEmails(ctx: Ctx, args: unknown): Promise<Result> {
  const a = (args ?? {}) as { query?: string | null; only_unread?: boolean | null; max?: number | null };
  const key = await connectionKey(ctx.userId);
  if (!key) return { ok: true, data: { not_connected: true, items: [] } };
  try {
    const items = await listRecentMessages(key, {
      max: Math.min(Math.max(Number(a.max) || 10, 1), 20),
      query: buildQuery(a) || undefined,
    });
    return { ok: true, data: { items: items.map(toRow), total: items.length } };
  } catch (err) {
    if (err instanceof GmailAuthExpiredError) {
      return { ok: true, data: { needs_reconnect: true, items: [] } };
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function execSummarizeEmail(ctx: Ctx, args: unknown): Promise<Result> {
  const a = (args ?? {}) as { message_id?: string | null; subject_hint?: string | null };
  const key = await connectionKey(ctx.userId);
  if (!key) return { ok: true, data: { not_connected: true } };
  try {
    let messageId = (a.message_id ?? "").trim();
    let subject: string | null = null;
    if (!messageId) {
      const hint = (a.subject_hint ?? "").trim();
      const candidates = await listRecentMessages(key, { max: 15, query: hint || undefined });
      const folded = foldText(hint);
      const match = folded
        ? candidates.find((m) =>
            foldText(m.subject).includes(folded) || foldText(m.from).includes(folded))
        : candidates[0];
      const chosen = match ?? candidates[0];
      if (!chosen) return { ok: true, data: { not_found: true, hint } };
      messageId = chosen.id;
      subject = chosen.subject;
    }
    const { summary } = await summarizeEmailOnRequest({
      connectionKey: key,
      messageId,
      subject,
      requestText: "resume este email",
    });
    return { ok: true, data: { summary, subject, message_id: messageId } };
  } catch (err) {
    if (err instanceof GmailAuthExpiredError) return { ok: true, data: { needs_reconnect: true } };
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
