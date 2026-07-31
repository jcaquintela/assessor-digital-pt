// Cartão de visita → contacto.
// Reutiliza a leitura de imagem já existente (vision.server), o padrão de
// confirmação por rascunho (pending_actions) e o gerador de vCard já usado
// na exportação de Pessoas. A IA nunca escreve na BD: só lê o cartão.

import type { ImageReading } from "@/lib/ai/vision.server";
import { buildVCards } from "@/lib/export/download";

export interface BusinessCard {
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  jobTitle: string | null;
}

export const BUSINESS_CARD_INTENT = "create_contact_from_card";

function normalizePhone(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/[^\d+]/g, "");
  const only = digits.replace(/\D/g, "");
  if (only.length < 9) return null;
  return digits.startsWith("+") ? digits : only;
}

/** Extrai um contacto de uma leitura de imagem, ou null se não for cartão legível. */
export function extractBusinessCard(reading: ImageReading): BusinessCard | null {
  if (!reading.is_business_card || reading.is_sign) return null;
  const name = (reading.person_name ?? "").trim();
  if (!name || name.split(/\s+/).length < 1 || name.length < 3) return null;
  const phone = normalizePhone(reading.phones?.[0] ?? null);
  const email = reading.email && /\S+@\S+\.\S+/.test(reading.email) ? reading.email.trim() : null;
  if (!phone && !email) return null;
  return {
    name,
    phone,
    email,
    company: reading.company,
    jobTitle: reading.job_title,
  };
}

export function businessCardQuestion(card: BusinessCard): string {
  const bits = [card.name, card.phone ?? card.email].filter(Boolean).join(", ");
  return `Encontrei ${bits} no cartão. Registo e envio o ficheiro para guardares?`;
}

export function buildContactVCard(card: BusinessCard): { fileName: string; content: string } {
  const noteBits = [card.jobTitle, card.company].filter(Boolean).join(" — ");
  const content = buildVCards([
    {
      name: card.name,
      phone: card.phone,
      email: card.email,
      note: noteBits ? `${noteBits} (cartão de visita)` : "Cartão de visita",
    },
  ]);
  const slug = card.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "contacto";
  return { fileName: `${slug}.vcf`, content };
}

/** Cria o rascunho por confirmar. Devolve a pergunta a enviar ao consultor. */
export async function proposeBusinessCardContact(args: {
  supabase: any;
  userId: string;
  channel: string;
  card: BusinessCard;
  fileId: string | null;
  sourceMessageId: string | null;
}): Promise<string> {
  const { createPendingAction } = await import("./memory.server");
  const question = businessCardQuestion(args.card);
  await createPendingAction(args.supabase, {
    userId: args.userId,
    channel: args.channel,
    intent: BUSINESS_CARD_INTENT,
    originalContent: `[cartão de visita] ${args.card.name}`,
    payload: { card: args.card, file_id: args.fileId },
    pendingQuestion: question,
    currentQuestion: "confirm_business_card",
    sourceMessageId: args.sourceMessageId,
  });
  return question;
}

export interface BusinessCardConfirmResult {
  ok: boolean;
  reply: string;
  personId: string | null;
  card: BusinessCard | null;
  vcard: { fileName: string; content: string; signedUrl: string | null } | null;
}

/** Executa: cria a pessoa e prepara o vCard para reenvio ao consultor. */
export async function confirmBusinessCardContact(args: {
  supabase: any;
  userId: string;
  channel: string;
  card: BusinessCard;
  fileId?: string | null;
  sourceMessageId?: string | null;
}): Promise<BusinessCardConfirmResult> {
  const { supabase, userId, card } = args;

  // Evita duplicados óbvios pelo telefone/email.
  let existingId: string | null = null;
  try {
    const filters: string[] = [];
    if (card.phone) filters.push(`phone.eq.${card.phone}`);
    if (card.email) filters.push(`email.eq.${card.email}`);
    if (filters.length) {
      const { data } = await supabase
        .from("people")
        .select("id")
        .eq("user_id", userId)
        .or(filters.join(","))
        .limit(1);
      existingId = (data as any[])?.[0]?.id ?? null;
    }
  } catch { /* duplicado é best-effort */ }

  let personId = existingId;
  if (!personId) {
    const { data, error } = await supabase
      .from("people")
      .insert({
        user_id: userId,
        name: card.name,
        phone: card.phone,
        email: card.email,
        company: card.company,
        job_title: card.jobTitle,
        relationship_type: "other",
        summary: "Conheci por cartão de visita.",
        source_channel: args.channel,
        source_message_id: args.sourceMessageId ?? null,
        source_file_id: args.fileId ?? null,
      } as never)
      .select("id")
      .single();
    if (error || !data) {
      console.error("[business-card] insert people:", error?.message);
      return {
        ok: false,
        reply: "Não consegui guardar o contacto agora. Tenta outra vez daqui a pouco.",
        personId: null,
        card,
        vcard: null,
      };
    }
    personId = (data as { id: string }).id;
  }

  const vcf = buildContactVCard(card);

  // Guarda o .vcf no Drive privado (dá URL assinado para canais que enviam
  // ficheiros por link, ex.: Telegram).
  let signedUrl: string | null = null;
  try {
    const path = `${userId}/vcards/${crypto.randomUUID()}.vcf`;
    const up = await supabase.storage
      .from("assessor-files")
      .upload(path, new TextEncoder().encode(vcf.content), {
        contentType: "text/vcard",
        upsert: false,
      });
    if (!up.error) {
      const { data: signed } = await supabase.storage
        .from("assessor-files")
        .createSignedUrl(path, 60 * 60);
      signedUrl = signed?.signedUrl ?? null;
    }
  } catch (err) {
    console.error("[business-card] vcf upload:", err instanceof Error ? err.message : err);
  }

  const reply = existingId
    ? `Já tinha ${card.name} nos contactos. Envio-te o cartão para guardares no telemóvel.`
    : `Registei ${card.name}. Envio-te o cartão para guardares no telemóvel.`;

  return { ok: true, reply, personId, card, vcard: { ...vcf, signedUrl } };
}