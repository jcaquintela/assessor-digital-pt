// Email de iniciativa a um lead/contacto — lado servidor.
//
// Fluxo: resolver PESSOA (mesmas regras já testadas em resolve-person) →
// garantir endereço de email → montar contexto da ficha (buildPersonBrief, já
// filtrado de notas confidenciais) → gerar corpo → gravar em `email_drafts`
// (kind='outbound', status='pending') → criar o rascunho real no provedor →
// apresentar no canal.
//
// Nunca envia. O envio continua a viver só em `sendConfirmedDraft`, disparado
// pelo caminho determinístico de confirmação.

import { DRAFT_TTL_MS, draftConfirmationQuestion } from "./reply-draft";
import {
  emailFromText,
  missingEmailQuestion,
  outboundIntro,
  outboundPreview,
  outboundSubject,
} from "./outbound-draft";
import type { MailProvider } from "./providers";
import type { PersonBrief } from "@/lib/assessor/v3/person-brief";

type Ctx = { userId: string; channel?: string | null };
type Result = { ok: boolean; data?: unknown; error?: string };

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.6-flash";

/** Contexto da ficha em linhas curtas — o que o LLM pode usar sem inventar. */
export function briefContextLines(brief: PersonBrief): string[] {
  const lines: string[] = [];
  if (brief.relationship) lines.push(`Relação: ${brief.relationship}`);
  if (brief.lastInteraction?.text) {
    lines.push(`Última conversa registada: ${brief.lastInteraction.text.slice(0, 500)}`);
  }
  for (const p of brief.properties ?? []) {
    const bits = [p.title, p.status ? `estado ${p.status}` : "", p.price ? `${p.price} €` : ""]
      .filter(Boolean)
      .join(", ");
    lines.push(`Imóvel: ${bits}`);
  }
  for (const d of brief.deals ?? []) {
    const bits = [d.label, d.status ?? "", d.value ? `${d.value} €` : ""].filter(Boolean).join(", ");
    lines.push(`Negócio: ${bits}`);
  }
  if (brief.nextAction?.text) {
    lines.push(
      `Próxima acção combinada: ${brief.nextAction.text}${brief.nextAction.when ? ` (${brief.nextAction.when})` : ""}`,
    );
  }
  return lines;
}

/**
 * Corpo de um email de iniciativa. Mesmo tom do rascunho de resposta:
 * PT-PT, 3 a 8 linhas, sem inventar valores, datas nem compromissos.
 */
export async function composeOutboundBody(args: {
  toName: string;
  contextLines: string[];
  instructions?: string | null;
  consultantName?: string | null;
}): Promise<string> {
  const key = process.env['LOVABLE_API_KEY'];
  const signature = args.consultantName
    ? `\n\nCom os melhores cumprimentos,\n${args.consultantName}`
    : "";
  if (!key) {
    return `Olá ${args.toName},\n\nEspero que esteja tudo bem. Volto a contactar-te para retomarmos o assunto que ficou pendente.${signature}`;
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
            "Escreves um email de INICIATIVA do consultor para o contacto (não é resposta a nada).",
            "Só o corpo do email: sem assunto, sem markdown, sem comentários.",
            "Tom cordial e directo, 3 a 8 linhas. Usa o contexto dado, mas não inventes valores, datas nem compromissos que não estejam nesse contexto ou nas instruções.",
            args.consultantName
              ? `Assina como ${args.consultantName}.`
              : "Termina com uma despedida simples.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `Destinatário: ${args.toName}`,
            args.instructions ? `Instruções do consultor: ${args.instructions}` : "",
            args.contextLines.length ? "\nContexto da ficha deste contacto:" : "",
            ...args.contextLines,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error(`Rascunho de email de saída falhou [${res.status}]: ${t}`);
    throw new Error(`Rascunho falhou [${res.status}]`);
  }
  const json = await res.json();
  const body = String(json?.choices?.[0]?.message?.content ?? "").trim();
  if (!body) throw new Error("rascunho vazio");
  return body;
}

export interface OutboundPresentation {
  draft_id: string;
  kind: "outbound";
  to: string;
  to_name: string;
  subject: string;
  body: string;
  provider: MailProvider;
  manual_send: boolean;
  /** Assunto + corpo, tal como vai sair. Bolha de pré-visualização. */
  preview: string;
  intro: string;
  question: string;
  note?: string | null;
}

/** Cria (ou reescreve) o rascunho de saída e devolve a apresentação. */
export async function createOutboundDraft(args: {
  userId: string;
  channel: string;
  provider: MailProvider;
  key: string;
  personId: string;
  personName: string;
  to: string;
  instructions?: string | null;
  subjectHint?: string | null;
  revisions?: number;
  note?: string | null;
}): Promise<OutboundPresentation> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { buildPersonBrief } = await import("@/lib/assessor/v3/person-brief.server");

  const lookup = await buildPersonBrief(
    { supabase: supabaseAdmin, userId: args.userId } as never,
    args.personName,
    { outward: true, personId: args.personId },
  );
  const brief: PersonBrief | null = lookup.kind === "ok" ? lookup.brief : null;

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("name")
    .eq("id", args.userId)
    .maybeSingle();
  const consultantName = (prof as any)?.name ?? null;

  const contextLines = brief ? briefContextLines(brief) : [];
  const body = await composeOutboundBody({
    toName: args.personName,
    contextLines,
    instructions: args.instructions ?? null,
    consultantName,
  });
  const subject = outboundSubject({
    propertyTitle: brief?.properties?.[0]?.title ?? null,
    dealLabel: brief?.deals?.[0]?.label ?? null,
    consultantName,
    subjectHint: args.subjectHint ?? null,
  });

  // Rascunho real na caixa do consultor — nunca enviado aqui.
  let providerDraftId: string | null = null;
  try {
    const { providerCreateDraft } = await import("./reply-draft.server");
    const r = await providerCreateDraft(args.provider, args.key, {
      to: [args.to],
      subject,
      body,
    });
    providerDraftId = r.draftId || null;
  } catch (err) {
    console.error("createDraft no provedor falhou:", err instanceof Error ? err.message : err);
  }

  const { data: row, error } = await supabaseAdmin
    .from("email_drafts")
    .insert({
      user_id: args.userId,
      provider: args.provider,
      provider_draft_id: providerDraftId,
      to_emails: [args.to],
      to_name: args.personName,
      subject,
      body,
      status: "pending",
      kind: "outbound",
      person_id: args.personId,
      channel: args.channel,
      in_reply_to_message_id: null,
      revisions: args.revisions ?? 0,
      expires_at: new Date(Date.now() + DRAFT_TTL_MS).toISOString(),
    } as never)
    .select("id")
    .single();
  if (error || !row) throw new Error(error?.message ?? "rascunho não gravado");

  const draftId = String((row as any).id);
  const manualSend = args.provider !== "gmail";
  return {
    draft_id: draftId,
    kind: "outbound",
    to: args.to,
    to_name: args.personName,
    subject,
    body,
    provider: args.provider,
    manual_send: manualSend,
    preview: outboundPreview({ to: args.to, subject, body }),
    intro: outboundIntro({ toName: args.personName, subject, manualSend }),
    question: draftConfirmationQuestion({ draftId, manualSend }),
    note: args.note ?? null,
  };
}

/** Ficha da pessoa: nome + email actual. */
async function loadPerson(userId: string, personId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("people")
    .select("id, name, email")
    .eq("id", personId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as { id: string; name: string | null; email: string | null } | null) ?? null;
}

/** Grava o endereço na ficha (o trigger normaliza `email_normalized`). */
async function savePersonEmail(userId: string, personId: string, email: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("people")
    .update({ email } as never)
    .eq("id", personId)
    .eq("user_id", userId);
}

/** Fica à espera do endereço para retomar exactamente este email. */
async function rememberAwaitingEmail(args: {
  userId: string;
  channel: string;
  personId: string;
  personName: string;
  instructions: string | null;
  originalContent: string;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("pending_actions")
    .update({ status: "cancelled" } as never)
    .eq("user_id", args.userId)
    .eq("channel", args.channel)
    .eq("intent", "outbound_email_address")
    .eq("status", "collecting_information");
  await supabaseAdmin.from("pending_actions").insert({
    user_id: args.userId,
    channel: args.channel,
    intent: "outbound_email_address",
    status: "collecting_information",
    original_content: args.originalContent.slice(0, 2000),
    missing_fields: ["email"],
    pending_question: missingEmailQuestion(args.personName),
    structured_payload: {
      person_id: args.personId,
      person_name: args.personName,
      instructions: args.instructions,
    },
    expires_at: new Date(Date.now() + DRAFT_TTL_MS).toISOString(),
  } as never);
}

/**
 * Ferramenta `compose_email_to_contact` — só PROPÕE. Nunca envia.
 * Resolução de destinatário é resolução de PESSOA: sem certeza, pergunta.
 */
export async function execComposeEmailToContact(ctx: Ctx, args: unknown): Promise<Result> {
  const a = (args ?? {}) as {
    person_id?: string | null;
    person_name?: string | null;
    email?: string | null;
    subject?: string | null;
    instructions?: string | null;
  };
  const { hasEmailModule } = await import("@/lib/subscription/email-gate.server");
  if (!(await hasEmailModule(ctx.userId))) return { ok: true, data: { plan_required: true } };

  const { activeMailProvider, MailAuthExpired } = await import("./tools.server");
  const conn = await activeMailProvider(ctx.userId);
  if (!conn) return { ok: true, data: { not_connected: true } };
  if ((conn as any).needsChoice) {
    return { ok: true, data: { needs_provider_choice: true, options: (conn as any).options } };
  }
  const active = conn as { provider: MailProvider; key: string };
  const channel = String(ctx.channel ?? "dashboard");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  try {
    // 1) Quem é o destinatário. Sem certeza, perguntamos antes de compor.
    let personId = String(a.person_id ?? "").trim() || null;
    let personName = String(a.person_name ?? "").trim();

    if (!personId) {
      if (!personName) {
        return { ok: true, data: { needs_person_name: true } };
      }
      const { resolvePersonForWrite, personResolutionQuestion } = await import(
        "@/lib/people/resolve-person.server"
      );
      const res = await resolvePersonForWrite(
        { supabase: supabaseAdmin, userId: ctx.userId, channel },
        "",
        { nameOverride: personName },
      );
      if (res.status === "linked" || res.status === "confirm_exact") {
        personId = res.personId;
        personName = res.name ?? personName;
      } else {
        return {
          ok: true,
          data: {
            needs_person_choice: true,
            status: res.status,
            question: personResolutionQuestion(res),
            candidates: res.candidates.map((c) => ({ id: c.id, name: c.name })),
          },
        };
      }
    }
    if (!personId) return { ok: true, data: { needs_person_name: true } };

    const person = await loadPerson(ctx.userId, personId);
    if (!person) return { ok: true, data: { needs_person_name: true } };
    personName = String(person.name ?? personName ?? "").trim() || personName;

    // 2) Endereço. Nunca inventamos: se não há, pedimos e guardamos.
    let note: string | null = null;
    let to = String(person.email ?? "").trim();
    const given = emailFromText(a.email);
    if (given && given !== to.toLowerCase()) {
      await savePersonEmail(ctx.userId, personId, given);
      const { emailSavedNote } = await import("./outbound-draft");
      note = emailSavedNote(personName);
      to = given;
    }
    if (!to) {
      await rememberAwaitingEmail({
        userId: ctx.userId,
        channel,
        personId,
        personName,
        instructions: a.instructions ?? null,
        originalContent: String(a.instructions ?? `email para ${personName}`),
      });
      return {
        ok: true,
        data: {
          needs_email_address: true,
          person_id: personId,
          person_name: personName,
          question: missingEmailQuestion(personName),
        },
      };
    }

    const created = await createOutboundDraft({
      userId: ctx.userId,
      channel,
      provider: active.provider,
      key: active.key,
      personId,
      personName,
      to,
      instructions: a.instructions ?? null,
      subjectHint: a.subject ?? null,
      note,
    });
    return { ok: true, data: created };
  } catch (err) {
    if (err instanceof MailAuthExpired) return { ok: true, data: { needs_reconnect: true } };
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * O consultor respondeu com o endereço que faltava. Caminho determinístico:
 * grava na ficha e retoma o mesmo email, sem depender do LLM.
 */
export async function handleAwaitingEmailAddress(args: {
  userId: string;
  channel: string;
  text: string;
}): Promise<{ reply: string } | null> {
  const email = emailFromText(args.text);
  if (!email) return null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("pending_actions")
    .select("id, structured_payload, expires_at")
    .eq("user_id", args.userId)
    .eq("channel", args.channel)
    .eq("intent", "outbound_email_address")
    .eq("status", "collecting_information")
    .order("created_at", { ascending: false })
    .limit(1);
  const row = (((data as any[]) ?? [])[0] ?? null) as
    | { id: string; structured_payload: any; expires_at: string | null }
    | null;
  if (!row) return null;
  if (row.expires_at && Date.parse(row.expires_at) < Date.now()) {
    await supabaseAdmin
      .from("pending_actions")
      .update({ status: "expired" } as never)
      .eq("id", row.id);
    return null;
  }

  const personId = String(row.structured_payload?.person_id ?? "");
  const personName = String(row.structured_payload?.person_name ?? "").trim();
  if (!personId) return null;

  const { activeMailProvider } = await import("./tools.server");
  const conn = (await activeMailProvider(args.userId)) as
    | { provider: MailProvider; key: string }
    | null;
  if (!conn?.key) return null;

  await savePersonEmail(args.userId, personId, email);
  await supabaseAdmin
    .from("pending_actions")
    .update({ status: "executed" } as never)
    .eq("id", row.id);

  const { emailSavedNote } = await import("./outbound-draft");
  const created = await createOutboundDraft({
    userId: args.userId,
    channel: args.channel,
    provider: conn.provider,
    key: conn.key,
    personId,
    personName,
    to: email,
    instructions: row.structured_payload?.instructions ?? null,
    note: emailSavedNote(personName),
  });

  const { withSuggestionAndQuestion } = await import("@/lib/assessor/culture/suggested-message");
  return {
    reply: withSuggestionAndQuestion(
      `${emailSavedNote(personName)} ${created.intro}`.trim(),
      created.preview,
      created.question,
    ),
  };
}

/**
 * "muda o fim para X": descarta o rascunho de saída actual e escreve outro
 * para a mesma pessoa, contando a revisão. Devolve null se não houver pessoa
 * ou destinatário para reaproveitar.
 */
export async function reviseOutboundDraft(args: {
  userId: string;
  channel: string;
  provider: MailProvider;
  key: string;
  draft: { id: string; person_id?: string | null; to_emails?: string[] | null; to_name?: string | null; revisions?: number | null };
  instructions: string;
}): Promise<OutboundPresentation | null> {
  const to = args.draft.to_emails?.[0] ?? null;
  const personId = args.draft.person_id ?? null;
  if (!to || !personId) return null;

  const person = await loadPerson(args.userId, personId);
  const personName = person?.name ?? args.draft.to_name ?? "";
  if (!personName) return null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("email_drafts")
    .update({ status: "discarded" } as never)
    .eq("id", args.draft.id)
    .eq("user_id", args.userId);

  return createOutboundDraft({
    userId: args.userId,
    channel: args.channel,
    provider: args.provider,
    key: args.key,
    personId,
    personName,
    to,
    instructions: args.instructions,
    revisions: Number(args.draft.revisions ?? 0) + 1,
  });
}
