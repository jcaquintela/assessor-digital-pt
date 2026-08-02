// CONTEXTO CONVERSACIONAL ATIVO DO PLANO BASE (21 dias).
//
// Não é um castigo: é a janela de contexto que o plano Base inclui. Só se
// aplica a contas em Base. Planos pagos mantêm a conversa.
//
// O QUE SAI DA JANELA: apenas a conversa em bruto (mensagens de texto/áudio
// em assessor_messages vindas por Telegram) e os áudios associados.
// O QUE NUNCA EXPIRA: pessoas, imóveis, negócios, seguimentos, documentos do
// Drive, notas — tudo o que já ficou organizado a partir dessas conversas.
//
// Nunca há eliminação direta. São três passos:
//   18 dias → aviso ("se houver algo importante, diz-me agora")
//   21 dias → sai da janela ativa (soft-delete: archived_at), recuperável
//             manualmente pela equipa.
//   +30 dias → limpeza física definitiva.
//
// ARQUIVO APÓS DESCIDA DE PLANO: quem desce de plano fica com
// profiles.readonly_until = +90 dias. Enquanto essa data não passar, nada
// é arquivado nem limpo — o histórico continua acessível em leitura.

export const WARN_AFTER_DAYS = 18;
export const ARCHIVE_AFTER_DAYS = 21;
export const PURGE_AFTER_ARCHIVE_DAYS = 30;
const WARN_COOLDOWN_DAYS = 7;

const DAY = 864e5;

export const RETENTION_WARNING_TEXT =
  "O teu plano inclui 3 semanas de conversa ativa, e há mensagens a chegar ao fim dessa janela. " +
  "Sai só a conversa em si — tudo o que já organizámos (pessoas, imóveis, seguimentos, documentos) fica. " +
  "Se houver algo importante ainda por registar, diz-me agora.";

function iso(msAgo: number, now: Date) {
  return new Date(now.getTime() - msAgo).toISOString();
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
    resource_type: "assessor_messages",
    resource_id: userId,
    reason,
    metadata: { ...metadata, source: "cron:telegram-retention" },
  } as never);
}

/** Contas com Telegram ligado (channel_links). */
export async function listTelegramUsers(
  supabaseAdmin: any,
): Promise<{ userId: string; chatId: string }[]> {
  const { data } = await supabaseAdmin
    .from("channel_links")
    .select("user_id, external_id")
    .eq("channel", "telegram");
  return ((data as any[]) ?? [])
    .filter((r) => r.user_id && r.external_id)
    .map((r) => ({ userId: r.user_id as string, chatId: String(r.external_id) }));
}

/**
 * Contas a que a janela de 21 dias se aplica: plano Base e sem arquivo em
 * modo leitura ativo (descida de plano recente).
 */
export async function listBaseWindowUsers(
  supabaseAdmin: any,
  opts: { now?: Date } = {},
): Promise<Set<string>> {
  const now = opts.now ?? new Date();
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, subscription_tier, readonly_until")
    .eq("subscription_tier", "base");
  const set = new Set<string>();
  for (const r of ((data as any[]) ?? [])) {
    const ro = r.readonly_until ? new Date(r.readonly_until).getTime() : 0;
    if (ro > now.getTime()) continue; // arquivo de 90 dias ainda ativo
    if (r.id) set.add(String(r.id));
  }
  return set;
}

/** Fase 1 — aviso aos 18 dias, no máximo uma vez por semana. */
export async function warnExpiringTelegramConversations(
  supabaseAdmin: any,
  opts: { now?: Date } = {},
): Promise<{ warned: string[]; skipped: number }> {
  const now = opts.now ?? new Date();
  const users = await listTelegramUsers(supabaseAdmin);
  const eligible = await listBaseWindowUsers(supabaseAdmin, { now });
  const warned: string[] = [];
  let skipped = 0;

  for (const u of users) {
    if (!eligible.has(u.userId)) { skipped++; continue; }
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("telegram_retention_warned_at")
      .eq("id", u.userId)
      .maybeSingle();
    const last = (prof as any)?.telegram_retention_warned_at
      ? new Date((prof as any).telegram_retention_warned_at).getTime()
      : 0;
    if (now.getTime() - last < WARN_COOLDOWN_DAYS * DAY) { skipped++; continue; }

    const { data: due } = await supabaseAdmin
      .from("assessor_messages")
      .select("id")
      .eq("user_id", u.userId)
      .eq("channel", "telegram")
      .is("archived_at", null)
      .lt("created_at", iso(WARN_AFTER_DAYS * DAY, now))
      .limit(1);
    if (!((due as any[]) ?? []).length) { skipped++; continue; }

    const { getTelegramProvider } = await import("@/lib/telegram/provider.server");
    const r = await getTelegramProvider().sendText({
      chatId: u.chatId,
      text: RETENTION_WARNING_TEXT,
    });
    if (!r.ok) { skipped++; continue; }

    await supabaseAdmin.from("assessor_messages").insert({
      user_id: u.userId,
      role: "assistant",
      content: RETENTION_WARNING_TEXT,
      channel: "telegram",
      message_type: "retention_warning",
      status: "sent",
    } as never);
    await supabaseAdmin
      .from("profiles")
      .update({ telegram_retention_warned_at: now.toISOString() } as never)
      .eq("id", u.userId);
    await audit(supabaseAdmin, "telegram.retention_warned", u.userId, "Aviso de fim da janela de conversa ativa (18 dias).", {
      warn_after_days: WARN_AFTER_DAYS,
    });
    warned.push(u.userId);
  }

  return { warned, skipped };
}

/** Fase 2 — arquivo aos 21 dias (soft-delete). Nunca elimina fisicamente. */
export async function archiveExpiredTelegramMessages(
  supabaseAdmin: any,
  opts: { now?: Date } = {},
): Promise<{ archivedMessages: number; archivedAudio: number; byUser: Record<string, number> }> {
  const now = opts.now ?? new Date();
  const cutoff = iso(ARCHIVE_AFTER_DAYS * DAY, now);
  const eligible = await listBaseWindowUsers(supabaseAdmin, { now });
  if (!eligible.size) return { archivedMessages: 0, archivedAudio: 0, byUser: {} };

  const { data: rows, error } = await supabaseAdmin
    .from("assessor_messages")
    .select("id, user_id")
    .eq("channel", "telegram")
    .is("archived_at", null)
    .lt("created_at", cutoff);
  if (error) throw new Error(error.message);

  const list = ((rows as any[]) ?? []).filter((r) => r.id && eligible.has(String(r.user_id)));
  if (!list.length) return { archivedMessages: 0, archivedAudio: 0, byUser: {} };

  const ids = list.map((r) => r.id as string);
  const byUser: Record<string, number> = {};
  for (const r of list) byUser[r.user_id ?? "—"] = (byUser[r.user_id ?? "—"] ?? 0) + 1;

  const stamp = now.toISOString();
  const { error: upErr } = await supabaseAdmin
    .from("assessor_messages")
    .update({ archived_at: stamp } as never)
    .in("id", ids);
  if (upErr) throw new Error(upErr.message);

  // Áudios da conversa acompanham a mensagem (soft-delete). Documentos e
  // imagens já classificados no Drive ficam intactos.
  const { data: audio } = await supabaseAdmin
    .from("uploaded_files")
    .select("id, mime_type")
    .in("source_message_id", ids)
    .is("deleted_at", null);
  const audioIds = ((audio as any[]) ?? [])
    .filter((f) => String(f.mime_type ?? "").startsWith("audio"))
    .map((f) => f.id as string);
  if (audioIds.length) {
    await supabaseAdmin
      .from("uploaded_files")
      .update({ deleted_at: stamp } as never)
      .in("id", audioIds);
  }

  for (const [userId, count] of Object.entries(byUser)) {
    await audit(
      supabaseAdmin,
      "telegram.retention_archived",
      userId === "—" ? null : userId,
      `Conversa em bruto do Telegram arquivada (${count} mensagens, >${ARCHIVE_AFTER_DAYS} dias).`,
      { messages: count, cutoff, archive_after_days: ARCHIVE_AFTER_DAYS },
    );
  }

  return { archivedMessages: ids.length, archivedAudio: audioIds.length, byUser };
}

/** Fase 3 — limpeza física, 30 dias depois do arquivo. */
export async function purgeArchivedTelegramMessages(
  supabaseAdmin: any,
  opts: { now?: Date } = {},
): Promise<{ purgedMessages: number; purgedFiles: number; byUser: Record<string, number> }> {
  const now = opts.now ?? new Date();
  const cutoff = iso(PURGE_AFTER_ARCHIVE_DAYS * DAY, now);

  const { data: rows } = await supabaseAdmin
    .from("assessor_messages")
    .select("id, user_id")
    .eq("channel", "telegram")
    .not("archived_at", "is", null)
    .lt("archived_at", cutoff);
  const list = ((rows as any[]) ?? []).filter((r) => r.id);
  if (!list.length) return { purgedMessages: 0, purgedFiles: 0, byUser: {} };

  const ids = list.map((r) => r.id as string);
  const byUser: Record<string, number> = {};
  for (const r of list) byUser[r.user_id ?? "—"] = (byUser[r.user_id ?? "—"] ?? 0) + 1;

  const { data: files } = await supabaseAdmin
    .from("uploaded_files")
    .select("id, storage_path, mime_type")
    .in("source_message_id", ids);
  const audioFiles = ((files as any[]) ?? []).filter((f) =>
    String(f.mime_type ?? "").startsWith("audio"),
  );
  if (audioFiles.length) {
    const paths = audioFiles.map((f) => f.storage_path).filter(Boolean);
    if (paths.length) {
      try {
        await supabaseAdmin.storage.from("assessor-files").remove(paths);
      } catch (err) {
        console.error("[retencao-telegram] falha a remover áudios:", err);
      }
    }
    await supabaseAdmin.from("uploaded_files").delete().in("id", audioFiles.map((f) => f.id));
  }

  await supabaseAdmin.from("assessor_messages").delete().in("id", ids);

  for (const [userId, count] of Object.entries(byUser)) {
    await audit(
      supabaseAdmin,
      "telegram.retention_purged",
      userId === "—" ? null : userId,
      `Limpeza física da conversa arquivada (${count} mensagens, >${PURGE_AFTER_ARCHIVE_DAYS} dias em arquivo).`,
      { messages: count, files: audioFiles.length, cutoff },
    );
  }

  return { purgedMessages: ids.length, purgedFiles: audioFiles.length, byUser };
}

/** Corrida diária completa: avisar → arquivar → limpar. */
export async function runTelegramRetention(
  supabaseAdmin: any,
  opts: { now?: Date; purge?: boolean } = {},
) {
  const warn = await warnExpiringTelegramConversations(supabaseAdmin, opts);
  const archive = await archiveExpiredTelegramMessages(supabaseAdmin, opts);
  const purge = opts.purge === false
    ? { purgedMessages: 0, purgedFiles: 0, byUser: {} }
    : await purgeArchivedTelegramMessages(supabaseAdmin, opts);
  return { warned: warn.warned.length, ...archive, ...purge };
}