// Resumo diário de novidades para beta testers.
//
// Regra de ouro: o texto NUNCA é gerado a partir de commits ou logs técnicos.
// O rascunho parte das linhas de `product_updates` do dia — que já são escritas
// em linguagem de consultor — e só sai se um super admin o tiver aprovado.

import { isPlaceholderEmail } from "@/lib/profile/email";
import { getEmailProvider } from "@/lib/email/provider";
import { lisbonYmd, lisbonHhMm } from "@/lib/assessor/lisbon-day";

export const DIGEST_TZ = "Europe/Lisbon";
export const DIGEST_HOUR = 19;
/** Depois desta hora o rascunho deixa de aceitar edições: fica pronto para sair. */
export const DIGEST_LOCK_HOUR = 18;
const ACTIVE_WINDOW_DAYS = 30;

/** Data de hoje em Lisboa (YYYY-MM-DD) — o dia do consultor, não o UTC. */
export function lisbonDate(now: Date = new Date()): string {
  return lisbonYmd(now);
}

/** Hora local em Lisboa (0-23). */
export function lisbonHour(now: Date = new Date()): number {
  return Number(lisbonHhMm(now).slice(0, 2));
}

const CATEGORY_LABEL: Record<string, string> = {
  nova_funcionalidade: "Novo",
  melhoria: "Melhor",
  correcao: "Corrigimos",
};

export type UpdateRow = { title: string; description: string; category: string };

/** Texto do rascunho a partir das novidades do dia. Linguagem de consultor. */
export function composeDigestBody(updates: UpdateRow[], dateISO: string): string {
  const nice = new Date(`${dateISO}T12:00:00Z`).toLocaleDateString("pt-PT", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  const lines = updates.map((u) => {
    const tag = CATEGORY_LABEL[u.category] ?? "Novo";
    return `${tag}: ${u.title}\n${u.description}`;
  });
  return [
    "Olá,",
    "",
    `Aqui vai o que mudou no Afonso a ${nice}:`,
    "",
    lines.join("\n\n"),
    "",
    "Se alguma coisa não estiver a funcionar como esperas, responde a este email ou diz ao Afonso pelo WhatsApp/Telegram.",
    "",
    "Obrigado por testares.",
  ].join("\n");
}

export function composeDigestSubject(dateISO: string): string {
  const nice = new Date(`${dateISO}T12:00:00Z`).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
  return `Afonso — novidades de ${nice}`;
}

export type DigestRecipient = { userId: string; name: string | null; email: string };

/**
 * Beta testers ativos: beta por expirar, email real (nada de sintéticos nem
 * contas de CI/shadow) e com atividade nos últimos 30 dias.
 */
export async function resolveBetaRecipients(supabaseAdmin: any): Promise<DigestRecipient[]> {
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, name, email, account_kind, beta_expires_at")
    .eq("is_beta_tester", true);

  const nowMs = Date.now();
  const candidates = ((profiles ?? []) as any[]).filter((p) => {
    const email = String(p.email ?? "").toLowerCase();
    if (isPlaceholderEmail(email)) return false;
    if (email.startsWith("ci-")) return false;
    if (p.beta_expires_at && new Date(p.beta_expires_at).getTime() <= nowMs) return false;
    return true;
  });
  if (!candidates.length) return [];

  const ids = candidates.map((p) => p.id as string);
  const since = new Date(nowMs - ACTIVE_WINDOW_DAYS * 864e5).toISOString();
  const { data: recent } = await supabaseAdmin
    .from("assessor_messages")
    .select("user_id")
    .in("user_id", ids)
    .gte("created_at", since)
    .limit(5000);
  const active = new Set(((recent ?? []) as any[]).map((r) => r.user_id));

  return candidates
    .filter((p) => active.has(p.id))
    .map((p) => ({ userId: p.id as string, name: (p.name ?? null) as string | null, email: p.email as string }));
}

/** Novidades visíveis para o consultor publicadas nesse dia. */
export async function updatesForDate(supabaseAdmin: any, dateISO: string): Promise<UpdateRow[]> {
  const { data } = await supabaseAdmin
    .from("product_updates")
    .select("title, description, category, created_at")
    .eq("released_on", dateISO)
    .eq("is_published", true)
    .order("created_at", { ascending: true });
  return ((data ?? []) as any[]).map((u) => ({
    title: u.title as string,
    description: u.description as string,
    category: u.category as string,
  }));
}

/**
 * Garante que existe rascunho para o dia e mantém-no alinhado com as novidades
 * enquanto ninguém lhe tocou (estado `rascunho` e texto ainda automático).
 */
export async function ensureDraft(supabaseAdmin: any, dateISO: string) {
  const updates = await updatesForDate(supabaseAdmin, dateISO);
  const auto = updates.length ? composeDigestBody(updates, dateISO) : "";

  const { data: existing } = await supabaseAdmin
    .from("daily_digests")
    .select("*")
    .eq("digest_date", dateISO)
    .maybeSingle();

  if (!existing) {
    const { data: created } = await supabaseAdmin
      .from("daily_digests")
      .insert({
        digest_date: dateISO,
        subject: composeDigestSubject(dateISO),
        body: auto,
        status: "rascunho",
      } as never)
      .select("*")
      .maybeSingle();
    return { digest: created, updates, autoBody: auto };
  }

  // Enquanto ninguém editou o texto à mão, o rascunho acompanha as novidades
  // que forem sendo registadas ao longo do dia.
  if (existing.status === "rascunho" && !existing.body_edited && existing.body !== auto) {
    const { data: refreshed } = await supabaseAdmin
      .from("daily_digests")
      .update({ body: auto } as never)
      .eq("id", existing.id)
      .select("*")
      .maybeSingle();
    return { digest: refreshed ?? existing, updates, autoBody: auto };
  }
  return { digest: existing, updates, autoBody: auto };
}

export type DigestSendResult = {
  ok: boolean;
  skipped?: "sem_novidades" | "nao_aprovado" | "ja_enviado" | "sem_destinatarios";
  sent?: number;
  failed?: number;
  error?: string;
};

/** Aprovações tardias: aprovado depois das 19h e ainda por sair (janela de 24h). */
export async function findPendingApproved(
  supabaseAdmin: any,
  now: Date = new Date(),
): Promise<{ id: string; digest_date: string }[]> {
  const since = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const { data } = await supabaseAdmin
    .from("daily_digests")
    .select("id, digest_date, approved_at")
    .eq("status", "aprovado")
    .is("sent_at", null)
    .gte("approved_at", since)
    .order("digest_date", { ascending: true })
    .limit(5);
  return ((data ?? []) as any[]).map((d) => ({ id: d.id as string, digest_date: d.digest_date as string }));
}

/** Saúde do envio: serviço ligado + última falha conhecida, para avisar antes de aprovar. */
export async function checkEmailHealth(
  supabaseAdmin: any,
): Promise<{ ok: boolean; note: string | null }> {
  const provider = await getEmailProvider();
  if (provider.name === "null") return { ok: false, note: "provider de email não ligado" };
  const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const { data } = await supabaseAdmin
    .from("daily_digests")
    .select("note, status, digest_date")
    .eq("status", "falhou")
    .gte("digest_date", since)
    .order("digest_date", { ascending: false })
    .limit(1);
  const last = ((data ?? []) as any[])[0];
  if (last?.note) return { ok: false, note: String(last.note) };
  return { ok: true, note: null };
}

/** Envio real do resumo de um dia. Só envia o que estiver aprovado. */
export async function sendDigestForDate(
  supabaseAdmin: any,
  dateISO: string,
  opts: { force?: boolean; actorId?: string | null } = {},
): Promise<DigestSendResult> {
  const { digest } = await ensureDraft(supabaseAdmin, dateISO);
  if (!digest) return { ok: false, error: "rascunho indisponível" };
  if (digest.status === "enviado") return { ok: true, skipped: "ja_enviado" };

  const body = String(digest.body ?? "").trim();
  if (!body) {
    await supabaseAdmin.from("daily_digests").update({ status: "sem_novidades" } as never).eq("id", digest.id);
    return { ok: true, skipped: "sem_novidades" };
  }
  if (digest.status !== "aprovado" && !opts.force) return { ok: true, skipped: "nao_aprovado" };

  const recipients = await resolveBetaRecipients(supabaseAdmin);
  if (!recipients.length) {
    await supabaseAdmin
      .from("daily_digests")
      .update({ status: "falhou", note: "sem beta testers ativos" } as never)
      .eq("id", digest.id);
    return { ok: false, skipped: "sem_destinatarios" };
  }

  const subject = String(digest.subject ?? "").trim() || composeDigestSubject(dateISO);
  const provider = await getEmailProvider();
  if (provider.name === "null") {
    await supabaseAdmin
      .from("daily_digests")
      .update({ status: "falhou", note: "provider de email não ligado" } as never)
      .eq("id", digest.id);
    return { ok: false, error: "provider de email não ligado" };
  }

  const results: { userId: string; email: string; ok: boolean; error?: string }[] = [];
  for (const r of recipients) {
    const res = await provider.send({ to: r.email, subject, body });
    results.push({
      userId: r.userId,
      email: r.email,
      ok: res.success,
      ...(res.success ? {} : { error: res.error ?? "envio falhou" }),
    });
  }
  const sent = results.filter((r) => r.ok).length;
  const status = sent === 0 ? "falhou" : sent < results.length ? "enviado_parcial" : "sent";

  const { data: broadcast } = await supabaseAdmin
    .from("admin_broadcasts")
    .insert({
      channel: "email",
      segment: "beta",
      subject,
      body,
      recipients_count: results.length,
      status,
      created_by: opts.actorId ?? null,
    } as never)
    .select("id")
    .maybeSingle();
  const broadcastId = (broadcast as any)?.id as string | undefined;
  if (broadcastId) {
    await supabaseAdmin.from("admin_broadcast_recipients").insert(
      results.map((r) => ({
        broadcast_id: broadcastId,
        user_id: r.userId,
        email: r.email,
        status: r.ok ? "entregue" : "falhou",
        error: r.error ?? null,
      })) as never,
    );
  }

  await supabaseAdmin
    .from("daily_digests")
    .update({
      status: sent > 0 ? "enviado" : "falhou",
      sent_at: new Date().toISOString(),
      recipients_count: results.length,
      broadcast_id: broadcastId ?? null,
      note: sent === results.length ? null : (results.find((r) => !r.ok)?.error ?? null),
    } as never)
    .eq("id", digest.id);

  return { ok: sent > 0, sent, failed: results.length - sent };
}
