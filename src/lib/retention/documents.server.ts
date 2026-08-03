// DOCUMENTOS NO PLANO BASE — 100 MB de espaço e 7 dias de retenção.
//
// Não é castigo: é o que o plano Base inclui. Planos pagos não têm este
// limite nem esta janela. Registos estruturados (pessoas, imóveis, negócios,
// seguimentos, notas) NUNCA expiram — o que sai da janela é apenas o
// ficheiro em si.
//
// Contas que desceram de plano ficam com profiles.readonly_until = +90 dias:
// enquanto essa data não passar, os documentos continuam acessíveis em
// leitura e nada é arquivado.

export const BASE_DOCS_QUOTA_BYTES = 100 * 1024 * 1024; // 100 MB
export const BASE_DOCS_RETENTION_DAYS = 7;
export const BASE_DOCS_WARN_DAYS = 5;
const DAY = 864e5;

export const DOCS_RETENTION_WARNING_TEXT =
  `O plano Base guarda documentos durante ${BASE_DOCS_RETENTION_DAYS} dias e tens ficheiros a chegar ao fim desse prazo. ` +
  "O que já registei a partir deles (imóveis, pessoas, valores, notas) fica para sempre — sai apenas o ficheiro. " +
  "Se quiseres guardar algum, descarrega-o agora do Drive Inteligente.";

export function quotaExceededText(usedBytes: number): string {
  const mb = Math.round(usedBytes / (1024 * 1024));
  return (
    `Já ocupaste ${mb} MB dos 100 MB de documentos que o plano Base inclui. ` +
    "Posso continuar a registar o que me disseres por escrito; para guardar mais ficheiros, " +
    "liberta espaço no Drive Inteligente ou abre um plano com mais espaço."
  );
}

async function audit(
  supabaseAdmin: any,
  action: string,
  userId: string | null,
  reason: string,
  metadata: Record<string, unknown>,
) {
  await supabaseAdmin.from("admin_audit_logs").insert({
    admin_user_id: null,
    action,
    target_user_id: userId,
    resource_type: "uploaded_files",
    resource_id: userId,
    reason,
    metadata: { ...metadata, source: "cron:docs-retention" },
  } as never);
}

/** Espaço ocupado por documentos vivos. */
export async function documentsUsage(
  supabaseAdmin: any,
  userId: string,
): Promise<{ usedBytes: number; files: number }> {
  const { data } = await supabaseAdmin
    .from("uploaded_files")
    .select("size_bytes")
    .eq("user_id", userId)
    .is("deleted_at", null);
  const rows = ((data as any[]) ?? []);
  return {
    usedBytes: rows.reduce((acc, r) => acc + Number(r.size_bytes ?? 0), 0),
    files: rows.length,
  };
}

/** Há espaço para mais um ficheiro? Só o plano Base tem limite. */
export async function canStoreDocument(
  supabaseAdmin: any,
  userId: string,
  incomingBytes: number,
  tier: string | null | undefined,
): Promise<{ ok: true } | { ok: false; reply: string; usedBytes: number }> {
  if (String(tier ?? "").toLowerCase() !== "base") return { ok: true };
  const { usedBytes } = await documentsUsage(supabaseAdmin, userId);
  if (usedBytes + Math.max(0, incomingBytes) <= BASE_DOCS_QUOTA_BYTES) return { ok: true };
  return { ok: false, reply: quotaExceededText(usedBytes), usedBytes };
}

async function baseEligibleUsers(supabaseAdmin: any, now: Date): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, subscription_tier, readonly_until, docs_retention_warned_at")
    .eq("subscription_tier", "base");
  return ((data as any[]) ?? [])
    .filter((r) => {
      const ro = r.readonly_until ? new Date(r.readonly_until).getTime() : 0;
      return r.id && ro <= now.getTime();
    })
    .map((r) => String(r.id));
}

/** Aviso ao 5.º dia, no máximo uma vez por semana. */
export async function warnExpiringDocuments(
  supabaseAdmin: any,
  opts: { now?: Date } = {},
): Promise<{ warned: string[] }> {
  const now = opts.now ?? new Date();
  const users = await baseEligibleUsers(supabaseAdmin, now);
  const warned: string[] = [];

  for (const userId of users) {
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("docs_retention_warned_at")
      .eq("id", userId)
      .maybeSingle();
    const last = (prof as any)?.docs_retention_warned_at
      ? new Date((prof as any).docs_retention_warned_at).getTime()
      : 0;
    if (now.getTime() - last < 7 * DAY) continue;

    const cutoff = new Date(now.getTime() - BASE_DOCS_WARN_DAYS * DAY).toISOString();
    const { data: due } = await supabaseAdmin
      .from("uploaded_files")
      .select("id")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .lt("created_at", cutoff)
      .limit(1);
    if (!((due as any[]) ?? []).length) continue;

    try {
      const { sendOutbound } = await import("@/lib/assessor/primary-channel.server");
      await sendOutbound(supabaseAdmin, userId, DOCS_RETENTION_WARNING_TEXT);
    } catch (err) {
      console.error("[docs-retention] aviso falhou:", err);
      continue;
    }

    await supabaseAdmin
      .from("profiles")
      .update({ docs_retention_warned_at: now.toISOString() } as never)
      .eq("id", userId);
    await audit(supabaseAdmin, "docs.retention_warned", userId, "Aviso de fim de retenção de documentos (Base).", {
      warn_days: BASE_DOCS_WARN_DAYS,
    });
    warned.push(userId);
  }
  return { warned };
}

/** Arquivo (soft-delete) dos documentos fora da janela de 7 dias. */
export async function archiveExpiredDocuments(
  supabaseAdmin: any,
  opts: { now?: Date } = {},
): Promise<{ archived: number; byUser: Record<string, number> }> {
  const now = opts.now ?? new Date();
  const users = await baseEligibleUsers(supabaseAdmin, now);
  if (!users.length) return { archived: 0, byUser: {} };

  const cutoff = new Date(now.getTime() - BASE_DOCS_RETENTION_DAYS * DAY).toISOString();
  const { data } = await supabaseAdmin
    .from("uploaded_files")
    .select("id, user_id")
    .in("user_id", users)
    .is("deleted_at", null)
    .lt("created_at", cutoff);

  const list = ((data as any[]) ?? []).filter((r) => r.id);
  if (!list.length) return { archived: 0, byUser: {} };

  const stamp = now.toISOString();
  const byUser: Record<string, number> = {};
  for (const r of list) byUser[String(r.user_id)] = (byUser[String(r.user_id)] ?? 0) + 1;

  await supabaseAdmin
    .from("uploaded_files")
    .update({ deleted_at: stamp, retention_archived_at: stamp } as never)
    .in("id", list.map((r) => r.id as string));

  for (const [userId, count] of Object.entries(byUser)) {
    await audit(
      supabaseAdmin,
      "docs.retention_archived",
      userId,
      `Documentos fora da janela do plano Base arquivados (${count}).`,
      { files: count, retention_days: BASE_DOCS_RETENTION_DAYS, cutoff },
    );
  }
  return { archived: list.length, byUser };
}

/** Corrida diária de documentos: avisar → arquivar. */
export async function runDocumentsRetention(supabaseAdmin: any, opts: { now?: Date } = {}) {
  const warn = await warnExpiringDocuments(supabaseAdmin, opts);
  const archive = await archiveExpiredDocuments(supabaseAdmin, opts);
  return { warnedDocs: warn.warned.length, archivedDocs: archive.archived };
}