// Piloto AFONSO 2.0 — participação e convites do piloto.
// Não importa os interruptores (é importado por eles). Falha fechada.

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

/**
 * "dá-me um convite" / "os meus convites" / "anula o convite …" para o emissor do piloto.
 * Devolve null quando não se aplica (não é o emissor, ou anulação de um convite que não é do piloto):
 * o pedido segue para o caminho geral de convites, sem mudanças.
 */
export async function handlePilotInviteCommand(
  supabase: any,
  userId: string,
  cmd: ReferralCommand,
  opts: { idempotencyKey?: string | null } = {},
  pilotKey = PILOT_KEY,
): Promise<string | null> {
  const { data: pilot } = await supabase.from("pilots")
    .select("status, invite_issuer_user_id, invite_cap, invite_ttl_days").eq("key", pilotKey).maybeSingle();
  if (!pilot || pilot.invite_issuer_user_id !== userId) return null;

  if (cmd.kind === "revoke") {
    if (!cmd.code) return REFERRAL_REVOKE_NEED_CODE;
    const { data } = await supabase.from("access_invites")
      .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: userId } as never)
      .eq("token_hash", await hashInviteCode(cmd.code))
      .eq("issuer_user_id", userId)
      .eq("pilot_key", pilotKey)
      .eq("status", "issued")
      .select("id");
    // Não é um convite do piloto: segue para o caminho geral.
    return (data ?? []).length ? REFERRAL_REVOKED_REPLY : null;
  }

  if (cmd.kind === "list") {
    const { data } = await supabase.from("access_invites")
      .select("status, expires_at, created_at").eq("pilot_key", pilotKey).eq("issuer_user_id", userId)
      .order("created_at", { ascending: false }).limit(10);
    const rows = (data ?? []) as Array<{ status: string; expires_at: string; created_at: string }>;
    const live = rows.filter((r) => r.status === "used" || (r.status === "issued" && new Date(r.expires_at).getTime() > Date.now())).length;
    const left = Math.max(0, Number(pilot.invite_cap) - live);
    if (!rows.length) {
      return pilot.status === "go"
        ? `Ainda não geraste convites do piloto. Tens ${left} disponíveis — pede "dá-me um convite".`
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
    return `${lines.join("\n")}\n\nPodes gerar mais ${left}.`;
  }

  // issue — o teto, o emissor, o estado do piloto e a idempotência são decididos na base de dados.
  for (let i = 0; i < 3; i++) {
    const code = generateInviteCode();
    const { data, error } = await supabase.rpc("issue_pilot_invite", {
      _pilot_key: pilotKey, _issuer: userId, _token_hash: await hashInviteCode(code),
      _idempotency_key: opts.idempotencyKey ?? null,
    });
    if (error && /duplicate|unique/i.test(error.message ?? "")) continue; // colisão de código improvável
    if (error) return PILOT_ERROR_REPLY;
    const row = (Array.isArray(data) ? data[0] : data) as { out_outcome?: PilotInviteOutcome; out_remaining?: number } | null;
    switch (row?.out_outcome) {
      case "issued": return pilotInviteIssuedReply(code, Number(row.out_remaining ?? 0), Number(pilot.invite_ttl_days));
      case "replayed": return PILOT_REPLAYED_REPLY;
      case "not_open": return PILOT_NOT_OPEN_REPLY;
      case "cap_reached": return PILOT_CAP_REPLY;
      case "not_issuer": case "no_pilot": return null;
      default: return PILOT_ERROR_REPLY;
    }
  }
  return PILOT_ERROR_REPLY;
}
