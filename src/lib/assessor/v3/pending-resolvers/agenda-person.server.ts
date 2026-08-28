// Ramos de pendente ligados a agenda e escolha de contacto.
//
// Extraídos linha a linha do motor v3 — comportamento idêntico, incluindo a
// ordem: escolha de contacto → rejeição de contacto → duplicado/reagendamento.

import { TOOL_REGISTRY } from "../../v2/domain.server";
import { isConfirmation as saIsConfirmation, isRejection as saIsRejection } from "../../culture/short-answers";
import { matchPersonChoice as pcMatchPersonChoice } from "@/lib/people/person-choice";
import { PendingRepo } from "./pending-repo.server";
import type { PendingResolver } from "./types";

/** "Não, é outra pessoa": recusa explícita do candidato proposto. */
export function personChoiceIsNone(
  text: string,
  pending: { structured_payload?: unknown } | null,
): boolean {
  const payload = ((pending?.structured_payload ?? {}) as Record<string, any>);
  const candidates = ((payload.suggestions ?? []) as any[]).filter((c) => c?.id);
  return pcMatchPersonChoice(text, candidates as any).kind === "none";
}

/**
 * confirm_event_person — o consultor escolheu o contacto (botão ou texto).
 * A associação é determinística e é sempre confirmada por palavras.
 */
export const confirmEventPersonPending: PendingResolver = async ({ ctx, supabase, trimmed, pending }) => {
  if (!pending || pending.intent !== "confirm_event_person") return null;
  const payload = (pending.structured_payload ?? {}) as Record<string, any>;
  const candidates = ((payload.suggestions ?? []) as any[]).filter((c) => c?.id);
  const toolName = String(payload.tool ?? "create_event");
  const exec = (TOOL_REGISTRY as any)[toolName];
  const incoming = payload.incoming ?? null;
  const what = toolName === "create_event" ? "compromisso" : "seguimento";
  const { matchPersonChoice, personLinkedFeedback } = await import("@/lib/people/person-choice");
  let choice = matchPersonChoice(trimmed, candidates as any);
  // "Sim" a uma proposta de candidato único vale como escolha dele.
  if (
    choice.kind === "unknown" &&
    saIsConfirmation(trimmed) &&
    candidates.length === 1 &&
    (payload.mode === "confirm_exact" || payload.mode === "confirm_partial")
  ) {
    choice = { kind: "candidate", id: String(candidates[0].id), name: String(candidates[0].name) };
  }
  if (exec && incoming && (choice.kind === "candidate" || choice.kind === "skip" || choice.kind === "new")) {
    let personId: string | null = null;
    let personName = "";
    if (choice.kind === "candidate") {
      personId = choice.id;
      personName = choice.name;
    } else if (choice.kind === "new") {
      const created = await TOOL_REGISTRY.create_person(ctx, {
        name: String(payload.personName ?? "").trim() || "Contacto novo",
      });
      personId = (created.data as any)?.person?.id ?? (created.data as any)?.id ?? null;
      personName = String(payload.personName ?? "").trim();
      if (!created.ok || !personId) {
        return { reply: "Tentei criar o contacto e não consegui. Podes dizer-me o nome outra vez?" };
      }
    }
    const result = await exec(
      { ...ctx, skipPersonResolution: true, skipDuplicateCheck: true },
      toolName === "update_property"
        ? { ...incoming, owner_person_id: personId }
        : { ...incoming, person_id: personId },
    );
    const createdId =
      (result.data as any)?.event?.id ?? (result.data as any)?.follow_up?.id ?? (result.data as any)?.id ?? null;
    await PendingRepo.markStatus(supabase, pending.id, result.ok ? "executed" : "failed", {
      created_resource_type: result.ok ? "follow_up" : null,
      created_resource_id: result.ok ? createdId : null,
      error_message: result.ok ? null : (result.error ?? "not_created"),
    });
    if (!result.ok) {
      return { reply: "Tentei guardar isso agora e não consegui. Queres que tente outra vez?" };
    }
    if (choice.kind === "skip") {
      return { reply: `Certo — ficou registado sem contacto associado. Deixei essa nota no ${what}.` };
    }
    return {
      reply:
        choice.kind === "new"
          ? `Criei o contacto ${personName} e ${personLinkedFeedback(personName, what).toLowerCase()}`
          : personLinkedFeedback(personName, what),
    };
  }
  return null;
};

/**
 * confirm_event_person (rejeição) — o "não" fecha o candidato para os turnos
 * seguintes: nunca voltamos a propô-lo sem nova pesquisa.
 */
export const rejectEventPersonPending: PendingResolver = async ({ supabase, userId, trimmed, pending }) => {
  if (!pending || pending.intent !== "confirm_event_person") return null;
  if (!(saIsRejection(trimmed) || personChoiceIsNone(trimmed, pending))) return null;
  const payload = (pending.structured_payload ?? {}) as Record<string, any>;
  const ids: string[] = [
    ...(payload.candidate_ids ?? []),
    ...((payload.suggestions ?? []) as any[]).map((s) => s?.id).filter(Boolean),
  ].filter((x, i, arr) => typeof x === "string" && arr.indexOf(x) === i);
  await PendingRepo.patchPayload(supabase, {
    pendingId: pending.id,
    userId,
    payload: { ...payload, rejected_person_ids: ids },
  });
  await PendingRepo.markStatus(supabase, pending.id, "cancelled", {
    error_message: "consultor rejeitou o contacto proposto",
  });
  return {
    reply: `Certo, não é ${String(payload.personName ?? "essa pessoa")}${
      ids.length ? " nem nenhum dos que te mostrei" : ""
    }. Diz-me quem é, ou queres que crie um contacto novo?`,
  };
};

/** confirm_event_reschedule — compromisso duplicado vs. reagendamento. */
export const confirmEventReschedulePending: PendingResolver = async ({ ctx, supabase, userId, channel, trimmed, pending }) => {
  if (!pending || pending.intent !== "confirm_event_reschedule") return null;
  const payload = (pending.structured_payload ?? {}) as Record<string, any>;
  const cand = payload.candidate ?? null;
  const incoming = payload.incoming ?? null;
  if (!(cand?.id && incoming?.date && incoming?.time)) return null;
  if (saIsConfirmation(trimmed)) {
    const { lisbonLocalToUtcIso, rescheduleReminder } = await import("../reminders.server");
    const dueIso = lisbonLocalToUtcIso(String(incoming.date), String(incoming.time));
    const { error: updErr } = await supabase
      .from("follow_ups")
      .update({
        due_date: dueIso,
        due_time: String(incoming.time),
        status: "agendado",
      } as never)
      .eq("id", cand.id)
      .eq("user_id", userId);
    if (updErr) {
      await PendingRepo.markStatus(supabase, pending.id, "failed", {
        error_message: `reschedule_update:${updErr.message}`,
      });
      return { reply: "Tentei mas não consegui guardar isso agora. Podes tentar outra vez?" };
    }
    try {
      await rescheduleReminder(supabase, {
        userId, channel,
        related_resource_type: "follow_up",
        related_resource_id: String(cand.id),
        new_date: String(incoming.date),
        new_time: String(incoming.time),
        timezone: "Europe/Lisbon",
      });
    } catch { /* noop */ }
    try {
      const { pushEventToProviders } = await import("@/lib/calendar/sync.server");
      await pushEventToProviders({ userId, followUpId: String(cand.id), action: "upsert" });
    } catch { /* noop */ }
    await PendingRepo.markStatus(supabase, pending.id, "executed", {
      created_resource_type: "follow_up",
      created_resource_id: String(cand.id),
    });
    return {
      reply: `Actualizei "${cand.title}" para as ${incoming.time}. Fica só um compromisso.`,
    };
  }
  if (saIsRejection(trimmed)) {
    const exec = TOOL_REGISTRY.create_event;
    const result = await exec({ ...ctx, skipDuplicateCheck: true }, incoming);
    await PendingRepo.markStatus(supabase, pending.id, result.ok ? "executed" : "failed", {
      created_resource_type: result.ok ? "follow_up" : null,
      created_resource_id: result.ok ? ((result.data as any)?.event?.id ?? null) : null,
      error_message: result.ok ? null : (result.error ?? "not_created"),
    });
    return {
      reply: result.ok
        ? `Certo — fica como compromisso separado, às ${incoming.time}.`
        : "Tentei mas não consegui guardar isso agora. Podes tentar outra vez?",
    };
  }
  return null;
};
