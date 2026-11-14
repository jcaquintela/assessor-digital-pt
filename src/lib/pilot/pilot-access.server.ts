// Piloto AFONSO 2.0 — participação e convites do piloto.
// Não importa os interruptores (é importado por eles). Falha fechada.
//
// Convites do piloto: UM caminho para todos (conversa WhatsApp/Telegram e
// administração). Quem pode emitir, o teto global, os 7 dias, o uso único,
// a idempotência e a anulação são decididos na base de dados
// (`issue_pilot_invite` / `revoke_pilot_invite`); gatilhos recusam qualquer
// escrita direta. Quem pode emitir: o emissor designado do piloto ou um
// super_admin. support_admin só vê.

import {
  generateInviteCode, hashInviteCode, REFERRAL_REVOKE_NEED_CODE, REFERRAL_REVOKED_REPLY, type ReferralCommand,
} from "@/lib/access/early-access";
import {
  PILOT_KEY, pilotInviteIssuedReply, PILOT_NOT_OPEN_REPLY, PILOT_CAP_REPLY, PILOT_REPLAYED_REPLY, PILOT_ERROR_REPLY,
  type PilotInviteOutcome,
} from "./pilot";

/** Participante ativo de um piloto que não está fechado. Qualquer erro = não. */
export async function isPilotParticipant(supabase: any, userId: string | null | undefined, pilotKey = PILOT_KEY): Promise<boolean> {
  if (!userId) return false;
  try {
    const { data: p, error: e1 } = await supabase.from("pilots").select("status").eq("key", pilotKey).maybeSingle();
    if (e1 || !p || p.status === "closed") return false;
    const { data: m, error: e2 } = await supabase.from("pilot_participants")
      .select("status").eq("pilot_key", pilotKey).eq("user_id", userId).maybeSingle();
    return !e2 && m?.status === "active";
  } catch {
    return false;
  }
}

/** Espelho da regra da base de dados, só para mostrar/ocultar opções. A base de dados decide. */
export async function canManagePilotInvites(supabase: any, userId: string | null | undefined, pilotKey = PILOT_KEY): Promise<boolean> {
  if (!userId) return false;
  try {
    const { data: p } = await supabase.from("pilots").select("invite_issuer_user_id").eq("key", pilotKey).maybeSingle();
    if (p?.invite_issuer_user_id === userId) return true;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    return (roles ?? []).some((r: any) => r.role === "super_admin");
  } catch {
    return false;
  }
}

export type PilotIssueResult = { outcome: PilotInviteOutcome | "error"; code: string | null; remaining: number; ttlDays: number };

/** Emissão comum a todos os canais. O código só existe aqui, nunca é guardado. */
export async function issuePilotInvite(
  supabase: any,
  p: { issuer: string; idempotencyKey: string | null; note?: string | null; via: string },
  pilotKey = PILOT_KEY,
): Promise<PilotIssueResult> {
  const { data: pilot } = await supabase.from("pilots").select("invite_ttl_days").eq("key", pilotKey).maybeSingle();
  const ttlDays = Number(pilot?.invite_ttl_days ?? 7);
  for (let i = 0; i < 3; i++) {
    const code = generateInviteCode();
    const { data, error } = await supabase.rpc("issue_pilot_invite", {
      _pilot_key: pilotKey, _issuer: p.issuer, _token_hash: await hashInviteCode(code),
      _idempotency_key: p.idempotencyKey, _note: p.note ?? null, _issued_via: p.via,
    });
    if (error && /duplicate|unique/i.test(error.message ?? "")) continue; // colisão de código improvável
    if (error) return { outcome: "error", code: null, remaining: 0, ttlDays };
    const row = (Array.isArray(data) ? data[0] : data) as { out_outcome?: PilotInviteOutcome; out_remaining?: number } | null;
    const outcome = row?.out_outcome ?? "error";
    return { outcome, code: outcome === "issued" ? code : null, remaining: Number(row?.out_remaining ?? 0), ttlDays };
  }
  return { outcome: "error", code: null, remaining: 0, ttlDays };
}

/** Anulação comum a todos os canais (por id na administração, por código na conversa). */
export async function revokePilotInvite(
  supabase: any,
  p: { actor: string; inviteId?: string | null; code?: string | null },
  pilotKey = PILOT_KEY,
): Promise<"revoked" | "not_found" | "error"> {
  const { data, error } = await supabase.rpc("revoke_pilot_invite", {
    _pilot_key: pilotKey, _actor: p.actor, _invite_id: p.inviteId ?? null,
    _token_hash: p.code ? await hashInviteCode(p.code) : null,
  });
  if (error) return "error";
  return data === "revoked" ? "revoked" : "not_found";
}

/**
 * "dá-me um convite" / "os meus convites" / "anula o convite …" na conversa.
 * Devolve null quando não se aplica (quem pede não gere convites do piloto,
 * ou anulação de um convite que não é do piloto): o pedido segue para o
 * caminho geral de convites, sem mudanças.
 */
export async function handlePilotInviteCommand(
  supabase: any,
  userId: string,
  cmd: ReferralCommand,
  opts: { idempotencyKey?: string | null; channel?: string | null } = {},
  pilotKey = PILOT_KEY,
): Promise<string | null> {
  if (cmd.kind === "revoke") {
    if (!(await canManagePilotInvites(supabase, userId, pilotKey))) return null;
    if (!cmd.code) return REFERRAL_REVOKE_NEED_CODE;
    const r = await revokePilotInvite(supabase, { actor: userId, code: cmd.code }, pilotKey);
    return r === "revoked" ? REFERRAL_REVOKED_REPLY : null;
  }

  if (cmd.kind === "list") {
    if (!(await canManagePilotInvites(supabase, userId, pilotKey))) return null;
    const { data: pilot } = await supabase.from("pilots").select("status, invite_cap").eq("key", pilotKey).maybeSingle();
    if (!pilot) return null;
    const { data } = await supabase.from("access_invites")
      .select("status, expires_at, created_at").eq("pilot_key", pilotKey)
      .order("created_at", { ascending: false }).limit(10);
    const rows = (data ?? []) as Array<{ status: string; expires_at: string; created_at: string }>;
    const live = rows.filter((r) => r.status === "used" || (r.status === "issued" && new Date(r.expires_at).getTime() > Date.now())).length;
    const left = Math.max(0, Number(pilot.invite_cap) - live);
    if (!rows.length) {
      return pilot.status === "go"
        ? `Ainda não há convites do piloto. Há ${left} disponíveis — pede "dá-me um convite".`
        : PILOT_NOT_OPEN_REPLY;
    }
    const fmt = (d: string) => new Date(d).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", timeZone: "Europe/Lisbon" });
    const lines = rows.map((r) => {
      const st = r.status === "used" ? "usado"
        : r.status === "revoked" ? "anulado"
        : new Date(r.expires_at).getTime() <= Date.now() ? "expirado"
        : `por usar, até ${fmt(r.expires_at)}`;
      return `• Convite do piloto de ${fmt(r.created_at)}: ${st}`;
    });
    return `${lines.join("\n")}\n\nPodem gerar-se mais ${left}.`;
  }

  const r = await issuePilotInvite(supabase, {
    issuer: userId, idempotencyKey: opts.idempotencyKey ?? null, via: `chat:${opts.channel ?? "unknown"}`,
  }, pilotKey);
  switch (r.outcome) {
    case "issued": return pilotInviteIssuedReply(r.code!, r.remaining, r.ttlDays);
    case "replayed": return PILOT_REPLAYED_REPLY;
    case "not_open": return PILOT_NOT_OPEN_REPLY;
    case "cap_reached": return PILOT_CAP_REPLY;
    case "not_issuer": case "no_pilot": return null;
    default: return PILOT_ERROR_REPLY;
  }
}
