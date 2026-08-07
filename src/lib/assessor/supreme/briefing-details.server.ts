// Detalhe de um item que saiu do briefing: de onde veio, em que estado está
// agora e o que lhe aconteceu pelo caminho.
//
// Não inventamos histórico: a linha do tempo é montada a partir das datas que
// a base de dados já guarda (criação, sincronização de calendário, briefing
// enviado, resultado registado, arquivo).

import { followUpStateLabel } from "./priorities.server";

const PROVIDER_LABEL: Record<string, string> = {
  google_calendar: "Google Calendar",
  microsoft_outlook: "Microsoft Outlook",
};

const EVENT_TYPES = new Set(["evento", "event", "visita", "reuniao"]);
const norm = (v: unknown) =>
  String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: "por WhatsApp",
  telegram: "por Telegram",
  dashboard: "no painel",
  web: "no painel",
};

export type TimelineEntry = { at: string; label: string; detail?: string | null };

export type BriefingItemDetail = {
  id: string;
  title: string;
  action: string;
  origin_label: string;
  origin_detail: string | null;
  state_label: string;
  due_at: string | null;
  due_time: string | null;
  person_name: string | null;
  deal_label: string | null;
  timeline: TimelineEntry[];
};

/** Itens arquivados/cancelados/concluídos que estiveram no briefing recente. */
export async function listBriefingItemDetails(
  supabase: any,
  userId: string,
  limit = 20,
): Promise<BriefingItemDetail[]> {
  const { data: snap } = await supabase
    .from("daily_priorities")
    .select("subject_id, subject_type, action, due_at, calculated_at")
    .eq("user_id", userId)
    .eq("subject_type", "follow_up")
    .order("calculated_at", { ascending: false })
    .limit(80);

  const rows = ((snap as any[]) ?? []);
  const actionById = new Map<string, string>();
  const snapshotAt = new Map<string, string>();
  for (const r of rows) {
    if (!r.subject_id) continue;
    if (!actionById.has(r.subject_id)) actionById.set(r.subject_id, r.action);
    if (r.calculated_at && !snapshotAt.has(r.subject_id)) snapshotAt.set(r.subject_id, r.calculated_at);
  }
  const ids = [...actionById.keys()];
  if (!ids.length) return [];

  const { data: follows } = await supabase
    .from("follow_ups")
    .select(
      "id, title, type, status, outcome, outcome_notes, outcome_recorded_at, archived_at, due_date, due_time, created_at, updated_at, created_by_assessor, source_channel, briefing_sent_at, person_id, opportunity_id",
    )
    .eq("user_id", userId)
    .in("id", ids);

  const settled = ((follows as any[]) ?? []).filter((f) => followUpStateLabel(f) !== null);
  if (!settled.length) return [];

  const personIds = [...new Set(settled.map((f) => f.person_id).filter(Boolean))];
  const dealIds = [...new Set(settled.map((f) => f.opportunity_id).filter(Boolean))];
  const nameById = new Map<string, string>();
  const dealById = new Map<string, string>();
  if (personIds.length) {
    const { data: people } = await supabase.from("people").select("id, name").in("id", personIds);
    for (const p of ((people as any[]) ?? [])) nameById.set(p.id, p.name);
  }
  if (dealIds.length) {
    const { data: deals } = await supabase.from("opportunities").select("id, title, type").in("id", dealIds);
    for (const d of ((deals as any[]) ?? [])) {
      dealById.set(d.id, String(d.title ?? "").trim() || String(d.type ?? "").trim() || "Negócio");
    }
  }

  const { data: links } = await supabase
    .from("calendar_event_links")
    .select("follow_up_id, provider, deleted, created_at, last_synced_at, last_origin, external_updated_at")
    .eq("user_id", userId)
    .in("follow_up_id", settled.map((f) => f.id));
  const linkByFollowUp = new Map<string, any>();
  for (const l of ((links as any[]) ?? [])) linkByFollowUp.set(l.follow_up_id, l);

  const out = settled.map((f) => {
    const link = linkByFollowUp.get(f.id);
    const isEvent = EVENT_TYPES.has(norm(f.type));
    const provider = link && !link.deleted ? String(link.provider ?? "") : link ? String(link.provider ?? "") : "";
    const originLabel = link
      ? `Evento do ${PROVIDER_LABEL[provider] ?? "calendário ligado"}`
      : isEvent
        ? "Compromisso no Afonso"
        : "Tarefa de seguimento";
    const originDetail = link
      ? link.deleted
        ? "Já não existe no calendário ligado."
        : "Sincronizado com o calendário ligado."
      : f.created_by_assessor
        ? `Criado pelo Afonso ${CHANNEL_LABEL[norm(f.source_channel)] ?? "a partir de uma conversa"}.`
        : "Criado por ti no painel.";

    const timeline: TimelineEntry[] = [];
    if (f.created_at) {
      timeline.push({
        at: f.created_at,
        label: f.created_by_assessor ? "Criado pelo Afonso" : "Criado por ti",
        detail: CHANNEL_LABEL[norm(f.source_channel)] ?? null,
      });
    }
    if (link?.created_at) {
      timeline.push({
        at: link.created_at,
        label: `Ligado ao ${PROVIDER_LABEL[provider] ?? "calendário"}`,
        detail: null,
      });
    }
    if (link?.last_synced_at) {
      timeline.push({
        at: link.last_synced_at,
        label: link.deleted ? "Removido do calendário" : "Última sincronização com o calendário",
        detail: link.last_origin ? `origem: ${link.last_origin}` : null,
      });
    }
    if (f.briefing_sent_at) {
      timeline.push({ at: f.briefing_sent_at, label: "Cartela de briefing enviada", detail: null });
    }
    if (snapshotAt.get(f.id)) {
      timeline.push({ at: snapshotAt.get(f.id)!, label: "Entrou no briefing como prioridade", detail: null });
    }
    if (f.outcome_recorded_at) {
      timeline.push({
        at: f.outcome_recorded_at,
        label: `Resultado registado: ${f.outcome}`,
        detail: f.outcome_notes ?? null,
      });
    }
    if (f.archived_at) timeline.push({ at: f.archived_at, label: "Arquivado", detail: null });
    if (f.updated_at) timeline.push({ at: f.updated_at, label: "Última alteração", detail: null });

    timeline.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    return {
      id: f.id as string,
      title: f.title as string,
      action: actionById.get(f.id) ?? (f.title as string),
      origin_label: originLabel,
      origin_detail: originDetail,
      state_label: followUpStateLabel(f) ?? "Fechado",
      due_at: (f.due_date ?? null) as string | null,
      due_time: f.due_time ? String(f.due_time).slice(0, 5) : null,
      person_name: f.person_id ? nameById.get(f.person_id) ?? null : null,
      deal_label: f.opportunity_id ? dealById.get(f.opportunity_id) ?? null : null,
      timeline,
    };
  });

  out.sort((a, b) => {
    const la = a.timeline.at(-1)?.at ?? "";
    const lb = b.timeline.at(-1)?.at ?? "";
    return lb.localeCompare(la);
  });
  return out.slice(0, limit);
}
