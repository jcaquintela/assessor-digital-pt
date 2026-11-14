// Early Access por convite — estado de acesso, convites e lista de espera.
//
// Regras:
// - Interruptor `access.early_access_gate.v1` desligado = tudo como antes.
// - Só fica bloqueada a conta com linha em `account_access` em espera
//   (criada pelo trigger quando o interruptor global está ligado, ou pela
//   equipa). Sem linha = conta antiga, acesso preservado.
// - Beta tester ativo ou conta paga tem sempre acesso.
// - Consumo e emissão de convites são atómicos na base de dados.
// - Respostas neutras: nunca revela números, contas ou convites de terceiros.

import { isAccountFlagEnabled } from "@/lib/flags/account-flag.server";
import {
  EARLY_ACCESS_GATE_FLAG, REFERRAL_INVITES_FLAG, WAITLIST_FLAG,
  INVITE_TTL_DAYS, REFERRAL_QUOTA, MAX_FAILED_ATTEMPTS_PER_HOUR, WAITLIST_CONSENT_WINDOW_MS,
  isBlockedState, extractInviteCode, looksLikeInviteAttempt, hashInviteCode, generateInviteCode,
  wantsWaitlist, wantsLeaveWaitlist, isYes, isNo, parseReferralCommand, earlyAccessReply,
  INVITE_ACCEPTED_REPLY, INVITE_INVALID_REPLY, INVITE_INVALID_REPLY_NO_WAITLIST, INVITE_RATE_LIMIT_REPLY,
  WAITLIST_CONSENT_QUESTION, WAITLIST_JOINED_REPLY, WAITLIST_DECLINED_REPLY, WAITLIST_LEFT_REPLY,
  referralIssuedReply, REFERRAL_NOT_ELIGIBLE_REPLY, REFERRAL_QUOTA_REPLY, REFERRAL_REVOKE_NEED_CODE,
  REFERRAL_REVOKED_REPLY, REFERRAL_REVOKE_NOT_FOUND,
} from "./early-access";

export type AccessRow = {
  user_id: string;
  state: string;
  activated_at: string | null;
  trial_started_at: string | null;
  waitlist_offered_at: string | null;
};

const PAID = new Set(["active", "past_due", "trialing"]);

async function loadRow(supabase: any, userId: string): Promise<AccessRow | null> {
  const { data } = await supabase
    .from("account_access")
    .select("user_id, state, activated_at, trial_started_at, waitlist_offered_at")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as AccessRow | null) ?? null;
}

async function hasEntitlement(supabase: any, userId: string): Promise<boolean> {
  const { data: p } = await supabase
    .from("profiles")
    .select("is_beta_tester, beta_expires_at, subscription_tier, billing_status, stripe_subscription_id")
    .eq("id", userId)
    .maybeSingle();
  if (!p) return false;
  const beta = p.is_beta_tester === true && (!p.beta_expires_at || new Date(p.beta_expires_at).getTime() > Date.now());
  if (beta) return true;
  if (p.subscription_tier === "pro" || p.subscription_tier === "hub") return true;
  return Boolean(p.stripe_subscription_id) && PAID.has(String(p.billing_status ?? ""));
}

export type AccessDecision = { gate: boolean; blocked: boolean; row: AccessRow | null };

/** Decide se a conta pode usar as funções comerciais. Falha aberta só com o interruptor desligado. */
export async function resolveAccess(supabase: any, userId: string): Promise<AccessDecision> {
  const gate = await isAccountFlagEnabled(supabase, EARLY_ACCESS_GATE_FLAG, userId);
  if (!gate) return { gate: false, blocked: false, row: null };
  const row = await loadRow(supabase, userId);
  if (!row || !isBlockedState(row.state)) return { gate: true, blocked: false, row };
  if (await hasEntitlement(supabase, userId)) return { gate: true, blocked: false, row };
  return { gate: true, blocked: true, row };
}

/** Para o arranque do trial: bloqueado enquanto em espera e, depois de ativada, só pelo caminho do convite. */
export async function trialBlockedByGate(supabase: any, userId: string): Promise<boolean> {
  const gate = await isAccountFlagEnabled(supabase, EARLY_ACCESS_GATE_FLAG, userId);
  if (!gate) return false;
  const row = await loadRow(supabase, userId);
  if (!row) return false;
  if (row.state === "activated") return true;
  if (!isBlockedState(row.state)) return false;
  return !(await hasEntitlement(supabase, userId));
}

/** Conta em espera pode ligar o WhatsApp por QR mesmo sem plano que o inclua. */
export async function isAwaitingAccess(supabase: any, userId: string): Promise<boolean> {
  return (await resolveAccess(supabase, userId)).blocked;
}

async function recentFailedAttempts(supabase: any, userId: string): Promise<number> {
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await supabase
    .from("access_invite_attempts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("ok", false)
    .gte("created_at", since);
  return count ?? 0;
}

export type GateReply = { reply: string; kind: string };

/**
 * Resposta para uma conta em espera. Nunca chama o motor do Afonso.
 * Devolve o texto a enviar.
 */
export async function handleBlockedInbound(
  supabase: any,
  userId: string,
  channel: string,
  text: string | null,
): Promise<GateReply> {
  const waitlist = await isAccountFlagEnabled(supabase, WAITLIST_FLAG, userId);
  const content = String(text ?? "");

  const code = extractInviteCode(content);
  if (code || looksLikeInviteAttempt(content)) {
    if ((await recentFailedAttempts(supabase, userId)) >= MAX_FAILED_ATTEMPTS_PER_HOUR) {
      return { reply: INVITE_RATE_LIMIT_REPLY, kind: "invite_rate_limited" };
    }
    let inviteId: string | null = null;
    if (code) {
      const { data, error } = await supabase.rpc("consume_access_invite", {
        _token_hash: await hashInviteCode(code), _user_id: userId, _channel: channel,
      });
      if (!error && data) inviteId = String(data);
    }
    await supabase.from("access_invite_attempts").insert({ user_id: userId, channel, ok: !!inviteId } as never);
    if (inviteId) {
      await supabase.from("admin_audit_logs").insert({
        admin_user_id: null, action: "access.invite_consumed", target_user_id: userId,
        resource_type: "access_invite", resource_id: inviteId, metadata: { channel } as never,
      } as never);
      if (waitlist) {
        await supabase.from("access_waitlist").update({ status: "granted", updated_at: new Date().toISOString() } as never)
          .eq("user_id", userId).eq("status", "waiting");
      }
      return { reply: INVITE_ACCEPTED_REPLY, kind: "invite_accepted" };
    }
    return { reply: waitlist ? INVITE_INVALID_REPLY : INVITE_INVALID_REPLY_NO_WAITLIST, kind: "invite_invalid" };
  }

  if (waitlist) {
    if (wantsLeaveWaitlist(content)) {
      await supabase.from("access_waitlist")
        .update({ status: "removed", consent_contact: false, notify: false, updated_at: new Date().toISOString() } as never)
        .eq("user_id", userId);
      return { reply: WAITLIST_LEFT_REPLY, kind: "waitlist_left" };
    }
    const row = await loadRow(supabase, userId);
    const offered = row?.waitlist_offered_at ? new Date(row.waitlist_offered_at).getTime() : 0;
    const pending = offered > 0 && Date.now() - offered < WAITLIST_CONSENT_WINDOW_MS;
    if (pending && isYes(content)) {
      const now = new Date().toISOString();
      await supabase.from("access_waitlist").upsert({
        user_id: userId, channel, consent_contact: true, consent_at: now, notify: true, status: "waiting", updated_at: now,
      } as never, { onConflict: "user_id" });
      await supabase.from("account_access").update({ waitlist_offered_at: null, updated_at: now } as never).eq("user_id", userId);
      return { reply: WAITLIST_JOINED_REPLY, kind: "waitlist_joined" };
    }
    if (pending && isNo(content)) {
      await supabase.from("account_access").update({ waitlist_offered_at: null } as never).eq("user_id", userId);
      return { reply: WAITLIST_DECLINED_REPLY, kind: "waitlist_declined" };
    }
    if (wantsWaitlist(content)) {
      await supabase.from("account_access").update({ waitlist_offered_at: new Date().toISOString() } as never).eq("user_id", userId);
      return { reply: WAITLIST_CONSENT_QUESTION, kind: "waitlist_consent_asked" };
    }
  }
  return { reply: earlyAccessReply({ waitlist }), kind: "early_access" };
}

/**
 * Primeira mensagem válida depois da ativação: arranca os 14 dias.
 * Idempotente: só passa de `activated` para `trialing` uma vez.
 */
export async function startTrialAfterActivation(supabase: any, userId: string, row: AccessRow | null): Promise<void> {
  if (!row || row.state !== "activated") return;
  // Reserva atómica: só uma mensagem passa de `activated` para `trialing`.
  const now = new Date().toISOString();
  const { data: claimed } = await supabase.from("account_access")
    .update({ state: "trialing", trial_started_at: now, updated_at: now } as never)
    .eq("user_id", userId).eq("state", "activated")
    .select("user_id");
  if (!(claimed ?? []).length) return;
  const { startTrialForChannelChoice } = await import("@/lib/subscription/trial.server");
  const r = await startTrialForChannelChoice(supabase, userId, { viaInvite: true });
  if (r.reason === "already_paid") {
    await supabase.from("account_access").update({ state: "subscribed", updated_at: now } as never).eq("user_id", userId);
  } else if (!r.started && !r.alreadyActive && r.reason !== "trial_already_used") {
    // Falha técnica: volta a `activated` para tentar na próxima mensagem.
    await supabase.from("account_access")
      .update({ state: "activated", trial_started_at: null, updated_at: now } as never)
      .eq("user_id", userId).eq("state", "trialing");
  }
}

// --- Convites dados por beta testers, na conversa ---------------------------

export async function handleReferralCommand(
  supabase: any,
  userId: string,
  text: string,
): Promise<string | null> {
  const cmd = parseReferralCommand(text);
  if (!cmd) return null;
  if (!(await isAccountFlagEnabled(supabase, REFERRAL_INVITES_FLAG, userId))) return null;

  if (cmd.kind === "issue") {
    for (let i = 0; i < 3; i++) {
      const code = generateInviteCode();
      const { data, error } = await supabase.rpc("issue_referral_invite", {
        _issuer: userId, _token_hash: await hashInviteCode(code), _ttl_days: INVITE_TTL_DAYS, _quota: REFERRAL_QUOTA,
      });
      if (error && /duplicate|unique/i.test(error.message ?? "")) continue; // colisão improvável
      if (error) return "Não consegui gerar o convite agora. Tenta daqui a pouco.";
      if (!data) {
        const { data: p } = await supabase.from("profiles")
          .select("is_beta_tester, beta_expires_at").eq("id", userId).maybeSingle();
        const beta = p?.is_beta_tester === true && (!p.beta_expires_at || new Date(p.beta_expires_at).getTime() > Date.now());
        return beta ? REFERRAL_QUOTA_REPLY : REFERRAL_NOT_ELIGIBLE_REPLY;
      }
      const used = await countQuotaUse(supabase, userId);
      return referralIssuedReply(code, Math.max(0, REFERRAL_QUOTA - used));
    }
    return "Não consegui gerar o convite agora. Tenta daqui a pouco.";
  }

  if (cmd.kind === "list") {
    const { data } = await supabase.from("access_invites")
      .select("status, expires_at, created_at")
      .eq("issuer_user_id", userId).eq("source", "beta_tester")
      .order("created_at", { ascending: false }).limit(10);
    const rows = (data ?? []) as Array<{ status: string; expires_at: string; created_at: string }>;
    if (!rows.length) return `Ainda não geraste convites. Tens ${REFERRAL_QUOTA} disponíveis — pede "dá-me um convite".`;
    const fmt = (d: string) => new Date(d).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", timeZone: "Europe/Lisbon" });
    const lines = rows.map((r) => {
      const st = r.status === "used" ? "usado"
        : r.status === "revoked" ? "anulado"
        : new Date(r.expires_at).getTime() <= Date.now() ? "expirado"
        : `por usar, até ${fmt(r.expires_at)}`;
      return `• Convite de ${fmt(r.created_at)}: ${st}`;
    });
    const left = Math.max(0, REFERRAL_QUOTA - (await countQuotaUse(supabase, userId)));
    return `${lines.join("\n")}\n\nPodes gerar mais ${left}.`;
  }

  // revoke
  if (!cmd.code) return REFERRAL_REVOKE_NEED_CODE;
  const { data } = await supabase.from("access_invites")
    .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: userId } as never)
    .eq("token_hash", await hashInviteCode(cmd.code))
    .eq("issuer_user_id", userId)
    .eq("status", "issued")
    .select("id");
  return (data ?? []).length ? REFERRAL_REVOKED_REPLY : REFERRAL_REVOKE_NOT_FOUND;
}

async function countQuotaUse(supabase: any, userId: string): Promise<number> {
  const { data } = await supabase.from("access_invites")
    .select("status, expires_at")
    .eq("issuer_user_id", userId).eq("source", "beta_tester").in("status", ["issued", "used"]);
  return ((data ?? []) as Array<{ status: string; expires_at: string }>)
    .filter((r) => r.status === "used" || new Date(r.expires_at).getTime() > Date.now()).length;
}
