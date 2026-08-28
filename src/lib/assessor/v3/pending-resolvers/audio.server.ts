// Ramos de pendente do Processador de Áudio Imobiliário.
//
// Três caminhos, extraídos linha a linha do motor v3 (comportamento idêntico):
//  1. ranhura "media" — a pergunta lateral "guardo o ficheiro ou descarto?";
//  2. `audio_breakdown` — proposta única com vários itens (factos/seguimentos/notas);
//  3. `audio_themes` — áudio separado em temas (pessoa + imóvel + oportunidade).
//
// Nada é escrito na base de dados antes do "sim" do consultor.

import { findActivePendingAction, markPendingActionStatus } from "../../memory.server";
import { isConfirmation as saIsConfirmation, isRejection as saIsRejection } from "../../culture/short-answers";
import { isDiscardCommand } from "../../culture/discard";
import {
  isDiscardAudioRequest,
  UNDO_KEEP_WINDOW_MS,
  UNDO_KEEP_TOO_LATE_REPLY,
} from "../audio-undo";
import type { PendingReply, PendingResolver } from "./types";

/**
 * Ranhura "media": só é resolvida quando não há outro assunto principal em
 * aberto, para um "não" nunca cair no rascunho errado.
 */
export async function resolveAudioMediaSlot(args: {
  supabase: any;
  userId: string;
  channel: string;
  trimmed: string;
}): Promise<PendingReply> {
  const { supabase, userId, channel, trimmed } = args;
  const mediaPending = await findActivePendingAction(supabase, userId, channel, "media");
  if (mediaPending && mediaPending.intent === "confirm_keep_audio") {
    const payload = (mediaPending.structured_payload ?? {}) as Record<string, any>;
    const fileId = payload.file_id ? String(payload.file_id) : null;
    const { discardAudioFile, keepAudioFile } = await import("../audio-keep.server");
    if (saIsConfirmation(trimmed)) {
      if (fileId) await keepAudioFile(supabase, fileId, userId);
      await markPendingActionStatus(supabase, mediaPending.id, "executed", {
        created_resource_type: "uploaded_file",
        created_resource_id: fileId,
      });
      return { reply: "Guardei o áudio no Drive Inteligente." };
    }
    if (saIsRejection(trimmed) || isDiscardCommand(trimmed)) {
      if (fileId) await discardAudioFile(supabase, fileId, userId);
      await markPendingActionStatus(supabase, mediaPending.id, "cancelled");
      // Descartar é descartar: sai o ficheiro E tudo o que dele saiu.
      const { discardLastInput } = await import("../discard.server");
      const { DISCARD_DONE_REPLY } = await import("../../culture/discard");
      await discardLastInput(supabase, userId, channel);
      return { reply: DISCARD_DONE_REPLY };
    }
  }

  // "Descarta" dito DEPOIS de já ter confirmado o guardar: ou desfazemos
  // mesmo, ou dizemos claramente que o ficheiro ficou guardado e como
  // removê-lo. Nunca "fica sem efeito" sem dizer que efeito.
  if (!mediaPending && isDiscardAudioRequest(trimmed)) {
    const { findRecentlyKeptAudio } = await import("../audio-keep.server");
    const { discardLastInput } = await import("../discard.server");
    const { DISCARD_DONE_REPLY } = await import("../../culture/discard");
    const kept = await findRecentlyKeptAudio(supabase, userId, channel, UNDO_KEEP_WINDOW_MS);
    if (kept) {
      await discardLastInput(supabase, userId, channel);
      return { reply: DISCARD_DONE_REPLY };
    }
    const older = await findRecentlyKeptAudio(supabase, userId, channel, 7 * 24 * 60 * 60 * 1000);
    if (older) return { reply: UNDO_KEEP_TOO_LATE_REPLY };
  }
  return null;
}

/** Processador de Áudio Imobiliário — proposta única com vários itens. */
export const audioBreakdownPending: PendingResolver = async ({ ctx, supabase, userId, channel, trimmed, pending }) => {
  if (!pending || pending.intent !== "audio_breakdown") return null;
  // (o caminho por temas está tratado em `audioThemesPending`)
  // A pergunta lateral do ficheiro só sai quando a proposta fecha, para
  // não competir com o "sim" que confirma os itens.
  const askAudioFile = async (reply: string): Promise<string> => {
    const payload = (pending.structured_payload ?? {}) as Record<string, any>;
    const fileId = payload.audio_file_id ? String(payload.audio_file_id) : null;
    if (!fileId) return reply;
    const { askKeepAudio } = await import("../audio-keep.server");
    const { appendKeepQuestion } = await import("../audio-keep");
    const question = await askKeepAudio(supabase, {
      userId,
      channel,
      fileId,
      transcript: String(pending.original_content ?? ""),
      subject: payload.subject ?? null,
    });
    return question ? appendKeepQuestion(reply, question) : reply;
  };
  // Dúvida de contacto levantada na proposta: resolve-se aqui, na mesma
  // conversa, antes de qualquer escrita.
  {
    const { coerceBreakdown, pendingPersonAmbiguities, formatPersonAmbiguityQuestion } =
      await import("../audio-breakdown");
    const current = coerceBreakdown(pending.structured_payload ?? {});
    const amb = pendingPersonAmbiguities(current);
    if (amb.length) {
      const { matchPersonChoice } = await import("@/lib/people/person-choice");
      let choice = matchPersonChoice(trimmed, amb[0]!.candidates as any);
      if (choice.kind === "unknown" && saIsConfirmation(trimmed) && amb[0]!.candidates.length === 1) {
        const only = amb[0]!.candidates[0]!;
        choice = { kind: "candidate", id: only.id, name: only.name };
      }
      if (choice.kind === "candidate" || choice.kind === "skip" || choice.kind === "none") {
        const links = (current.links ?? []).map((l, i) =>
          i === amb[0]!.index
            ? {
                person_id: choice.kind === "candidate" ? choice.id : null,
                candidates: choice.kind === "candidate" ? [] : [],
              }
            : l);
        const next = { ...current, links };
        const { updatePendingActionPayload } = await import("../../memory.server");
        await updatePendingActionPayload(
          supabase,
          pending.id,
          {
            ...(next as unknown as Record<string, any>),
            audio_file_id: (pending.structured_payload as any)?.audio_file_id ?? null,
          },
          { status: "pending_confirmation" },
        );
        const rest = pendingPersonAmbiguities(next);
        if (rest.length) return { reply: formatPersonAmbiguityQuestion(rest[0]!) };
        const head = choice.kind === "candidate"
          ? `Certo — o ponto ${amb[0]!.index + 1} fica ligado a ${choice.name}.`
          : `Certo — o ponto ${amb[0]!.index + 1} fica sem contacto associado.`;
        return { reply: `${head} Guardo tudo assim?` };
      }
    }
  }
  if (saIsConfirmation(trimmed)) {
    const { executeAudioBreakdown } = await import("../audio-breakdown.server");
    const reply = await executeAudioBreakdown(ctx, pending);
    return { reply: await askAudioFile(reply) };
  }
  if (saIsRejection(trimmed)) {
    await markPendingActionStatus(supabase, pending.id, "cancelled");
    return { reply: await askAudioFile("Está bem, não guardei nada do áudio.") };
  }
  // "Descartar": sai tudo — itens, transcrição e o próprio ficheiro.
  if (isDiscardCommand(trimmed)) {
    const { discardLastInput } = await import("../discard.server");
    const { DISCARD_DONE_REPLY } = await import("../../culture/discard");
    await markPendingActionStatus(supabase, pending.id, "cancelled");
    await discardLastInput(supabase, userId, channel);
    return { reply: DISCARD_DONE_REPLY };
  }
  // Correção a um item específico antes do "sim" — a proposta mantém-se
  // aberta e é reescrita já corrigida.
  {
    const { coerceBreakdown, formatBreakdownRevised } = await import("../audio-breakdown");
    const { parseBreakdownEdit, applyBreakdownEdit, describeBreakdownEdit } =
      await import("../audio-breakdown-edit");
    const { todayLisbonYmd } = await import("../audio-breakdown.server");
    const current = coerceBreakdown(pending.structured_payload ?? {});
    const edit = parseBreakdownEdit(
      trimmed,
      current.items.length,
      todayLisbonYmd(),
      current.items,
    );
    if (edit) {
      const removedItem = edit.remove ? current.items[edit.index] : undefined;
      const next = applyBreakdownEdit(current, edit);
      if (!next.items.length) {
        await markPendingActionStatus(supabase, pending.id, "cancelled");
        return {
          reply: await askAudioFile("Tirei o último ponto — já não fica nada por guardar deste áudio."),
        };
      }
      const { updatePendingActionPayload } = await import("../../memory.server");
      await updatePendingActionPayload(
        supabase,
        pending.id,
        {
          ...(next as unknown as Record<string, any>),
          audio_file_id: (pending.structured_payload as any)?.audio_file_id ?? null,
        },
        { status: "pending_confirmation" },
      );
      return { reply: formatBreakdownRevised(next, describeBreakdownEdit(edit, removedItem)) };
    }
  }
  return null;
};

/**
 * Áudio separado em TEMAS (lead = pessoa + imóvel + oportunidade ligados).
 * Nada é escrito antes do "sim", e uma ambiguidade de contacto pergunta-se
 * sempre em vez de se decidir sozinho.
 */
export const audioThemesPending: PendingResolver = async ({ ctx, supabase, userId, channel, trimmed, pending }) => {
  if (!pending || pending.intent !== "audio_themes") return null;
  const {
    formatThemesProposal, formatThemesRevised, pendingAmbiguities, formatAmbiguityQuestion,
    matchAmbiguityAnswer, parseThemeEdit, applyThemeEdit, describeThemeEdit,
  } = await import("../audio-themes");
  const { readThemesPayload, executeAudioThemes, todayLisbonYmd } =
    await import("../audio-themes.server");
  const { updatePendingActionPayload } = await import("../../memory.server");
  const payload = readThemesPayload(pending.structured_payload ?? {});
  const savePayload = async (themes: typeof payload.themes, links: typeof payload.links) => {
    await updatePendingActionPayload(
      supabase,
      pending.id,
      {
        ...(payload as unknown as Record<string, any>),
        themes: themes as unknown as any,
        links: links as unknown as any,
      },
      { status: "pending_confirmation" },
    );
  };

  // "Descartar": sai tudo — temas, transcrição e ficheiro.
  if (isDiscardCommand(trimmed)) {
    const { discardLastInput } = await import("../discard.server");
    const { DISCARD_DONE_REPLY } = await import("../../culture/discard");
    await markPendingActionStatus(supabase, pending.id, "cancelled");
    await discardLastInput(supabase, userId, channel);
    return { reply: DISCARD_DONE_REPLY };
  }

  // Resposta a uma desambiguação de contacto.
  const ambiguities = pendingAmbiguities(payload.themes, payload.links);
  if (ambiguities.length) {
    const chosen = matchAmbiguityAnswer(trimmed, ambiguities[0].candidates);
    if (chosen) {
      const links = payload.links.map((l, i) =>
        i === ambiguities[0].index
          ? { ...l, person_id: chosen.id, person_label: chosen.label, ambiguous_people: [] }
          : l);
      await savePayload(payload.themes, links);
      const rest = pendingAmbiguities(payload.themes, links);
      return {
        reply: rest.length
          ? formatAmbiguityQuestion(rest[0])
          : formatThemesRevised(payload.themes, links, `Certo, é o ${chosen.label}. Fica assim:`),
      };
    }
    if (saIsConfirmation(trimmed)) {
      return { reply: formatAmbiguityQuestion(ambiguities[0]) };
    }
  }

  if (saIsConfirmation(trimmed) && !ambiguities.length) {
    const reply = await executeAudioThemes(ctx, pending);
    return { reply };
  }
  if (saIsRejection(trimmed)) {
    await markPendingActionStatus(supabase, pending.id, "cancelled");
    return { reply: "Está bem, não guardei nada do áudio." };
  }

  // Correcção ou descarte de um tema, mantendo os restantes.
  const edit = parseThemeEdit(trimmed, payload.themes.length, todayLisbonYmd());
  if (edit) {
    const removed = edit.remove ? payload.themes[edit.index] : undefined;
    const next = applyThemeEdit(payload.themes, payload.links, edit);
    if (!next.themes.length) {
      await markPendingActionStatus(supabase, pending.id, "cancelled");
      return { reply: "Tirei o último ponto — já não fica nada por guardar deste áudio." };
    }
    await savePayload(next.themes, next.links);
    return { reply: formatThemesRevised(next.themes, next.links, describeThemeEdit(edit, removed)) };
  }
  if (!ambiguities.length && !trimmed) {
    return { reply: formatThemesProposal(payload.themes, payload.links) };
  }
  return null;
};

/** Ordem = precedência original no motor: breakdown → temas. */
export const AUDIO_PENDING_RESOLVERS: PendingResolver[] = [
  audioBreakdownPending,
  audioThemesPending,
];
