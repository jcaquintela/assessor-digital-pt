// Ferramentas de email expostas ao motor conversacional — agnósticas ao
// provedor (Gmail ou Outlook).
//
// Só leitura: listar emails recentes e resumir um email a pedido.
// Nunca envia nem escreve na BD. Se não houver conta ligada, devolvemos
// `not_connected` para o motor orientar o consultor até às Definições —
// nunca uma negação genérica de "não tenho acesso a email".

import { foldText } from "@/lib/search/normalize";
import { triageEmails, type KnownPerson } from "./triage";
import type { MailMessageHead } from "./message";
import { MAIL_CONNECTOR_ID, type MailProvider } from "./providers";

type Ctx = { userId: string };
type Result = { ok: boolean; data?: unknown; error?: string };

export class MailAuthExpired extends Error {}

/** Provedor ligado por este consultor (Gmail tem precedência se houver dois). */
export async function activeMailProvider(
  userId: string,
): Promise<{ provider: MailProvider; key: string } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getConnectionKeyForUser } = await import("@/lib/calendar/connections.server");
  const { data } = await supabaseAdmin
    .from("email_connections")
    .select("provider")
    .eq("user_id", userId);
  const providers = (data ?? [])
    .map((r: any) => String(r.provider))
    .filter((p: string): p is MailProvider => p === "gmail" || p === "outlook")
    .sort((a: MailProvider) => (a === "gmail" ? -1 : 1));
  for (const provider of providers) {
    const key = await getConnectionKeyForUser(
      supabaseAdmin,
      userId,
      MAIL_CONNECTOR_ID[provider],
    );
    if (key) return { provider, key };
  }
  return null;
}

async function listMessages(
  provider: MailProvider,
  key: string,
  opts: { max: number; query?: string; onlyUnread?: boolean },
): Promise<MailMessageHead[]> {
  if (provider === "outlook") {
    const m = await import("./outlook/outlook.server");
    try {
      return await m.listRecentMessages(key, opts);
    } catch (err) {
      if (err instanceof m.OutlookAuthExpiredError) throw new MailAuthExpired();
      throw err;
    }
  }
  const g = await import("./gmail/gmail.server");
  const parts: string[] = [];
  if (opts.onlyUnread) parts.push("is:unread");
  if (opts.query) parts.push(opts.query);
  try {
    return await g.listRecentMessages(key, {
      max: opts.max,
      query: parts.join(" ").trim() || undefined,
    });
  } catch (err) {
    if (err instanceof g.GmailAuthExpiredError) throw new MailAuthExpired();
    throw err;
  }
}

/** Pessoas do consultor com email — base da prioridade "gente conhecida". */
async function knownPeople(userId: string): Promise<KnownPerson[]> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("people")
      .select("id, name, email_normalized")
      .eq("user_id", userId)
      .is("archived_at", null)
      .not("email_normalized", "is", null)
      .limit(2000);
    return (data ?? []) as KnownPerson[];
  } catch {
    return [];
  }
}

export function toRow(m: MailMessageHead) {
  return {
    id: m.id,
    thread_id: m.threadId,
    from: m.from,
    subject: m.subject,
    snippet: m.snippet,
    sent_at: m.sentAt,
    is_read: m.isRead,
    low_priority_hint: m.lowPriorityHint ?? false,
  };
}

export async function execSearchEmails(ctx: Ctx, args: unknown): Promise<Result> {
  const a = (args ?? {}) as {
    query?: string | null;
    only_unread?: boolean | null;
    max?: number | null;
    include_all?: boolean | null;
  };
  const conn = await activeMailProvider(ctx.userId);
  if (!conn) return { ok: true, data: { not_connected: true, items: [] } };
  try {
    const items = await listMessages(conn.provider, conn.key, {
      max: Math.min(Math.max(Number(a.max) || 10, 1), 20),
      query: (a.query ?? "").trim() || undefined,
      onlyUnread: Boolean(a.only_unread),
    });
    const triaged = triageEmails(items.map(toRow), await knownPeople(ctx.userId));
    const relevant = triaged.filter((r) => r.bucket !== "noise");
    const noise = triaged.filter((r) => r.bucket === "noise");
    // Pesquisa explícita ("emails do Nuno") ou "mostra todos" não filtra nada.
    const showAll = Boolean(a.include_all) || Boolean((a.query ?? "").trim());
    return {
      ok: true,
      data: {
        provider: conn.provider,
        items: showAll ? triaged : relevant,
        total: showAll ? triaged.length : relevant.length,
        hidden_noise: showAll ? 0 : noise.length,
        noise_senders: showAll ? [] : noise.slice(0, 3).map((r) => r.person_name ?? r.from),
        filtered: !showAll,
      },
    };
  } catch (err) {
    if (err instanceof MailAuthExpired) {
      return { ok: true, data: { needs_reconnect: true, items: [] } };
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function execSummarizeEmail(ctx: Ctx, args: unknown): Promise<Result> {
  const a = (args ?? {}) as { message_id?: string | null; subject_hint?: string | null };
  const conn = await activeMailProvider(ctx.userId);
  if (!conn) return { ok: true, data: { not_connected: true } };
  try {
    let messageId = (a.message_id ?? "").trim();
    let subject: string | null = null;
    if (!messageId) {
      const hint = (a.subject_hint ?? "").trim();
      const candidates = await listMessages(conn.provider, conn.key, {
        max: 15,
        query: hint || undefined,
      });
      const folded = foldText(hint);
      const match = folded
        ? candidates.find(
            (m) => foldText(m.subject).includes(folded) || foldText(m.from).includes(folded),
          )
        : candidates[0];
      const chosen = match ?? candidates[0];
      if (!chosen) return { ok: true, data: { not_found: true, hint } };
      messageId = chosen.id;
      subject = chosen.subject;
    }
    const { summarizeEmailOnRequest } = await import("./gmail/summarize.server");
    const { summary } = await summarizeEmailOnRequest({
      provider: conn.provider,
      connectionKey: conn.key,
      messageId,
      subject,
      requestText: "resume este email",
    });
    return { ok: true, data: { provider: conn.provider, summary, subject, message_id: messageId } };
  } catch (err) {
    if (err instanceof MailAuthExpired) return { ok: true, data: { needs_reconnect: true } };
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
