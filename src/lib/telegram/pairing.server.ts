// Emparelhamento explícito de canais (Opção A) + consumo de deep link (Opção B).
//
// Problema que resolve: até aqui, um chat_id de Telegram desconhecido criava
// SEMPRE uma conta nova, mesmo quando o consultor já tinha conta ligada por
// WhatsApp. Resultado: contas fantasma vazias. Agora, antes de criar conta,
// o Afonso pergunta e — se já houver conta — confirma a posse do número com
// um código enviado para o WhatsApp (mesma lógica validada do LIGAR-XXXXXX).
//
// Server-only: usa node:crypto e o service role.

import { aiDisclosureOpening } from "@/lib/assessor/ai-disclosure";
import { normalizePhone } from "@/lib/whatsapp/phone";
import { sendWhatsAppText } from "@/lib/whatsapp/send.server";
import { linkChannelToUser } from "@/lib/assessor/channels.server";

export const PAIRING_TTL_MIN = 30;
export const PAIRING_MAX_ATTEMPTS = 5;
export const TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || "AfonsoAIbot";

export type PairingStep = "asked" | "awaiting_phone" | "awaiting_code";

export interface PairingRow {
  chat_id: string;
  step: PairingStep;
  target_user_id: string | null;
  phone: string | null;
  code_hash: string | null;
  attempts: number;
  expires_at: string;
}

export interface PairingOutcome {
  handled: boolean;
  reply?: string;
  userId?: string | null;
  stopPipeline?: boolean;
  createAccount?: boolean; // segue o fluxo antigo: cria conta nova 'base'
}

/* ---------------- Textos (PT-PT, curtos, sem jargão) ---------------- */

const ASK_WHATSAPP =
  `${aiDisclosureOpening()} Sou o assessor digital de quem trabalha em imobiliário: guardo pessoas, imóveis, visitas e seguimentos a partir do que me escreves, em linguagem normal.\n\n` +
  "Antes de começarmos: já falas comigo pelo WhatsApp? Responde só sim ou não. " +
  "Se sim, ligo os dois canais à mesma conta — não crio conta nova nem duplico nada.";

const ASK_PHONE =
  "Boa. Diz-me o número de WhatsApp que usas comigo, em formato internacional (por exemplo +351912345678).";

const ASK_AGAIN = "Só preciso de um sim ou um não: já falas comigo pelo WhatsApp?";

const PHONE_INVALID =
  "Esse número não me parece válido. Escreve-o em formato internacional, por exemplo +351912345678.";

const PHONE_NOT_FOUND =
  "Não encontrei nenhuma conta com esse número. Confirma o número, ou escreve criar para começarmos uma conta nova aqui.";

const CODE_SENT = (phone: string) =>
  `Enviei-te um código para o WhatsApp ${formatPhone(phone)}. Escreve-o aqui para eu ligar os dois canais.`;

const CODE_SEND_FAILED =
  "Não consegui enviar o código para esse WhatsApp. Escreve criar para começarmos uma conta nova aqui, ou tenta de novo daqui a pouco.";

const CODE_WRONG = (left: number) =>
  left > 0
    ? `Esse código não bate certo. Tens mais ${left} ${left === 1 ? "tentativa" : "tentativas"}.`
    : "Esse código não bate certo e esgotaste as tentativas. Escreve /start para recomeçar.";

const LINK_DONE =
  "Pronto — este Telegram ficou ligado à tua conta. Tens aqui tudo o que já tinhas no WhatsApp. Diz-me o que precisas.";

const TOKEN_INVALID =
  "Esse código de ligação já não é válido. Gera um novo em Definições → Canal ligado.";

function formatPhone(digits: string): string {
  return digits ? `+${digits}` : digits;
}

/* ---------------- Parsing ---------------- */

const YES = /^(sim|s|si|yes|claro|exacto|exato|correto|correcto|já|ja|uso|tenho|afirmativo|sim!|sim\.)$/i;
const NO = /^(n[aã]o|nao|n|nop|nunca|negativo|ainda n[aã]o|n[aã]o\.|n[aã]o!)$/i;
const CREATE = /^(criar|cria|nova|conta nova|come[çc]ar)$/i;

// Token do deep link gerado em Definições: /start tg_<32 hex> (ou só o token).
const TOKEN_RE = /^(?:\/start(?:@\w+)?\s+)?(tg_[a-f0-9]{32})$/i;

export function extractLinkToken(text: string | null | undefined): string | null {
  const m = (text ?? "").trim().match(TOKEN_RE);
  return m ? m[1].toLowerCase() : null;
}

export function isBareStart(text: string | null | undefined): boolean {
  return /^\/start(?:@\w+)?$/i.test((text ?? "").trim());
}

/* ---------------- Estado ---------------- */

function expiry(): string {
  return new Date(Date.now() + PAIRING_TTL_MIN * 60_000).toISOString();
}

export async function loadPairing(supabaseAdmin: any, chatId: string): Promise<PairingRow | null> {
  const { data } = await supabaseAdmin
    .from("telegram_pairings")
    .select("chat_id, step, target_user_id, phone, code_hash, attempts, expires_at")
    .eq("chat_id", chatId)
    .maybeSingle();
  const row = data as PairingRow | null;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await clearPairing(supabaseAdmin, chatId);
    return null;
  }
  return row;
}

async function savePairing(supabaseAdmin: any, chatId: string, patch: Partial<PairingRow>): Promise<void> {
  await supabaseAdmin.from("telegram_pairings").upsert(
    { chat_id: chatId, expires_at: expiry(), updated_at: new Date().toISOString(), ...patch },
    { onConflict: "chat_id" },
  );
}

export async function clearPairing(supabaseAdmin: any, chatId: string): Promise<void> {
  await supabaseAdmin.from("telegram_pairings").delete().eq("chat_id", chatId);
}

/* ---------------- Opção B: deep link com token de uso único ---------------- */

export async function consumeLinkToken(
  supabaseAdmin: any,
  token: string,
  chatId: string,
  displayName: string | null,
): Promise<PairingOutcome> {
  const { data } = await supabaseAdmin
    .from("telegram_link_tokens")
    .select("token, user_id, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();
  const row = data as { user_id: string; expires_at: string; used_at: string | null } | null;
  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
    return { handled: true, reply: TOKEN_INVALID };
  }

  await linkChannelToUser(supabaseAdmin, "telegram", chatId, row.user_id, displayName ?? undefined);
  await supabaseAdmin
    .from("telegram_link_tokens")
    .update({ used_at: new Date().toISOString(), used_chat_id: chatId })
    .eq("token", token);
  await clearPairing(supabaseAdmin, chatId);

  return { handled: true, reply: LINK_DONE, userId: row.user_id, stopPipeline: true };
}

/* ---------------- Opção A: conversa de emparelhamento ---------------- */

// Encontra a conta existente pelo número de WhatsApp (channel_links é a fonte
// de verdade; profiles.phone cobre o pareamento legado).
async function findAccountByPhone(supabaseAdmin: any, phone: string): Promise<string | null> {
  const { data: link } = await supabaseAdmin
    .from("channel_links")
    .select("user_id")
    .eq("channel", "whatsapp")
    .eq("external_id", phone)
    .maybeSingle();
  if ((link as { user_id?: string } | null)?.user_id) return (link as { user_id: string }).user_id;

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("phone", phone)
    .eq("whatsapp_link_status", "linked")
    .maybeSingle();
  return (prof as { id?: string } | null)?.id ?? null;
}

// Ponto de entrada. Devolve `createAccount: true` quando o fluxo deve seguir
// para a criação de conta nova (comportamento antigo).
export async function stepPairing(
  supabaseAdmin: any,
  chatId: string,
  rawText: string | null,
  displayName: string | null,
): Promise<PairingOutcome> {
  const text = (rawText ?? "").trim();
  const existing = await loadPairing(supabaseAdmin, chatId);

  // Primeiro contacto: pergunta antes de criar seja o que for.
  if (!existing) {
    await savePairing(supabaseAdmin, chatId, { step: "asked", attempts: 0 });
    return { handled: true, reply: ASK_WHATSAPP };
  }

  if (existing.step === "asked") {
    if (NO.test(text)) {
      await clearPairing(supabaseAdmin, chatId);
      return { handled: true, createAccount: true };
    }
    if (YES.test(text)) {
      await savePairing(supabaseAdmin, chatId, { step: "awaiting_phone", attempts: 0 });
      return { handled: true, reply: ASK_PHONE };
    }
    return { handled: true, reply: ASK_AGAIN };
  }

  if (existing.step === "awaiting_phone") {
    if (CREATE.test(text)) {
      await clearPairing(supabaseAdmin, chatId);
      return { handled: true, createAccount: true };
    }
    const phone = normalizePhone(text);
    if (!phone || phone.length < 8 || phone.length > 15) {
      return { handled: true, reply: PHONE_INVALID };
    }
    const userId = await findAccountByPhone(supabaseAdmin, phone);
    if (!userId) return { handled: true, reply: PHONE_NOT_FOUND };

    const { generateLinkCode, hashLinkCode } = await import("@/lib/whatsapp/link-code.server");
    const code = generateLinkCode();
    const sent = await sendWhatsAppText(
      phone,
      `Pediste para ligar o Telegram à tua conta do Assessor. Código: ${code}\n\nEscreve-o no Telegram. Se não foste tu, ignora esta mensagem.`,
      { kind: "auto" },
    );
    if (!sent?.ok) {
      return { handled: true, reply: CODE_SEND_FAILED };
    }
    await savePairing(supabaseAdmin, chatId, {
      step: "awaiting_code",
      target_user_id: userId,
      phone,
      code_hash: hashLinkCode(code),
      attempts: 0,
    });
    return { handled: true, reply: CODE_SENT(phone) };
  }

  // awaiting_code
  if (CREATE.test(text)) {
    await clearPairing(supabaseAdmin, chatId);
    return { handled: true, createAccount: true };
  }
  const { hashLinkCode } = await import("@/lib/whatsapp/link-code.server");
  const candidate = text.toUpperCase().match(/LIGAR-\d{6}/)?.[0] ?? text;
  if (existing.code_hash && existing.target_user_id && hashLinkCode(candidate) === existing.code_hash) {
    await linkChannelToUser(supabaseAdmin, "telegram", chatId, existing.target_user_id, displayName ?? undefined);
    await clearPairing(supabaseAdmin, chatId);
    return { handled: true, reply: LINK_DONE, userId: existing.target_user_id, stopPipeline: true };
  }

  const attempts = (existing.attempts ?? 0) + 1;
  const left = Math.max(0, PAIRING_MAX_ATTEMPTS - attempts);
  if (left <= 0) {
    await clearPairing(supabaseAdmin, chatId);
    return { handled: true, reply: CODE_WRONG(0) };
  }
  await savePairing(supabaseAdmin, chatId, { step: "awaiting_code", attempts });
  return { handled: true, reply: CODE_WRONG(left) };
}