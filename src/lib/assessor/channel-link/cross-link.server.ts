// Ligação segura de um canal já associado a outra conta (ver cross-link.ts).
// Interruptor por conta: `assessor.cross_link.v1`. Desligado = nada muda.

import type { ChannelAdapter, NormalizedInbound } from "../channel-gateway/types";
import {
  BUSINESS_TABLES,
  CROSS_LINK_FLAG,
  LINK_TEXT,
  RELINK_MAX_ATTEMPTS,
  RELINK_STEP_CODE,
  RELINK_STEP_PHONE,
  isCancel,
  wantsToLinkChannel,
} from "./cross-link";

const TOKEN_TTL_MIN = 15;
const STATE_TTL_MIN = 30;

/** A conta tem registos próprios ou plano acima do base? Erro = "tem" (conservador). */
export async function accountHasOwnData(supabaseAdmin: any, userId: string): Promise<boolean> {
  try {
    const { data: tier, error: tierErr } = await supabaseAdmin.rpc("effective_tier", { _user_id: userId });
    if (tierErr) return true;
    const t = String(tier ?? "base").toLowerCase();
    if (t && t !== "base" && t !== "free" && t !== "trial") return true;
    for (const table of BUSINESS_TABLES) {
      const { data, error } = await supabaseAdmin.from(table).select("id").eq("user_id", userId).limit(1);
      if (error) return true;
      if (Array.isArray(data) && data.length) return true;
    }
    return false;
  } catch {
    return true;
  }
}

async function findAccountByWhatsApp(supabaseAdmin: any, phone: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("channel_links")
    .select("user_id")
    .eq("channel", "whatsapp")
    .eq("external_id", phone)
    .maybeSingle();
  return (data as any)?.user_id ?? null;
}

async function linkedChannel(supabaseAdmin: any, userId: string, channel: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("channel_links")
    .select("external_id")
    .eq("user_id", userId)
    .eq("channel", channel)
    .limit(1);
  return ((data as any[]) ?? [])[0]?.external_id ?? null;
}

async function audit(supabaseAdmin: any, action: string, targetUserId: string, metadata: Record<string, unknown>) {
  try {
    await supabaseAdmin.from("admin_audit_logs").insert({
      admin_user_id: null,
      action,
      target_user_id: targetUserId,
      resource_type: "channel_link",
      resource_id: String(metadata.chat_id ?? ""),
      reason: action === "account_link_request"
        ? "Consultor provou posse dos dois canais; contas separadas com registos — juntar só com intervenção da equipa."
        : "Canal Telegram passou para a conta do WhatsApp (conta de origem vazia).",
      metadata,
    } as never);
  } catch { /* registo é bónus */ }
}

/**
 * Prova de posse concluída (código certo ou link de uso único válido):
 * decide entre mudar o canal de conta (origem vazia) ou pedir à equipa.
 */
async function completeRelink(
  supabaseAdmin: any,
  args: { chatId: string; sourceUserId: string; targetUserId: string; displayName?: string | null; via: string },
): Promise<string> {
  if (args.sourceUserId === args.targetUserId) return LINK_TEXT.alreadySame;
  if (await accountHasOwnData(supabaseAdmin, args.sourceUserId)) {
    await audit(supabaseAdmin, "account_link_request", args.targetUserId, {
      chat_id: args.chatId, source_user_id: args.sourceUserId, target_user_id: args.targetUserId, via: args.via,
    });
    return LINK_TEXT.needsTeam;
  }
  const { linkChannelToUser } = await import("@/lib/assessor/channels.server");
  await linkChannelToUser(supabaseAdmin, "telegram", args.chatId, args.targetUserId, args.displayName ?? undefined);
  try {
    // A conta de origem (vazia) fica sem este canal: recalcula o principal dela.
    const { recomputePrimaryChannel } = await import("@/lib/assessor/primary-channel.server");
    await recomputePrimaryChannel(supabaseAdmin, args.sourceUserId);
  } catch { /* */ }
  await audit(supabaseAdmin, "channel_relink", args.targetUserId, {
    chat_id: args.chatId, source_user_id: args.sourceUserId, target_user_id: args.targetUserId, via: args.via,
  });
  return LINK_TEXT.relinked;
}

function randomToken(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return `tg_${Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")}`;
}

async function reply(adapter: ChannelAdapter, supabaseAdmin: any, userId: string, to: string, text: string) {
  const s = await adapter.sendText(to, text);
  try {
    await supabaseAdmin.from("assessor_messages").insert({
      user_id: userId, role: "assistant", content: text, channel: adapter.channel,
      message_type: "channel_link", status: s.ok ? "sent" : "failed", sender_phone: to,
    } as never);
  } catch { /* */ }
}

/**
 * Ponto de entrada no pipeline (consultor já associado a uma conta).
 * Devolve true quando tratou o turno.
 */
export async function handleCrossLink(
  adapter: ChannelAdapter,
  supabaseAdmin: any,
  inbound: NormalizedInbound,
  userId: string,
  content: string,
): Promise<boolean> {
  const { isAccountFlagEnabled } = await import("@/lib/flags/account-flag.server");
  if (!(await isAccountFlagEnabled(supabaseAdmin, CROSS_LINK_FLAG, userId))) return false;
  const text = String(content ?? "").trim();
  const to = inbound.externalConversationId;

  // ---------- WhatsApp: pedir para ligar o Telegram ----------
  if (inbound.channel === "whatsapp") {
    if (!wantsToLinkChannel(text, "telegram")) return false;
    if (await linkedChannel(supabaseAdmin, userId, "telegram")) {
      await reply(adapter, supabaseAdmin, userId, to, LINK_TEXT.telegramAlreadyLinked);
      return true;
    }
    await supabaseAdmin
      .from("telegram_link_tokens")
      .update({ used_at: new Date().toISOString() } as never)
      .eq("user_id", userId)
      .is("used_at", null);
    const token = randomToken();
    await supabaseAdmin.from("telegram_link_tokens").insert({
      token, user_id: userId, expires_at: new Date(Date.now() + TOKEN_TTL_MIN * 60_000).toISOString(),
    } as never);
    const { TELEGRAM_BOT_USERNAME } = await import("@/lib/telegram/pairing.server");
    await reply(adapter, supabaseAdmin, userId, to, LINK_TEXT.telegramLink(`https://t.me/${TELEGRAM_BOT_USERNAME}?start=${token}`));
    return true;
  }

  if (inbound.channel !== "telegram") return false;
  const chatId = to;
  const displayName = [inbound.sender?.firstName, inbound.sender?.lastName].filter(Boolean).join(" ").trim() || null;

  // ---------- Telegram: link de uso único vindo do WhatsApp ----------
  const { extractLinkToken, clearPairing } = await import("@/lib/telegram/pairing.server");
  const token = extractLinkToken(text);
  if (token) {
    // Reserva atómica: o link só funciona uma vez, mesmo com dois chats.
    const nowIso = new Date().toISOString();
    const { data: claimed } = await supabaseAdmin
      .from("telegram_link_tokens")
      .update({ used_at: nowIso, used_chat_id: chatId } as never)
      .eq("token", token)
      .is("used_at", null)
      .gt("expires_at", nowIso)
      .select("user_id");
    const targetUserId = ((claimed as any[]) ?? [])[0]?.user_id ?? null;
    if (!targetUserId) {
      await reply(adapter, supabaseAdmin, userId, to, LINK_TEXT.tokenInvalid);
      return true;
    }
    const msg = await completeRelink(supabaseAdmin, { chatId, sourceUserId: userId, targetUserId, displayName, via: "link_token" });
    await clearPairing(supabaseAdmin, chatId);
    await reply(adapter, supabaseAdmin, userId, to, msg);
    return true;
  }

  // ---------- Telegram: código enviado para o WhatsApp ----------
  const { data: stateRow } = await supabaseAdmin
    .from("telegram_pairings")
    .select("chat_id, step, target_user_id, source_user_id, code_hash, attempts, expires_at")
    .eq("chat_id", chatId)
    .maybeSingle();
  const st = stateRow as any;
  const live = st && (st.step === RELINK_STEP_PHONE || st.step === RELINK_STEP_CODE)
    && st.source_user_id === userId
    && Date.parse(st.expires_at) > Date.now();

  if (!live) {
    if (!wantsToLinkChannel(text, "whatsapp")) return false;
    if (await linkedChannel(supabaseAdmin, userId, "whatsapp")) {
      await reply(adapter, supabaseAdmin, userId, to, LINK_TEXT.alreadySame);
      return true;
    }
    await supabaseAdmin.from("telegram_pairings").upsert({
      chat_id: chatId, step: RELINK_STEP_PHONE, source_user_id: userId, target_user_id: null,
      phone: null, code_hash: null, attempts: 0,
      expires_at: new Date(Date.now() + STATE_TTL_MIN * 60_000).toISOString(),
      updated_at: new Date().toISOString(),
    } as never, { onConflict: "chat_id" });
    await reply(adapter, supabaseAdmin, userId, to, LINK_TEXT.askPhone);
    return true;
  }

  if (isCancel(text)) {
    await clearPairing(supabaseAdmin, chatId);
    await reply(adapter, supabaseAdmin, userId, to, LINK_TEXT.cancelled);
    return true;
  }

  if (st.step === RELINK_STEP_PHONE) {
    const { normalizePhone } = await import("@/lib/whatsapp/phone");
    const phone = normalizePhone(text);
    if (!phone || phone.length < 8 || phone.length > 15) {
      await reply(adapter, supabaseAdmin, userId, to, LINK_TEXT.phoneInvalid);
      return true;
    }
    const target = await findAccountByWhatsApp(supabaseAdmin, phone);
    let codeHash: string | null = null;
    if (target && target !== userId) {
      const { generateLinkCode, hashLinkCode } = await import("@/lib/whatsapp/link-code.server");
      const code = generateLinkCode();
      const { sendWhatsAppText } = await import("@/lib/whatsapp/send.server");
      const sent = await sendWhatsAppText(phone, LINK_TEXT.whatsappCode(code), { kind: "auto" }).catch(() => null);
      if (sent?.ok) codeHash = hashLinkCode(code);
    }
    // Mesma resposta e mesmo passo, haja conta ou não (sem enumeração).
    await supabaseAdmin.from("telegram_pairings").update({
      step: RELINK_STEP_CODE, phone, target_user_id: codeHash ? target : null, code_hash: codeHash, attempts: 0,
      updated_at: new Date().toISOString(),
    } as never).eq("chat_id", chatId);
    await reply(adapter, supabaseAdmin, userId, to, LINK_TEXT.uniformCodeSent);
    return true;
  }

  // RELINK_STEP_CODE
  const { hashLinkCode } = await import("@/lib/whatsapp/link-code.server");
  const candidate = text.toUpperCase().match(/LIGAR-\d{6}/)?.[0] ?? text;
  if (st.code_hash && st.target_user_id && hashLinkCode(candidate) === st.code_hash) {
    await clearPairing(supabaseAdmin, chatId);
    const msg = await completeRelink(supabaseAdmin, {
      chatId, sourceUserId: userId, targetUserId: st.target_user_id, displayName, via: "whatsapp_code",
    });
    await reply(adapter, supabaseAdmin, userId, to, msg);
    return true;
  }
  const attempts = Number(st.attempts ?? 0) + 1;
  const left = Math.max(0, RELINK_MAX_ATTEMPTS - attempts);
  if (left <= 0) await clearPairing(supabaseAdmin, chatId);
  else await supabaseAdmin.from("telegram_pairings").update({ attempts } as never).eq("chat_id", chatId);
  await reply(adapter, supabaseAdmin, userId, to, LINK_TEXT.codeWrong(left));
  return true;
}
