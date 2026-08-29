// Leitura/escrita do perfil "por gotas" e da pergunta de perfil em aberto.
// A decisão vive em ./profile-drip.ts (puro).

import {
  PAUSE_DAYS,
  PROFILE_QUESTION_INTENT,
  PROFILE_QUESTION_TTL_MS,
  REFUSALS_BEFORE_PAUSE,
  type AskedEntry,
  type ProfileDripState,
  type ProfileQuestionKey,
} from "./profile-drip";

/** Consultor já a usar o Afonso há mais de uma semana → recebe o aviso. */
const EXISTING_AFTER_MS = 7 * 864e5;

const EMPTY: ProfileDripState = {
  workArea: null,
  teamContext: null,
  asked: [],
  lastQuestionAt: null,
  refusalStreak: 0,
  pausedUntil: null,
  noticeSentAt: null,
  isExistingConsultant: false,
};

export async function loadProfileDripState(
  supabase: any,
  userId: string,
): Promise<ProfileDripState> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select(
        "work_area, team_context, profile_questions_asked, profile_last_question_at, profile_refusal_streak, profile_paused_until, profile_notice_sent_at, created_at",
      )
      .eq("id", userId)
      .maybeSingle();
    const row = (data ?? {}) as any;
    const asked = Array.isArray(row.profile_questions_asked)
      ? (row.profile_questions_asked as AskedEntry[])
      : [];
    const createdAt = row.created_at ? new Date(row.created_at).getTime() : Date.now();
    return {
      workArea: row.work_area ?? null,
      teamContext: row.team_context ?? null,
      asked,
      lastQuestionAt: row.profile_last_question_at ?? null,
      refusalStreak: Number(row.profile_refusal_streak ?? 0),
      pausedUntil: row.profile_paused_until ?? null,
      noticeSentAt: row.profile_notice_sent_at ?? null,
      isExistingConsultant: Number.isFinite(createdAt)
        ? Date.now() - createdAt > EXISTING_AFTER_MS
        : false,
    };
  } catch {
    return { ...EMPTY };
  }
}

export async function markProfileQuestionAsked(
  supabase: any,
  userId: string,
  state: ProfileDripState,
  key: ProfileQuestionKey,
  withNotice: boolean,
): Promise<void> {
  const now = new Date().toISOString();
  const asked = [...state.asked, { key, at: now }];
  const patch: Record<string, unknown> = {
    profile_questions_asked: asked,
    profile_last_question_at: now,
  };
  if (withNotice) patch.profile_notice_sent_at = now;
  try {
    await supabase.from("profiles").update(patch as never).eq("id", userId);
  } catch { /* noop */ }
}

export async function saveProfileAnswer(
  supabase: any,
  userId: string,
  key: ProfileQuestionKey,
  value: string,
): Promise<void> {
  const patch: Record<string, unknown> = {
    profile_refusal_streak: 0,
    profile_paused_until: null,
  };
  patch[key === "work_area" ? "work_area" : "team_context"] = value;
  try {
    await supabase.from("profiles").update(patch as never).eq("id", userId);
  } catch { /* noop */ }
}

/** Recusa: duas seguidas param as gotas durante uma semana. */
export async function registerProfileRefusal(
  supabase: any,
  userId: string,
  state: ProfileDripState,
): Promise<void> {
  const streak = (state.refusalStreak ?? 0) + 1;
  const patch: Record<string, unknown> = { profile_refusal_streak: streak };
  if (streak >= REFUSALS_BEFORE_PAUSE) {
    patch.profile_paused_until = new Date(Date.now() + PAUSE_DAYS * 864e5).toISOString();
    patch.profile_refusal_streak = 0;
  }
  try {
    await supabase.from("profiles").update(patch as never).eq("id", userId);
  } catch { /* noop */ }
}

/** Âncora da pergunta de perfil: pendente próprio, validade de 24h. */
export async function recordProfileQuestion(
  supabase: any,
  args: { userId: string; channel: string; key: ProfileQuestionKey; question: string; sourceMessageId?: string | null },
): Promise<void> {
  try {
    await supabase.from("pending_actions").insert({
      user_id: args.userId,
      channel: args.channel,
      intent: PROFILE_QUESTION_INTENT,
      original_content: args.question,
      structured_payload: { key: args.key, question: args.question } as never,
      missing_fields: [],
      status: "collecting_information",
      confidence: null,
      pending_question: args.question,
      current_question: args.question,
      source_message_id: args.sourceMessageId ?? null,
      expires_at: new Date(Date.now() + PROFILE_QUESTION_TTL_MS).toISOString(),
    } as never);
  } catch { /* noop */ }
}

export async function findProfileQuestion(
  supabase: any,
  args: { userId: string; channel: string },
): Promise<{ id: string; key: ProfileQuestionKey; pendingValue: string | null } | null> {
  try {
    const { data } = await supabase
      .from("pending_actions")
      .select("id, structured_payload, expires_at")
      .eq("user_id", args.userId)
      .eq("channel", args.channel)
      .eq("intent", PROFILE_QUESTION_INTENT)
      .eq("status", "collecting_information")
      .order("created_at", { ascending: false })
      .limit(1);
    const row = ((data as any[]) ?? [])[0];
    if (!row) return null;
    const exp = row.expires_at ? new Date(row.expires_at).getTime() : 0;
    if (!exp || exp < Date.now()) {
      await closeProfileQuestion(supabase, String(row.id), "expired");
      return null;
    }
    const key = (row.structured_payload ?? {}).key as ProfileQuestionKey | undefined;
    if (key !== "work_area" && key !== "team_context") return null;
    const pendingValue = ((row.structured_payload ?? {}).pending_value as string | undefined) ?? null;
    return { id: String(row.id), key, pendingValue };
  } catch {
    return null;
  }
}

/** Guarda o valor à espera de confirmação leve (primeira captura). */
export async function setProfileQuestionPendingValue(
  supabase: any,
  id: string,
  key: ProfileQuestionKey,
  question: string,
  value: string,
): Promise<void> {
  try {
    await supabase
      .from("pending_actions")
      .update({ structured_payload: { key, question, pending_value: value } } as never)
      .eq("id", id);
  } catch { /* noop */ }
}

export async function closeProfileQuestion(
  supabase: any,
  id: string,
  status: "executed" | "cancelled" | "expired" = "executed",
): Promise<void> {
  try {
    await supabase.from("pending_actions").update({ status } as never).eq("id", id);
  } catch { /* noop */ }
}

/**
 * Dia calmo: sem entrada nova no funil nem movimento recente (sinal baixo de
 * Crescimento/Produtividade). Falha fechada — na dúvida, não pergunta.
 */
export async function isCalmDay(supabase: any, userId: string): Promise<boolean> {
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  try {
    const [leads, seguimentos] = await Promise.all([
      supabase
        .from("prospecting_leads")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", since),
      supabase
        .from("follow_ups")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("updated_at", since),
    ]);
    const leadsSemana = Number(leads?.count ?? 0);
    const movimento = Number(seguimentos?.count ?? 0);
    return leadsSemana === 0 || movimento === 0;
  } catch {
    return false;
  }
}

/** Zona de atuação para enviesar pesquisas. `null` quando não há perfil. */
export async function loadWorkArea(supabase: any, userId: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("work_area")
      .eq("id", userId)
      .maybeSingle();
    return ((data as any)?.work_area as string | null) ?? null;
  } catch {
    return null;
  }
}
