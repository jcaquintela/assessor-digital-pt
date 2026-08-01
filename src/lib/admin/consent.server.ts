// Regra única de privacidade (vale para Qualidade e para Suporte):
// ver conteúdo real de uma conversa exige consentimento temporário do
// consultor. Métricas, decisões e erros técnicos são sempre visíveis —
// o texto da conversa não.

export type ContentAccessDecision = {
  allowed: boolean;
  /** "consent" | "synthetic" | "evaluation_program" | null */
  basis: "consent" | "synthetic" | "evaluation_program" | null;
  consentId: string | null;
  expiresAt: string | null;
};

const SYNTHETIC_MARKERS = ["ci-", "test.assessor.local", "@shadow.assessor.local", "@example.com"];

export function isSyntheticEmail(email: string | null | undefined): boolean {
  const e = (email ?? "").toLowerCase();
  return !!e && SYNTHETIC_MARKERS.some((m) => e.includes(m));
}

/**
 * Decide se este admin pode ver conteúdo real deste consultor, agora.
 * Exceções previstas: contas sintéticas/teste e consultores inscritos no
 * programa de avaliação (consentimento permanente, dado por eles).
 */
export async function canOpenRealContent(
  supabaseAdmin: any,
  opts: { targetUserId: string; adminId: string; resourceId?: string | null },
): Promise<ContentAccessDecision> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("id", opts.targetUserId)
    .maybeSingle();

  if (isSyntheticEmail((profile as any)?.email)) {
    return { allowed: true, basis: "synthetic", consentId: null, expiresAt: null };
  }

  const nowIso = new Date().toISOString();
  const { data: consents } = await supabaseAdmin
    .from("content_access_consents")
    .select("id, scope, resource_id, status, expires_at")
    .eq("user_id", opts.targetUserId)
    .eq("status", "approved");

  for (const c of ((consents as any[]) ?? [])) {
    const live = !c.expires_at || c.expires_at > nowIso;
    if (!live) continue;
    if (c.scope === "evaluation_program") {
      return { allowed: true, basis: "evaluation_program", consentId: c.id, expiresAt: c.expires_at };
    }
    if (c.scope === "conversation" && (!c.resource_id || c.resource_id === opts.resourceId)) {
      return { allowed: true, basis: "consent", consentId: c.id, expiresAt: c.expires_at };
    }
  }

  return { allowed: false, basis: null, consentId: null, expiresAt: null };
}

/** Toda a abertura de conteúdo real fica auditada, com motivo. */
export async function auditContentAccess(
  supabaseAdmin: any,
  opts: {
    adminId: string;
    targetUserId: string;
    resourceId: string;
    basis: string;
    consentId: string | null;
    reason: string;
  },
) {
  await supabaseAdmin.from("admin_audit_logs").insert({
    admin_user_id: opts.adminId,
    action: "content.open",
    target_user_id: opts.targetUserId,
    resource_type: "assessor_reasoning_traces",
    resource_id: opts.resourceId,
    reason: opts.reason,
    metadata: { basis: opts.basis, consent_id: opts.consentId } as any,
  } as never);
}
