import { BRAND_NAME } from "@/lib/brand";
// Nome de exibição do WhatsApp ("Afonso").
//
// A Meta não deixa alterar o display name enquanto houver uma revisão a
// decorrer ("Display name can't be edited while it is being reviewed").
// Esta rotina pergunta periodicamente o estado do número e, assim que a
// revisão terminar, submete sozinha o pedido para "Afonso".

export const TARGET_DISPLAY_NAME: string = BRAND_NAME;

export interface DisplayNameState {
  verifiedName: string | null;
  nameStatus: string | null;
}

/** Estado actual do número na Graph API. */
export async function fetchDisplayNameState(): Promise<DisplayNameState | null> {
  const token = process.env['WHATSAPP_ACCESS_TOKEN'];
  const phoneId = process.env['WHATSAPP_PHONE_NUMBER_ID'];
  if (!token || !phoneId) return null;

  const url = new URL(`https://graph.facebook.com/v21.0/${phoneId}`);
  url.searchParams.set("fields", "verified_name,name_status,new_name_status");
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return {
    verifiedName: (json['verified_name'] as string) ?? null,
    nameStatus: String((json['new_name_status'] ?? json['name_status'] ?? "") || "").toUpperCase() || null,
  };
}

/** Submete o pedido de alteração do display name. */
export async function requestDisplayName(
  name: string = TARGET_DISPLAY_NAME,
): Promise<{ ok: boolean; error?: string; meta?: unknown }> {
  const token = process.env['WHATSAPP_ACCESS_TOKEN'];
  const phoneId = process.env['WHATSAPP_PHONE_NUMBER_ID'];
  if (!token || !phoneId) return { ok: false, error: "Credenciais WhatsApp em falta" };

  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/request_verified_name`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    return { ok: false, error: json?.error?.message ?? `HTTP ${res.status}`, meta: json };
  }
  return { ok: true, meta: json };
}

export type SyncOutcome =
  | "no_credentials"
  | "already_target"
  | "pending_review"
  | "submitted"
  | "submit_failed";

export const DISPLAY_NAME_LOG_ACTION = "whatsapp.display_name.attempt";

/** Regista no histórico cada passagem da rotina (e a resposta da Meta). */
export async function logDisplayNameAttempt(
  supabaseAdmin: any,
  entry: {
    outcome: SyncOutcome;
    state: DisplayNameState | null;
    error?: string | null;
    metaResponse?: unknown;
    source?: string;
  },
): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    await supabaseAdmin.from("admin_audit_logs").insert({
      admin_user_id: null,
      action: DISPLAY_NAME_LOG_ACTION,
      resource_type: "whatsapp_phone_number",
      resource_id: TARGET_DISPLAY_NAME,
      reason: entry.error ?? null,
      metadata: {
        source: entry.source ?? "cron:whatsapp-display-name",
        outcome: entry.outcome,
        target_name: TARGET_DISPLAY_NAME,
        current_name: entry.state?.verifiedName ?? null,
        name_status: entry.state?.nameStatus ?? null,
        meta_response: entry.metaResponse ?? null,
      },
    } as never);
  } catch { /* o histórico nunca bloqueia a rotina */ }
}

/**
 * Uma passagem da rotina: lê o estado e, se não houver revisão a decorrer e o
 * nome ainda não for o pretendido, submete o pedido.
 */
export async function syncDisplayName(
  supabaseAdmin?: any,
  source?: string,
): Promise<{ outcome: SyncOutcome; state: DisplayNameState | null; error?: string }> {
  const state = await fetchDisplayNameState();
  if (!state) {
    await logDisplayNameAttempt(supabaseAdmin, { outcome: "no_credentials", state: null, source });
    return { outcome: "no_credentials", state: null };
  }

  const current = (state.verifiedName ?? "").trim().toLowerCase();
  if (current === TARGET_DISPLAY_NAME.toLowerCase()) {
    await logDisplayNameAttempt(supabaseAdmin, { outcome: "already_target", state, source });
    return { outcome: "already_target", state };
  }

  // Enquanto a Meta estiver a rever (nome actual ou pedido anterior), esperar.
  if ((state.nameStatus ?? "").includes("PENDING")) {
    await logDisplayNameAttempt(supabaseAdmin, { outcome: "pending_review", state, source });
    return { outcome: "pending_review", state };
  }

  const result = await requestDisplayName(TARGET_DISPLAY_NAME);
  await logDisplayNameAttempt(supabaseAdmin, {
    outcome: result.ok ? "submitted" : "submit_failed",
    state,
    error: result.error ?? null,
    metaResponse: result.meta ?? null,
    source,
  });

  return result.ok
    ? { outcome: "submitted", state }
    : { outcome: "submit_failed", state, error: result.error ?? undefined };
}