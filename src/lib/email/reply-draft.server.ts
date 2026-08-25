// Rascunho de resposta a email — lado servidor.
//
// Fluxo: resolver alvo → ler corpo (em memória, nunca persistido em bruto) →
// gerar rascunho com o LLM → gravar em `email_drafts` (status=pending) →
// criar o rascunho real no provedor → apresentar no canal.
//
// O envio NÃO é ferramenta do LLM: vive em `sendConfirmedDraft`, disparado
// só pelo caminho determinístico de confirmação (pending_actions), e o
// `confirmed` é obrigatório no adaptador do provedor.

import { foldText } from "@/lib/search/normalize";
import {
  DRAFT_TTL_MS,
  draftConfirmationQuestion,
  draftPresentationIntro,
  emailChoiceQuestion,
  isAlreadySent,
  isDraftExpired,
} from "./reply-draft";
import type { MailProvider } from "./providers";
import type { MailMessageHead } from "./message";

type Ctx = { userId: string; channel?: string | null };
type Result = { ok: boolean; data?: unknown; error?: string };

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.6-flash";

/** Endereço puro a partir de "Nome <email@dominio>". */
export function addressOf(from: string | null | undefined): string | null {
  const raw = String(from ?? "").trim();
  const m = raw.match(/<([^>]+)>/);
  const email = (m?.[1] ?? raw).trim();
  return /\S+@\S+\.\S+/.test(email) ? email : null;
}

export function displayNameOf(from: string | null | undefined): string {
  const raw = String(from ?? "").trim();
  const m = raw.match(/^([^<]+)</);
  const name = (m?.[1] ?? "").replace(/["']/g, "").trim();
  return name || addressOf(raw) || "o remetente";
}

/** "Re: assunto" sem duplicar o prefixo. */
export function replySubject(subject: string | null | undefined): string {
  const s = String(subject ?? "").trim();
  if (!s) return "Re:";
  return /^re\s*:/i.test(s) ? s : `Re: ${s}`;
}

/** Candidatos ao alvo: emails recebidos que batem com a pista do consultor. */
export function rankEmailCandidates(
  items: MailMessageHead[],
  hint: string | null | undefined,
): MailMessageHead[] {
  const folded = foldText(String(hint ?? ""));
  if (!folded) return items.slice(0, 4);
  const words = folded.split(" ").filter((w) => w.length >= 3);
  const scored = items
    .map((m) => {
      const hay = `${foldText(m.from ?? "")} ${foldText(m.subject ?? "")}`;
      const score = words.reduce((acc, w) => acc + (hay.includes(w) ? 1 : 0), 0);
      return { m, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const top = scored[0]?.score ?? 0;
  return scored.filter((x) => x.score === top).map((x) => x.m);
}

async function readBody(provider: MailProvider, key: string, id: string): Promise<string> {
  if (provider === "outlook") {
    const m = await import("./outlook/outlook.server");
    return m.fetchMessageBody(key, id);
  }
  const g = await import("./gmail/gmail.server");
  return g.fetchMessageBody(key, id);
}

async function providerCreateDraft(
  provider: MailProvider,
  key: string,
  args: { to: string[]; subject: string; body: string; threadId?: string | null },
): Promise<{ draftId: string }> {
  if (provider === "outlook") {
    const m = await import("./outlook/outlook.server");
    return m.createDraft(key, { to: args.to, subject: args.subject, body: args.body });
  }
  const g = await import("./gmail/gmail.server");
  return g.createDraft(key, args);
}

/** Gera o corpo da resposta. Sem chave de IA cai num rascunho neutro. */
export async function composeReplyBody(args: {
  originalBody: string;
  subject: string | null;
  toName: string;
  instructions?: string | null;
  consultantName?: string | null;
}): Promise<string> {
  const key = process.env['LOVABLE_API_KEY'];
  const signature = args.consultantName ? `\n\nCom os melhores cumprimentos,\n${args.consultantName}` : "";
  if (!key) {
    return `Olá ${args.toName},\n\nObrigado pelo email. Fico a par e volto a contactar-te com os detalhes.${signature}`;
  }
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      messages: [
        {
          role: "system",
          content: [
            "Escreves emails profissionais em português de Portugal para um consultor imobiliário.",
            "Responde ao email recebido. Só o corpo do email: sem assunto, sem markdown, sem comentários.",
            "Tom cordial e directo, 3 a 8 linhas. Não inventes valores, datas nem compromissos que não estejam no email ou nas instruções.",
            args.consultantName ? `Assina como ${args.consultantName}.` : "Termina com uma despedida simples.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `Assunto: ${args.subject ?? "(sem assunto)"}`,
            `Destinatário: ${args.toName}`,
            args.instructions ? `Instruções do consultor: ${args.instructions}` : "",
            "",
            "Email recebido:",
            args.originalBody.slice(0, 6000),
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error(`Rascunho de email falhou [${res.status}]: ${t}`);
    throw new Error(`Rascunho falhou [${res.status}]`);
  }
  const json = await res.json();
  const body = String(json?.choices?.[0]?.message?.content ?? "").trim();
  if (!body) throw new Error("rascunho vazio");
  return body;
}

/**
 * Ferramenta `draft_email_reply` — só PROPÕE. Nunca envia.
 * Devolve a apresentação já formatada (corpo em bolha isolada + pergunta).
 */
export async function execDraftEmailReply(ctx: Ctx, args: unknown): Promise<Result> {
  const a = (args ?? {}) as {
    message_id?: string | null;
    subject_hint?: string | null;
    instructions?: string | null;
  };
  const { hasEmailModule } = await import("@/lib/subscription/email-gate.server");
  if (!(await hasEmailModule(ctx.userId))) return { ok: true, data: { plan_required: true } };

  const { activeMailProvider, MailAuthExpired } = await import("./tools.server");
  const conn = await activeMailProvider(ctx.userId);
  if (!conn) return { ok: true, data: { not_connected: true } };
  if ((conn as any).needsChoice) {
    return {
      ok: true,
      data: { needs_provider_choice: true, options: (conn as any).options },
    };
  }
  const active = conn as { provider: MailProvider; key: string };
  const channel = String(ctx.channel ?? "dashboard");

  try {
    let target: MailMessageHead | null = null;
    const hint = (a.subject_hint ?? "").trim();

    const list = await (async () => {
      if (active.provider === "outlook") {
        const m = await import("./outlook/outlook.server");
        return m.listRecentMessages(active.key, { max: 20, query: hint || undefined });
      }
      const g = await import("./gmail/gmail.server");
      return g.listRecentMessages(active.key, { max: 20, query: hint || undefined });
    })();

    if ((a.message_id ?? "").trim()) {
      target = list.find((m) => m.id === String(a.message_id).trim()) ?? null;
      if (!target) target = { id: String(a.message_id).trim() } as MailMessageHead;
    }

    if (!target) {
      const candidates = rankEmailCandidates(list, hint);
      if (!candidates.length) return { ok: true, data: { not_found: true, hint } };
      if (candidates.length > 1) {
        // Nunca adivinhamos: cartão de escolha determinístico.
        return {
          ok: true,
          data: {
            needs_email_choice: true,
            candidates: candidates.slice(0, 4).map((m) => ({
              id: m.id,
              from: m.from,
              subject: m.subject,
              thread_id: m.threadId,
            })),
            question: emailChoiceQuestion(candidates.slice(0, 4)),
            instructions: a.instructions ?? null,
          },
        };
      }
      target = candidates[0]!;
    }

    const created = await createDraftForMessage({
      userId: ctx.userId,
      channel,
      provider: active.provider,
      key: active.key,
      message: target,
      instructions: a.instructions ?? null,
    });
    return { ok: true, data: created };
  } catch (err) {
    if (err instanceof MailAuthExpired) return { ok: true, data: { needs_reconnect: true } };
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Cria (ou reescreve) o rascunho para um email concreto e devolve a
 * apresentação. Partilhado pela ferramenta e pelo caminho de iteração.
 */
export async function createDraftForMessage(args: {
  userId: string;
  channel: string;
  provider: MailProvider;
  key: string;
  message: MailMessageHead;
  instructions?: string | null;
  revisions?: number;
  previousBody?: string | null;
}): Promise<{
  draft_id: string;
  to: string;
  to_name: string;
  subject: string;
  body: string;
  provider: MailProvider;
  manual_send: boolean;
  intro: string;
  question: string;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const to = addressOf(args.message.from);
  if (!to) throw new Error("email do remetente ilegível");
  const toName = displayNameOf(args.message.from);

  const originalBody = await readBody(args.provider, args.key, args.message.id);

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("name")
    .eq("id", args.userId)
    .maybeSingle();

  const body = await composeReplyBody({
    originalBody,
    subject: args.message.subject ?? null,
    toName,
    instructions: args.instructions ?? null,
    consultantName: (prof as any)?.name ?? null,
  });
  const subject = replySubject(args.message.subject);

  // Rascunho real na caixa do consultor — nunca enviado aqui.
  let providerDraftId: string | null = null;
  try {
    const r = await providerCreateDraft(args.provider, args.key, {
      to: [to],
      subject,
      body,
      threadId: args.message.threadId ?? null,
    });
    providerDraftId = r.draftId || null;
  } catch (err) {
    console.error("createDraft no provedor falhou:", err instanceof Error ? err.message : err);
  }

  const expiresAt = new Date(Date.now() + DRAFT_TTL_MS).toISOString();
  const { data: row, error } = await supabaseAdmin
    .from("email_drafts")
    .insert({
      user_id: args.userId,
      provider: args.provider,
      provider_draft_id: providerDraftId,
      to_emails: [to],
      to_name: toName,
      subject,
      body,
      status: "pending",
      channel: args.channel,
      in_reply_to_message_id: args.message.id,
      revisions: args.revisions ?? 0,
      expires_at: expiresAt,
    } as never)
    .select("id")
    .single();
  if (error || !row) throw new Error(error?.message ?? "rascunho não gravado");

  const manualSend = args.provider === "outlook";
  return {
    draft_id: String((row as any).id),
    to,
    to_name: toName,
    subject,
    body,
    provider: args.provider,
    manual_send: manualSend,
    intro: draftPresentationIntro({ toLabel: toName, subject: args.message.subject ?? null, manualSend }),
    question: draftConfirmationQuestion({ draftId: String((row as any).id), manualSend }),
  };
}

export type DraftRow = {
  id: string;
  user_id: string;
  provider: string;
  provider_draft_id: string | null;
  to_emails: string[];
  to_name: string | null;
  subject: string | null;
  body: string;
  status: string;
  sent_at: string | null;
  cancelled_at: string | null;
  expires_at: string | null;
  revisions: number | null;
  in_reply_to_message_id: string | null;
  channel: string | null;
};

export async function loadDraft(userId: string, draftId: string): Promise<DraftRow | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("email_drafts")
    .select("*")
    .eq("id", draftId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as DraftRow | null) ?? null;
}

/** Rascunho mais recente por confirmar deste consultor+canal (âncora). */
export async function latestPendingDraft(userId: string, channel: string): Promise<DraftRow | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("email_drafts")
    .select("*")
    .eq("user_id", userId)
    .eq("channel", channel)
    .order("created_at", { ascending: false })
    .limit(1);
  return ((data as DraftRow[] | null) ?? [])[0] ?? null;
}

export type CancelOutcome =
  | { status: "cancelled" }
  | { status: "already_cancelled" }
  | { status: "already_sent" }
  | { status: "not_found" };

/**
 * Cancela um rascunho de email. Estado terminal: depois disto nenhuma frase de
 * confirmação (nem "enviar") volta a autorizar este rascunho — o caminho
 * determinístico só aceita rascunhos `pending`.
 */
export async function cancelDraft(args: {
  userId: string;
  draftId: string;
  source: "canal" | "dashboard";
  reason?: string | null;
  channel?: string | null;
}): Promise<CancelOutcome> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { isDraftCancelled } = await import("./reply-draft");
  const draft = await loadDraft(args.userId, args.draftId);
  if (!draft) return { status: "not_found" };
  if (isAlreadySent(draft)) return { status: "already_sent" };
  if (isDraftCancelled(draft)) return { status: "already_cancelled" };

  // Transição condicional: só sai de `pending`/`discarded`, nunca de `sent`.
  const { data: claimed } = await supabaseAdmin
    .from("email_drafts")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancel_reason: (args.reason ?? `cancelado pelo consultor (${args.source})`).slice(0, 500),
    } as never)
    .eq("id", draft.id)
    .eq("user_id", args.userId)
    .in("status", ["pending", "discarded"])
    .select("id");
  if (!((claimed as any[] | null) ?? []).length) return { status: "already_cancelled" };

  try {
    await supabaseAdmin.from("admin_audit_logs").insert({
      admin_user_id: null,
      action: "email.rascunho_cancelado",
      target_user_id: args.userId,
      resource_type: "email_draft",
      resource_id: draft.id,
      reason: "Rascunho de email cancelado pelo consultor; confirmações posteriores bloqueadas.",
      metadata: {
        source: `email/reply-draft:${args.source}`,
        channel: args.channel ?? draft.channel,
        provider: draft.provider,
        to: draft.to_emails,
        subject: draft.subject,
        revisions: draft.revisions,
        cancel_reason: args.reason ?? null,
      },
    } as never);
  } catch {
    /* auditoria nunca bloqueia o cancelamento */
  }

  return { status: "cancelled" };
}

export type SendOutcome =
  | { status: "sent" }
  | { status: "manual" }
  | { status: "already_sent" }
  | { status: "expired" }
  | { status: "failed"; error: string };

/**
 * Envio confirmado. NÃO é ferramenta do LLM: só o caminho determinístico de
 * confirmação chega aqui, e sempre com a frase literal do consultor.
 *
 * - `confirmed` é obrigatório e é passado ao adaptador do provedor, que
 *   rebenta sem ele (Gmail tem `gmail.compose`; a protecção real é este
 *   guardrail, não a ausência de scope).
 * - Transição condicional pending→sent: uma segunda confirmação não duplica.
 */
export async function sendConfirmedDraft(args: {
  userId: string;
  draftId: string;
  confirmationText: string;
  channel: string;
  confirmed: boolean;
}): Promise<SendOutcome> {
  if (!args.confirmed) {
    throw new Error("Envio de email sem confirmação explícita do consultor — bloqueado.");
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const draft = await loadDraft(args.userId, args.draftId);
  if (!draft) return { status: "failed", error: "rascunho inexistente" };
  if (isAlreadySent(draft)) return { status: "already_sent" };
  if (isDraftExpired(draft.expires_at)) return { status: "expired" };

  // Reserva idempotente: só quem conseguir passar de `pending` para
  // `confirmed` é que segue para o envio.
  const { data: claimed } = await supabaseAdmin
    .from("email_drafts")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      confirmation_text: args.confirmationText.slice(0, 500),
    } as never)
    .eq("id", draft.id)
    .eq("user_id", args.userId)
    .eq("status", "pending")
    .select("id");
  if (!((claimed as any[] | null) ?? []).length) return { status: "already_sent" };

  const manual = draft.provider !== "gmail";
  let sent = false;
  if (!manual) {
    try {
      const { activeMailProvider } = await import("./tools.server");
      const conn = await activeMailProvider(args.userId);
      const key = (conn as any)?.key as string | undefined;
      if (!key || !draft.provider_draft_id) throw new Error("sem rascunho no provedor");
      const g = await import("./gmail/gmail.server");
      await g.confirmAndSendDraft(key, draft.provider_draft_id, true);
      sent = true;
    } catch (err) {
      await supabaseAdmin
        .from("email_drafts")
        .update({ status: "pending" } as never)
        .eq("id", draft.id);
      return { status: "failed", error: err instanceof Error ? err.message : String(err) };
    }
  }

  await supabaseAdmin
    .from("email_drafts")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      sent_body: draft.body,
    } as never)
    .eq("id", draft.id);

  try {
    await supabaseAdmin.from("admin_audit_logs").insert({
      admin_user_id: null,
      action: "email.enviado",
      target_user_id: args.userId,
      resource_type: "email_draft",
      resource_id: draft.id,
      reason: manual
        ? "Rascunho autorizado pelo consultor; envio final na caixa do provedor."
        : "Email enviado após confirmação explícita do consultor.",
      metadata: {
        channel: args.channel,
        provider: draft.provider,
        to: draft.to_emails,
        subject: draft.subject,
        confirmation_text: args.confirmationText.slice(0, 500),
        manual_send: manual,
        source: "email/reply-draft",
      },
    } as never);
  } catch {
    /* auditoria nunca bloqueia o fluxo */
  }

  return sent ? { status: "sent" } : { status: "manual" };
}

/**
 * Caminho determinístico de confirmação/iteração de um rascunho de email.
 * Devolve `null` quando a mensagem não tem nada a ver com o rascunho — aí o
 * motor segue o seu curso normal. A IA nunca decide enviar: só isto envia.
 */
export async function handleDraftConfirmation(args: {
  userId: string;
  channel: string;
  text: string;
}): Promise<{ reply: string } | null> {
  const {
    classifyDraftReply,
    AMBIGUOUS_REPLY,
    alreadySentReply,
    cancelConfirmationReply,
    cancelledReply,
    expiredReply,
    exhaustedReply,
    iterationExhausted,
    manualSendReply,
    rejectedReply,
    sentReply,
  } = await import("./reply-draft");

  const intent = classifyDraftReply(args.text);
  if (intent === "unknown") return null;

  const draft = await latestPendingDraft(args.userId, args.channel);
  if (!draft) return null;

  if (isAlreadySent(draft)) {
    // Idempotência: segunda confirmação sobre o mesmo rascunho não reenvia.
    return intent === "send" ? { reply: alreadySentReply() } : null;
  }
  const { isDraftCancelled } = await import("./reply-draft");
  if (isDraftCancelled(draft)) {
    // Estado terminal: "enviar" depois de um cancelamento não vale nada.
    return intent === "send" ? { reply: cancelledReply() } : null;
  }
  if (draft.status !== "pending") return null;

  const label = draft.to_name || draft.to_emails?.[0] || "o destinatário";

  if (intent === "reject") {
    const outcome = await cancelDraft({
      userId: args.userId,
      draftId: draft.id,
      source: "canal",
      reason: args.text.slice(0, 500),
      channel: args.channel,
    });
    return {
      reply: outcome.status === "cancelled" ? cancelConfirmationReply(label) : rejectedReply(),
    };
  }

  if (isDraftExpired(draft.expires_at)) return { reply: expiredReply(draft.id) };

  if (intent === "ambiguous") return { reply: AMBIGUOUS_REPLY };

  if (intent === "edit") {
    if (iterationExhausted(draft.revisions)) return { reply: exhaustedReply(draft.id) };
    const { activeMailProvider } = await import("./tools.server");
    const conn = (await activeMailProvider(args.userId)) as { provider: MailProvider; key: string } | null;
    if (!conn?.key || !draft.in_reply_to_message_id) return { reply: exhaustedReply(draft.id) };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("email_drafts")
      .update({ status: "discarded" } as never)
      .eq("id", draft.id)
      .eq("user_id", args.userId);

    const next = await createDraftForMessage({
      userId: args.userId,
      channel: args.channel,
      provider: conn.provider,
      key: conn.key,
      message: {
        id: draft.in_reply_to_message_id,
        from: `${draft.to_name ?? ""} <${draft.to_emails?.[0] ?? ""}>`,
        subject: draft.subject ?? null,
      } as MailMessageHead,
      instructions: args.text,
      revisions: Number(draft.revisions ?? 0) + 1,
    });
    const { withSuggestionAndQuestion } = await import(
      "@/lib/assessor/culture/suggested-message"
    );
    return {
      reply: withSuggestionAndQuestion(
        "Reescrevi com essa alteração:",
        next.body,
        next.question,
      ),
    };
  }

  const outcome = await sendConfirmedDraft({
    userId: args.userId,
    draftId: draft.id,
    confirmationText: args.text,
    channel: args.channel,
    confirmed: true,
  });
  if (outcome.status === "sent") return { reply: sentReply(label) };
  if (outcome.status === "manual") return { reply: manualSendReply(label) };
  if (outcome.status === "already_sent") return { reply: alreadySentReply() };
  if (outcome.status === "expired") return { reply: expiredReply(draft.id) };
  return {
    reply: "Não consegui concluir o envio agora. O rascunho continua na tua caixa — queres tentar outra vez?",
  };
}
