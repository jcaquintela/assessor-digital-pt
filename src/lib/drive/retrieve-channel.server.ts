// Recuperador do Drive — camada de canal.
// Entrega o ficheiro real (WhatsApp Media API / sendDocument do Telegram),
// nunca apenas uma descrição.

import type { ChannelAdapter } from "@/lib/assessor/channel-gateway/types";
import {
  detectDocumentRequest,
  docOptionLabel,
  encodeDocCommand,
  formatCandidateList,
  parseChoice,
  parseDocCommand,
  shortDocId,
} from "./retrieve";
import { findDocuments, findDocumentsForSubject, loadDocument, type DocHit } from "./retrieve.server";

export const DOC_CHOICE_INTENT = "choosing_document";
export const DOC_CONFIRM_INTENT = "confirming_document_send";

const DOC_CANCEL_COMMAND = "#documento-nao";

/** Preferência opcional: perguntar antes de enviar o ficheiro. */
async function wantsConfirmation(supabase: any, userId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("consultant_preferences")
      .select("confirm_document_send")
      .eq("user_id", userId)
      .maybeSingle();
    return (data as { confirm_document_send?: boolean } | null)?.confirm_document_send === true;
  } catch {
    return false;
  }
}

const YES = /^(s|sim|sim!|claro|ok|okay|okey|certo|isso|manda|envia|pode ser|pode|vai|força|é esse|esse mesmo|confirmo|confirma|yes)\b/i;
const NO = /^(n|não|nao|nope|deixa|esquece|cancela|cancelar|agora não|agora nao|outro|nem|no)\b/i;

/**
 * Pergunta antes de enviar (só quando o consultor ativou a confirmação).
 * Devolve true quando ficou a aguardar resposta.
 */
async function confirmBeforeSending(
  adapter: ChannelAdapter,
  supabase: any,
  args: { userId: string; to: string; content: string; hit: DocHit },
): Promise<boolean> {
  const { userId, to, content, hit } = args;
  if (!(await wantsConfirmation(supabase, userId))) return false;

  const { createPendingAction } = await import("@/lib/assessor/memory.server");
  const { encodeInteractiveId } = await import("@/lib/assessor/interactive");
  const where = hit.entityLabels[0] ? ` (${hit.entityLabels[0]})` : "";
  const question = `Envio-te "${hit.fileName}"${where}?`;

  await createPendingAction(supabase, {
    userId,
    channel: adapter.channel,
    intent: DOC_CONFIRM_INTENT,
    originalContent: content,
    payload: { hit },
    pendingQuestion: question,
    currentQuestion: question,
  });

  let sent = false;
  if (adapter.sendInteractive) {
    try {
      const r = await adapter.sendInteractive(to, {
        kind: "buttons",
        body: question,
        options: [
          { id: encodeInteractiveId(encodeDocCommand(hit.id)), label: "Sim, envia" },
          { id: encodeInteractiveId(DOC_CANCEL_COMMAND), label: "Agora não" },
        ],
      });
      sent = r.ok;
    } catch { /* cai para texto */ }
  }
  if (sent) {
    try {
      await supabase.from("assessor_messages").insert({
        user_id: userId,
        role: "assistant",
        content: question,
        message_type: `${adapter.channel}_interactive`,
        status: "sent",
        channel: adapter.channel,
        sender_phone: to,
      } as never);
    } catch { /* noop */ }
  } else {
    await say(adapter, supabase, userId, to, question);
  }
  return true;
}

async function say(
  adapter: ChannelAdapter,
  supabase: any,
  userId: string,
  to: string,
  text: string,
): Promise<void> {
  const send = await adapter.sendText(to, text);
  try {
    await supabase.from("assessor_messages").insert({
      user_id: userId,
      role: "assistant",
      content: text,
      message_type: `${adapter.channel}_text`,
      status: send.ok ? "sent" : "failed",
      channel: adapter.channel,
      sender_phone: to,
    } as never);
  } catch { /* noop */ }
}

/** Descarrega e envia como anexo. Devolve true se o ficheiro chegou mesmo. */
export async function deliverDocument(
  adapter: ChannelAdapter,
  supabase: any,
  userId: string,
  to: string,
  hit: DocHit,
): Promise<boolean> {
  const doc = await loadDocument(supabase, userId, hit.id);
  if (!doc.ok) {
    await say(adapter, supabase, userId, to, `Encontrei "${hit.fileName}" mas não consegui abrir o ficheiro. Vê no Drive.`);
    return false;
  }
  if (!adapter.sendDocument) {
    await say(adapter, supabase, userId, to, `Aqui tens "${doc.fileName}": ${doc.signedUrl ?? "está no Drive"}`);
    return false;
  }
  const caption = hit.entityLabels[0] ? `${doc.fileName} — ${hit.entityLabels[0]}` : doc.fileName;
  const r = await adapter.sendDocument(to, {
    bytes: doc.bytes,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    caption,
    url: doc.signedUrl,
  });
  if (!r.ok) {
    await say(
      adapter,
      supabase,
      userId,
      to,
      doc.signedUrl
        ? `Não consegui anexar o ficheiro aqui. Fica o link (válido 10 minutos): ${doc.signedUrl}`
        : `Não consegui enviar "${doc.fileName}". Está no Drive.`,
    );
    return false;
  }
  try {
    await supabase.from("assessor_messages").insert({
      user_id: userId,
      role: "assistant",
      content: `[documento] ${doc.fileName}`,
      message_type: `${adapter.channel}_document`,
      status: "sent",
      channel: adapter.channel,
      sender_phone: to,
      whatsapp_message_id: r.messageId ?? null,
    } as never);
  } catch { /* noop */ }
  return true;
}


/**
 * Ecrã conversacional de escolha: mostra os documentos possíveis como opções
 * tocáveis (botões até 3, lista até 10) e guarda os candidatos no rascunho
 * para a resposta seguinte — por toque ou pelo número escrito.
 */
async function askWhichDocument(
  adapter: ChannelAdapter,
  supabase: any,
  args: { userId: string; to: string; content: string; header: string; hits: DocHit[] },
): Promise<void> {
  const { userId, to, content, header, hits } = args;
  const { createPendingAction } = await import("@/lib/assessor/memory.server");
  const { encodeInteractiveId } = await import("@/lib/assessor/interactive");

  const text = formatCandidateList(
    hits.map((h) => ({ fileName: h.fileName, label: h.entityLabels[0] ?? h.docType })),
    header,
  );

  await createPendingAction(supabase, {
    userId,
    channel: adapter.channel,
    intent: DOC_CHOICE_INTENT,
    originalContent: content,
    payload: { candidates: hits },
    pendingQuestion: text,
    currentQuestion: text,
  });

  const options = hits.slice(0, 10).map((h) => ({
    id: encodeInteractiveId(encodeDocCommand(h.id)),
    label: docOptionLabel(h.fileName),
    description: h.entityLabels[0] ?? h.docType ?? null,
  }));

  let sent = false;
  if (adapter.sendInteractive) {
    try {
      const r = await adapter.sendInteractive(to, {
        kind: options.length <= 3 ? "buttons" : "list",
        body: `${header}\n\nToca no que queres que te mande.`,
        options,
        listButtonLabel: "Ver documentos",
      });
      sent = r.ok;
      if (!r.ok) {
        console.error(`[drive/retrieve] interactive falhou (${adapter.channel}):`, r.error ?? "");
      }
    } catch (err) {
      console.error(
        `[drive/retrieve] interactive (${adapter.channel}):`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (sent) {
    try {
      await supabase.from("assessor_messages").insert({
        user_id: userId,
        role: "assistant",
        content: text,
        message_type: `${adapter.channel}_interactive`,
        status: "sent",
        channel: adapter.channel,
        sender_phone: to,
      } as never);
    } catch { /* noop */ }
    return;
  }

  // Canal sem botões (ou fora da janela): a mesma lista numerada em texto.
  await say(adapter, supabase, userId, to, text);
}

/**
 * Trata pedidos de documentos. Devolve true quando já respondeu ao turno.
 */
export async function handleDocumentRequest(
  adapter: ChannelAdapter,
  supabase: any,
  args: { userId: string; to: string; content: string },
): Promise<boolean> {
  const { userId, to, content } = args;
  try {
    const { findActivePendingAction, markPendingActionStatus } = await import(
      "@/lib/assessor/memory.server"
    );
    const pending = await findActivePendingAction(supabase, userId, adapter.channel);

    // (0a) Resposta a uma confirmação de envio pendente.
    if (pending?.intent === DOC_CONFIRM_INTENT) {
      const hit = (pending.structured_payload as any)?.hit as DocHit | undefined;
      const raw = content.trim();
      const said = parseDocCommand(raw);
      const yes = Boolean(hit) && (YES.test(raw) || (said !== null && said === shortDocId(hit!.id)));
      const no = raw === DOC_CANCEL_COMMAND || NO.test(raw);
      if (yes) {
        await markPendingActionStatus(supabase, pending.id, "executed");
        await deliverDocument(adapter, supabase, userId, to, hit!);
        return true;
      }
      if (no) {
        await markPendingActionStatus(supabase, pending.id, "cancelled");
        await say(adapter, supabase, userId, to, "Está bem, não envio. Diz-me se mudares de ideias.");
        return true;
      }
      // Não é resposta à pergunta — segue o turno normal.
      await markPendingActionStatus(supabase, pending.id, "cancelled");
      return false;
    }

    // (0b) Toque numa das opções da lista de escolha.
    const cmd = parseDocCommand(content);
    if (cmd) {
      const candidates = ((pending?.structured_payload as any)?.candidates ?? []) as DocHit[];
      let hit = candidates.find((c) => shortDocId(c.id) === cmd) ?? null;
      if (!hit) {
        const { data: row } = await supabase
          .from("uploaded_files")
          .select("id, original_file_name, internal_file_name, mime_type, document_type")
          .eq("user_id", userId)
          .is("deleted_at", null)
          .ilike("id::text", `${cmd.slice(0, 8)}%`)
          .maybeSingle();
        if (row) {
          hit = {
            id: row.id,
            fileName: String(row.original_file_name ?? row.internal_file_name ?? "documento"),
            mimeType: String(row.mime_type ?? "application/octet-stream"),
            storagePath: null,
            docType: row.document_type ?? null,
            summary: null,
            entityLabels: [],
            score: 1,
          };
        }
      }
      if (pending?.intent === DOC_CHOICE_INTENT) {
        await markPendingActionStatus(supabase, pending.id, "executed");
      }
      if (!hit) {
        await say(adapter, supabase, userId, to, "Esse documento já não está disponível. Diz-me outra vez qual queres.");
        return true;
      }
      if (await confirmBeforeSending(adapter, supabase, { userId, to, content, hit })) return true;
      await deliverDocument(adapter, supabase, userId, to, hit);
      return true;
    }

    // (1) Escolha escrita ("o 2", "o primeiro") de uma lista proposta antes.
    if (pending?.intent === DOC_CHOICE_INTENT) {
      const candidates = ((pending.structured_payload as any)?.candidates ?? []) as DocHit[];
      const idx = parseChoice(content, candidates.length);
      if (idx === null) {
        // Não é uma escolha — deixa o turno seguir para o motor normal.
        await markPendingActionStatus(supabase, pending.id, "cancelled");
        return false;
      }
      await markPendingActionStatus(supabase, pending.id, "executed");
      const chosen = candidates[idx]!;
      if (await confirmBeforeSending(adapter, supabase, { userId, to, content, hit: chosen })) return true;
      await deliverDocument(adapter, supabase, userId, to, chosen);
      return true;
    }

    const req = detectDocumentRequest(content);
    if (!req) return false;

    // (2) "Que documentos tenho da Sra. Ana?"
    if (req.kind === "list") {
      if (!req.subject) return false;
      const { label, hits } = await findDocumentsForSubject(supabase, userId, req.subject);
      if (!hits.length) {
        await say(adapter, supabase, userId, to, `Não tenho documentos guardados${label ? ` de ${label}` : ` sobre "${req.subject}"`}.`);
        return true;
      }
      if (hits.length === 1) {
        const only = hits[0]!;
        if (await confirmBeforeSending(adapter, supabase, { userId, to, content, hit: only })) return true;
        await deliverDocument(adapter, supabase, userId, to, only);
        return true;
      }
      const header = `Tenho ${hits.length} documentos${label ? ` de ${label}` : ""}:`;
      await askWhichDocument(adapter, supabase, { userId, to, content, header, hits });
      return true;
    }

    // (3) "Manda-me a caderneta predial do T2 de Benfica"
    const hits = await findDocuments(supabase, userId, {
      docType: req.docType,
      docLabel: req.docLabel,
      subject: req.subject,
    });
    if (!hits.length) {
      const what = req.docLabel ?? "esse documento";
      const where = req.subject ? ` de ${req.subject}` : "";
      await say(adapter, supabase, userId, to, `Não encontrei ${what}${where} no Drive. Se mo enviares, guardo já.`);
      return true;
    }
    if (hits.length === 1 || hits[0]!.score >= (hits[1]?.score ?? 0) + 3) {
      const best = hits[0]!;
      if (await confirmBeforeSending(adapter, supabase, { userId, to, content, hit: best })) return true;
      const ok = await deliverDocument(adapter, supabase, userId, to, best);
      return ok || true;
    }
    await askWhichDocument(adapter, supabase, {
      userId,
      to,
      content,
      header: "Tenho estes que encaixam:",
      hits,
    });
    return true;
  } catch (err) {
    console.error(
      `[drive/retrieve] ${adapter.channel}:`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
