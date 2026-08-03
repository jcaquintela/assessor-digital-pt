// Recuperador do Drive — camada de canal.
// Entrega o ficheiro real (WhatsApp Media API / sendDocument do Telegram),
// nunca apenas uma descrição.

import type { ChannelAdapter } from "@/lib/assessor/channel-gateway/types";
import { detectDocumentRequest, formatCandidateList, parseChoice } from "./retrieve";
import { findDocuments, findDocumentsForSubject, loadDocument, type DocHit } from "./retrieve.server";

export const DOC_CHOICE_INTENT = "choosing_document";

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
 * Trata pedidos de documentos. Devolve true quando já respondeu ao turno.
 */
export async function handleDocumentRequest(
  adapter: ChannelAdapter,
  supabase: any,
  args: { userId: string; to: string; content: string },
): Promise<boolean> {
  const { userId, to, content } = args;
  try {
    const { findActivePendingAction, createPendingAction, markPendingActionStatus } = await import(
      "@/lib/assessor/memory.server"
    );
    const pending = await findActivePendingAction(supabase, userId, adapter.channel);

    // (1) Escolha de um documento de uma lista proposta antes.
    if (pending?.intent === DOC_CHOICE_INTENT) {
      const candidates = ((pending.structured_payload as any)?.candidates ?? []) as DocHit[];
      const idx = parseChoice(content, candidates.length);
      if (idx === null) {
        // Não é uma escolha — deixa o turno seguir para o motor normal.
        await markPendingActionStatus(supabase, pending.id, "cancelled");
        return false;
      }
      await markPendingActionStatus(supabase, pending.id, "executed");
      await deliverDocument(adapter, supabase, userId, to, candidates[idx]!);
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
      const header = `Tenho ${hits.length} documento${hits.length > 1 ? "s" : ""}${label ? ` de ${label}` : ""}:`;
      const text = formatCandidateList(
        hits.map((h) => ({ fileName: h.fileName, label: h.docType })),
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
      await say(adapter, supabase, userId, to, text);
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
      const ok = await deliverDocument(adapter, supabase, userId, to, hits[0]!);
      return ok || true;
    }
    const text = formatCandidateList(
      hits.map((h) => ({ fileName: h.fileName, label: h.entityLabels[0] ?? h.docType })),
      "Tenho estes que encaixam:",
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
    await say(adapter, supabase, userId, to, text);
    return true;
  } catch (err) {
    console.error(
      `[drive/retrieve] ${adapter.channel}:`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
