// Ciclo proativo — o Assessor fala primeiro quando faz sentido.
// Regras determinísticas iniciais. IA não decide aqui; é hardcoded para
// evitar barulho, respeitando a Regra de Ouro.

import { sanitizeReply } from "../culture/sanitize";
import { isDealClosed } from "@/lib/deals/stages";
import { DAILY_BRIEFING_PREFIX } from "../supreme/briefing.server";
import { isFollowUpClosed, isFollowUpOpen } from "@/lib/follow-ups/state";
import { computePriorities } from "../supreme/priorities.server";
import { lisbonYmd, ymdDiffDays } from "@/lib/assessor/lisbon-day";

/** O seguimento já foi tratado, desmarcado ou arquivado? */
export async function isFollowUpSettled(supabase: any, followUpId: string): Promise<boolean> {
  const { data } = await supabase
    .from("follow_ups")
    .select("status, outcome, archived_at")
    .eq("id", followUpId)
    .maybeSingle();
  if (!data) return true;
  // Regra canónica de "fechado". Nota: um resultado que pede nova ação
  // ("precisa_nova_acao", "adiado") NÃO fecha o seguimento.
  return isFollowUpClosed(data as any);
}

export type NudgeKind =
  | "person_silence"       // pessoa com oportunidade sem contacto há N dias
  | "property_missing_docs" // imóvel activo sem documentos essenciais
  | "followup_overdue"     // follow-up vencido há > 2 dias
  | "consultant_silence";  // consultor calado há > 3 dias úteis

export interface NudgeDraft {
  kind: NudgeKind;
  subject_type: string | null;
  subject_id: string | null;
  reason: string;
  suggested_reply: string;
  dedupe_key: string;
}

export const DOCUMENT_NUDGE_MAX_ATTEMPTS = 2;

function isOpenNudgeStatus(status: unknown): boolean {
  return status === "pending" || status === "sent" || status === "dispatching";
}

async function moveExhaustedDocumentNudgeToMisc(
  supabase: any,
  userId: string,
  property: { id: string; title: string },
  rows: any[],
): Promise<void> {
  const title = `Documentação em falta: ${property.title}`.slice(0, 120);
  const { data: existing } = await supabase
    .from("miscellaneous_items")
    .select("id")
    .eq("user_id", userId)
    .eq("title", title)
    .limit(1);
  if (!((existing as any[]) ?? []).length) {
    await supabase.from("miscellaneous_items").insert({
      user_id: userId,
      title,
      original_content: `Confirmar e pedir a documentação em falta do imóvel "${property.title}".`,
      summary: `O Afonso perguntou ${DOCUMENT_NUDGE_MAX_ATTEMPTS} vezes sem obter uma resposta conclusiva. Ficou à espera de ação manual.`,
      category: "Por tratar",
      source_channel: "proactive",
      status: "inbox",
      occurred_at: new Date().toISOString(),
      tags: ["documentação", "proatividade_esgotada"],
      item_class: "falha_interpretacao",
    } as never);
  }
  const ids = rows.filter((row) => isOpenNudgeStatus(row.status)).map((row) => row.id);
  if (ids.length) {
    await supabase
      .from("assessor_nudges")
      .update({ status: "dismissed", outcome: "manual_follow_up", outcome_at: new Date().toISOString() } as never)
      .in("id", ids);
  }
}

export async function resolveLatestDocumentNudgeAnswer(
  supabase: any,
  args: { userId: string; channel: string; answer: "yes" | "no"; lastAssistantContent: string },
): Promise<{ resolved: boolean; reply?: string }> {
  const question = args.lastAssistantContent.trim();
  if (!question) return { resolved: false };
  const { data } = await supabase
    .from("assessor_nudges")
    .select("id, subject_id, suggested_reply, sent_at")
    .eq("user_id", args.userId)
    .eq("kind", "property_missing_docs")
    .eq("status", "sent")
    .is("outcome_at", null)
    .order("sent_at", { ascending: false })
    .limit(5);
  const row = ((data as any[]) ?? []).find(
    (candidate) => String(candidate.suggested_reply ?? "").trim() === question,
  );
  if (!row) return { resolved: false };

  const now = new Date().toISOString();
  await supabase
    .from("assessor_nudges")
    .update({ status: "resolved", outcome: args.answer, outcome_at: now } as never)
    .eq("user_id", args.userId)
    .eq("kind", "property_missing_docs")
    .eq("subject_id", row.subject_id)
    .is("outcome_at", null);

  if (args.answer === "no") {
    return { resolved: true, reply: "Certo, não volto a perguntar sobre este documento." };
  }

  const { data: property } = await supabase
    .from("properties")
    .select("title")
    .eq("id", row.subject_id)
    .eq("user_id", args.userId)
    .maybeSingle();
  const title = String((property as any)?.title ?? "este imóvel");
  const miscTitle = `Pedir documentação: ${title}`.slice(0, 120);
  const { data: existing } = await supabase
    .from("miscellaneous_items")
    .select("id")
    .eq("user_id", args.userId)
    .eq("title", miscTitle)
    .limit(1);
  if (!((existing as any[]) ?? []).length) {
    await supabase.from("miscellaneous_items").insert({
      user_id: args.userId,
      title: miscTitle,
      original_content: `Pedir ao proprietário a documentação em falta do imóvel "${title}".`,
      summary: "O consultor confirmou que quer tratar deste pedido.",
      category: "Por tratar",
      source_channel: args.channel,
      status: "inbox",
      occurred_at: now,
      tags: ["documentação"],
    } as never);
  }
  return { resolved: true, reply: `Certo — deixei o pedido da documentação de “${title}” em Diversos, por tratar.` };
}

function isWithinBusinessHours(now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
  }).formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const hour = Number(map.hour ?? "0");
  const wd = (map.weekday ?? "").toLowerCase();
  if (wd === "sun") return false;
  if (wd === "sat" && hour >= 13) return false;
  return hour >= 9 && hour < 20;
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 864e5).toISOString();
}

function todayKey(): string {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const m: Record<string, string> = {};
  for (const x of p) m[x.type] = x.value;
  return `${m.year}${m.month}${m.day}`;
}

// Gera nudges para um consultor. Não envia — devolve drafts para gravar.
export async function generateNudgesForUser(
  supabase: any,
  userId: string,
  opts: { maxPerDay?: number } = {},
): Promise<NudgeDraft[]> {
  const maxPerDay = opts.maxPerDay ?? 3;
  const drafts: NudgeDraft[] = [];

  // Quantos já foram enviados hoje.
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count: sentToday } = await supabase
    .from("assessor_nudges")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "sent")
    .gte("sent_at", startOfDay.toISOString());
  if ((sentToday ?? 0) >= maxPerDay) return [];

  // 1) Pessoas silenciadas há ≥21 dias com oportunidade aberta.
  const { data: opps } = await supabase
    .from("opportunities")
    .select("id, person_id, stage, status, archived_at, next_action, next_action_date, updated_at")
    .eq("user_id", userId)
    .limit(50);
  // A fase é a fonte de verdade: negócio concluído não gera proatividade.
  const abertos = ((opps as any[]) ?? []).filter((o) => !o.archived_at && !isDealClosed(o));
  const personIds = Array.from(new Set(abertos.map((o) => o.person_id).filter(Boolean)));
  if (personIds.length) {
    const { data: people } = await supabase
      .from("people")
      .select("id, name, updated_at")
      .in("id", personIds)
      .lt("updated_at", daysAgo(21));
    for (const p of ((people as any[]) ?? []).slice(0, 2)) {
      const dedupe = `person_silence:${p.id}:${todayKey()}`;
      drafts.push({
        kind: "person_silence",
        subject_type: "person",
        subject_id: p.id,
        reason: `Sem contacto com ${p.name} há mais de 3 semanas e há uma oportunidade aberta.`,
        suggested_reply: sanitizeReply(`Já não falas com ${p.name} há umas semanas. Queres que combine um contacto?`),
        dedupe_key: dedupe,
      });
    }
  }

  // 2) Follow-ups vencidos > 2 dias — MESMA fonte que /hoje e o briefing.
  // Antes havia uma query própria aqui, que ignorava os filtros canónicos
  // (eventos importados do calendário, reuniões internas, lazer, compromissos
  // já terminados) e enchia a conversa de nudges por eventos do Outlook.
  const prioridades = await computePriorities(supabase, userId, { limit: 20 });
  const hojeYmd = lisbonYmd(new Date());
  const overdue = prioridades
    .filter((p) => p.subject_type === "follow_up")
    .filter((p) => p.due_at != null && ymdDiffDays(hojeYmd, lisbonYmd(p.due_at)) > 2)
    .slice(0, 3);
  for (const f of overdue) {
    const dedupe = `followup_overdue:${f.subject_id}:${todayKey()}`;
    drafts.push({
      kind: "followup_overdue",
      subject_type: "follow_up",
      subject_id: f.subject_id,
      reason: `Seguimento "${f.action}" já passou da data.`,
      suggested_reply: sanitizeReply(`O seguimento "${f.action}" ficou para trás. Fechamos ou remarcamos?`),
      dedupe_key: dedupe,
    });
  }

  // 3) Imóveis activos sem documentos essenciais há ≥ 7 dias.
  const { data: props } = await supabase
    .from("properties")
    .select("id, title, status, created_at")
    .eq("user_id", userId)
    .in("status", ["active", "activo", "ativo", "captacao", "angariacao"])
    .lt("created_at", daysAgo(7))
    .limit(20);
  const propIds = ((props as any[]) ?? []).map((p) => p.id);
  if (propIds.length) {
    const [{ data: files }, { data: previousDocumentNudges }] = await Promise.all([
      supabase
      .from("uploaded_files")
      .select("related_resource_id, document_type")
      .eq("user_id", userId)
      .eq("related_resource_type", "property")
      .in("related_resource_id", propIds),
      supabase
        .from("assessor_nudges")
        .select("id, subject_id, status, outcome, outcome_at, sent_at, created_at")
        .eq("user_id", userId)
        .eq("kind", "property_missing_docs")
        .in("subject_id", propIds)
        .order("created_at", { ascending: false }),
    ]);
    const nudgesByProp = new Map<string, any[]>();
    for (const nudge of ((previousDocumentNudges as any[]) ?? [])) {
      const list = nudgesByProp.get(nudge.subject_id) ?? [];
      list.push(nudge);
      nudgesByProp.set(nudge.subject_id, list);
    }
    const filesByProp = new Map<string, Set<string>>();
    for (const f of ((files as any[]) ?? [])) {
      const set = filesByProp.get(f.related_resource_id) ?? new Set<string>();
      if (f.document_type) set.add(String(f.document_type).toLowerCase());
      filesByProp.set(f.related_resource_id, set);
    }
    for (const p of (props as any[]).slice(0, 2)) {
      const history = nudgesByProp.get(p.id) ?? [];
      if (history.some((row) => row.outcome_at || row.outcome)) continue;
      if (history.some((row) => row.status === "pending" || row.status === "dispatching")) continue;
      const attempts = history.filter((row) => row.status === "sent").length;
      if (attempts >= DOCUMENT_NUDGE_MAX_ATTEMPTS) {
        await moveExhaustedDocumentNudgeToMisc(supabase, userId, p, history);
        continue;
      }
      const set = filesByProp.get(p.id) ?? new Set<string>();
      const hasCaderneta = [...set].some((k) => k.includes("caderneta"));
      const hasCert = [...set].some((k) => k.includes("energ"));
      if (!hasCaderneta || !hasCert) {
        const dedupe = `property_missing_docs:${p.id}:${todayKey()}`;
        drafts.push({
          kind: "property_missing_docs",
          subject_type: "property",
          subject_id: p.id,
          reason: `Imóvel "${p.title}" continua sem ${!hasCaderneta ? "caderneta predial" : "certificado energético"}.`,
          suggested_reply: sanitizeReply(`Falta ${!hasCaderneta ? "a caderneta" : "o certificado energético"} no imóvel "${p.title}". Peço ao proprietário?`),
          dedupe_key: dedupe,
        });
      }
    }
  }

  // 4) Silêncio do consultor há ≥ 3 dias.
  const { data: lastMsg } = await supabase
    .from("assessor_messages")
    .select("created_at")
    .eq("user_id", userId)
    .eq("role", "user")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastAt = (lastMsg as any)?.created_at ? new Date((lastMsg as any).created_at) : null;
  if (lastAt && Date.now() - lastAt.getTime() > 3 * 864e5) {
    drafts.push({
      kind: "consultant_silence",
      subject_type: null,
      subject_id: null,
      reason: "Sem mensagens do consultor há mais de 3 dias.",
      suggested_reply: "Bom dia. Queres que veja como está o teu pipeline?",
      dedupe_key: `consultant_silence:${todayKey()}`,
    });
  }

  return drafts.slice(0, maxPerDay - (sentToday ?? 0));
}

// Persiste os drafts (ignora colisões via dedupe_key) e devolve os que
// realmente entraram como pending.
export async function persistNudges(
  supabase: any,
  userId: string,
  drafts: NudgeDraft[],
): Promise<Array<NudgeDraft & { id: string }>> {
  const created: Array<NudgeDraft & { id: string }> = [];
  for (const d of drafts) {
    const { data, error } = await supabase
      .from("assessor_nudges")
      .insert({
        user_id: userId,
        kind: d.kind,
        subject_type: d.subject_type,
        subject_id: d.subject_id,
        reason: d.reason,
        suggested_reply: d.suggested_reply,
        dedupe_key: d.dedupe_key,
        status: "pending",
      } as never)
      .select("id")
      .maybeSingle();
    if (!error && data?.id) created.push({ ...d, id: data.id });
  }
  return created;
}

// Envia pending para o WhatsApp e marca como sent/dismissed.
export async function dispatchPendingNudges(
  supabase: any,
  opts: { maxPerRun?: number; now?: Date } = {},
): Promise<{ sent: number; skipped: number }> {
  const now = opts.now ?? new Date();
  if (!isWithinBusinessHours(now)) return { sent: 0, skipped: 0 };
  const maxPerRun = opts.maxPerRun ?? 20;

  const { data: pending } = await supabase
    .from("assessor_nudges")
    .select("id, user_id, suggested_reply, subject_type, subject_id, dedupe_key")
    .eq("status", "pending")
    .lte("scheduled_for", now.toISOString())
    .order("created_at", { ascending: true })
    .limit(maxPerRun);
  const rows = (pending as any[]) ?? [];
  if (!rows.length) return { sent: 0, skipped: 0 };

  // Só envia a consultores com canal ligado e v3 activa. O canal é sempre o
  // principal (WhatsApp quando existe), nunca o da última mensagem recebida.
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const { data: v3Users } = await supabase
    .from("feature_flag_users")
    .select("user_id")
    .eq("flag_key", "assessor.engine.v3")
    .in("user_id", userIds);
  const v3Set = new Set(((v3Users as any[]) ?? []).map((u) => u.user_id));

  let sent = 0, skipped = 0;
  const { resolveOutboundTarget } = await import("@/lib/assessor/primary-channel.server");
  const { sendReplyForChannel } = await import("@/lib/assessor/channels.server");
  const targets = new Map<string, { channel: "whatsapp" | "telegram"; externalId: string } | null>();
  for (const uid of userIds) targets.set(uid, await resolveOutboundTarget(supabase, uid));
  const seenSubjects = new Set<string>();
  for (const row of rows) {
    const subjectKey = `${row.user_id}:${row.subject_type ?? ""}:${row.subject_id ?? ""}:${String(row.dedupe_key ?? "").split(":")[0]}`;
    if (row.subject_id && seenSubjects.has(subjectKey)) {
      await supabase.from("assessor_nudges").update({ status: "dismissed" }).eq("id", row.id);
      skipped++;
      continue;
    }
    if (row.subject_id) seenSubjects.add(subjectKey);
    const target = targets.get(row.user_id) ?? null;
    if (!target || !v3Set.has(row.user_id)) {
      await supabase.from("assessor_nudges").update({ status: "dismissed" }).eq("id", row.id);
      skipped++;
      continue;
    }
    // O texto foi escrito quando o nudge nasceu; entretanto o consultor pode
    // ter tratado (ou desmarcado) o assunto. Reavalia antes de falar.
    let text: string = row.suggested_reply;
    if (String(row.dedupe_key ?? "").startsWith(DAILY_BRIEFING_PREFIX)) {
      const { resolveBriefingAtDispatch } = await import("../supreme/briefing.server");
      const fresh = await resolveBriefingAtDispatch(supabase, row.user_id);
      if (!fresh.send) {
        await supabase.from("assessor_nudges").update({ status: "dismissed" }).eq("id", row.id);
        skipped++;
        continue;
      }
      text = fresh.text;
    } else if (row.subject_type === "follow_up" && row.subject_id) {
      if (await isFollowUpSettled(supabase, row.subject_id)) {
        await supabase.from("assessor_nudges").update({ status: "dismissed" }).eq("id", row.id);
        skipped++;
        continue;
      }
    }
    const r = await sendReplyForChannel(target.channel, target.externalId, text);
    if (r.ok) {
      await supabase.from("assessor_nudges").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", row.id);
      // Persiste no histórico do chat para o consultor ver na app.
      await supabase.from("assessor_messages").insert({
        user_id: row.user_id, channel: target.channel, role: "assistant",
        content: text, message_type: "proactive_nudge",
      } as never);
      sent++;
    } else {
      skipped++;
    }
  }
  return { sent, skipped };
}

// Envia lembretes de follow-ups agendados pelo Assessor cuja hora chegou.
// Dedupe: só envia se ainda não existir uma mensagem `followup_reminder`
// ligada a esse follow-up.
export async function dispatchDueFollowUpReminders(
  supabase: any,
  opts: { now?: Date; windowMinutes?: number; maxPerRun?: number } = {},
): Promise<{ sent: number; skipped: number }> {
  const now = opts.now ?? new Date();
  const windowMin = opts.windowMinutes ?? 10;
  const maxPerRun = opts.maxPerRun ?? 20;

  const upper = new Date(now.getTime() + 60_000).toISOString();
  const lower = new Date(now.getTime() - windowMin * 60_000).toISOString();

  const { data: due } = await supabase
    .from("follow_ups")
    .select("id, user_id, title, due_date, due_time, type, status, outcome, archived_at, related_prospecting_lead_id, person_id, opportunity_id")
    .gte("due_date", lower)
    .lte("due_date", upper)
    .order("due_date", { ascending: true })
    .limit(maxPerRun * 3);
  // Regra canónica de aberto/fechado (antes: lista de status à mão, que
  // deixava passar "Concluído" em minúsculas e ignorava outcome/archived_at).
  const rows = ((due as any[]) ?? []).filter(isFollowUpOpen).slice(0, maxPerRun);
  if (!rows.length) return { sent: 0, skipped: 0 };

  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const [{ data: v3Users }, { data: already }] = await Promise.all([
    supabase.from("feature_flag_users").select("user_id").eq("flag_key", "assessor.engine.v3").in("user_id", userIds),
    supabase.from("assessor_messages")
      .select("related_resource_id")
      .eq("message_type", "followup_reminder")
      .eq("related_resource_type", "follow_up")
      .in("related_resource_id", rows.map((r) => r.id)),
  ]);
  const v3Set = new Set(((v3Users as any[]) ?? []).map((u) => u.user_id));
  const sentIds = new Set(((already as any[]) ?? []).map((r) => r.related_resource_id));

  const { resolveOutboundTarget } = await import("@/lib/assessor/primary-channel.server");
  const { sendReplyForChannel } = await import("@/lib/assessor/channels.server");
  const targets = new Map<string, { channel: "whatsapp" | "telegram"; externalId: string } | null>();
  for (const uid of userIds) targets.set(uid, await resolveOutboundTarget(supabase, uid));

  let sent = 0, skipped = 0;
  for (const fu of rows) {
    if (sentIds.has(fu.id)) { skipped++; continue; }
    const target = targets.get(fu.user_id) ?? null;
    if (!target || !v3Set.has(fu.user_id)) { skipped++; continue; }
    const hhmm = new Intl.DateTimeFormat("pt-PT", {
      timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(new Date(fu.due_date));
    const text = sanitizeReply(`Lembrete: ${fu.title} (${hhmm}).`);
    const r = await sendReplyForChannel(target.channel, target.externalId, text);
    if (r.ok) {
      await supabase.from("assessor_messages").insert({
        user_id: fu.user_id, channel: target.channel, role: "assistant",
        content: text, message_type: "followup_reminder",
        related_resource_type: "follow_up", related_resource_id: fu.id,
      } as never);
      sent++;
    } else {
      skipped++;
    }
  }
  return { sent, skipped };
}