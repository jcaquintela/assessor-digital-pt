// Modo treino (sparring) — turno completo, isolado do motor v3.
//
// Este módulo é o PRIMEIRO guard do turno: corre antes de qualquer atalho
// determinístico e antes do DECIDE/ACT. Em treino nada é escrito na base de
// dados e nada é arquivado. A fonte única do estado continua a ser
// `readSparringState` (sparring-state.server.ts) — aqui só se decide o turno.

import type { EngineOutcome } from "../engine.server";
import { decide } from "./decide.server";
import { sanitizeReply, NATURAL_FALLBACKS } from "../culture/sanitize";
import { sanitizeAssessorName, ASSESSOR_NAME_DEFAULT } from "../assessor-name";
import {
  SPARRING_CONTINUE_QUESTION,
  SPARRING_PAUSED_TOPIC,
  SPARRING_TOPIC,
} from "./sparring";
import { resolveSparringTurn, type SparringTurn } from "./sparring-turn";
import { readSparringState, setSparringTopic, stopSparring } from "./sparring-state.server";
import { logSparringSuppression } from "./sparring-audit.server";
import { logAiTurn } from "./telemetry-repo.server";
import { HISTORY_LIMIT, nowLisbonHuman, nowLisbonYmd, toHistoryPreview } from "./engine-shared";

/**
 * Turno em modo treino. Nenhuma ferramenta real corre aqui: só o DECIDE com o
 * bloco de sparring, para responder em personagem. Nada é arquivado nem
 * escrito na base de dados.
 */
export async function runSparringTurn(args: {
  supabase: any;
  userId: string;
  channel: string;
  trimmed: string;
  turn: SparringTurn;
}): Promise<EngineOutcome> {
  const { supabase, userId, channel, trimmed, turn } = args;
  const started = Date.now();
  const closing = turn.ending || turn.autoPause;

  await setSparringTopic(
    supabase as never,
    userId,
    channel,
    turn.ending ? null : turn.autoPause ? SPARRING_PAUSED_TOPIC : SPARRING_TOPIC,
    closing ? 0 : turn.turns,
  );

  // Auditoria: início e fim do treino ficam visíveis nas ações autónomas.
  if (turn.startedNow || closing) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const rows: any[] = [];
      if (turn.startedNow) {
        rows.push({
          admin_user_id: null, action: "sparring_started", target_user_id: userId,
          resource_type: "conversation", resource_id: channel,
          reason: "Modo treino (sparring) iniciado — escrita bloqueada.",
          metadata: { channel, resumed: turn.resumed, source: "reasoning-engine-v3" },
        });
      }
      if (closing) {
        rows.push({
          admin_user_id: null, action: "sparring_ended", target_user_id: userId,
          resource_type: "conversation", resource_id: channel,
          reason: turn.autoPause
            ? "Modo treino em pausa automática após várias trocas."
            : "Modo treino terminado pelo consultor.",
          metadata: { channel, turns: turn.turns, auto: turn.autoPause, source: "reasoning-engine-v3" },
        });
      }
      await supabaseAdmin.from("admin_audit_logs").insert(rows as never);
    } catch { /* noop */ }
  }

  const [{ data: prof }, { data: recentRows }] = await Promise.all([
    supabase.from("profiles").select("name, assessor_name").eq("id", userId).maybeSingle(),
    supabase
      .from("assessor_messages")
      .select("role, content, created_at, id")
      .eq("user_id", userId).eq("channel", channel)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
  ]);

  const decideR = await decide({
    content: trimmed,
    observations: [],
    hypotheses: [],
    searches: {},
    historyPreview: toHistoryPreview((recentRows as any[]) ?? []),
    assessorName:
      sanitizeAssessorName((prof as any)?.assessor_name ?? "") || ASSESSOR_NAME_DEFAULT,
    userFirstName: String((prof as any)?.name ?? "").split(/\s+/)[0] || "",
    nowLisbonYmd: nowLisbonYmd(),
    nowLisbonHuman: nowLisbonHuman(),
    sparring: true,
  });

  // Guard duro: mesmo que o modelo devolva ferramentas ou memórias, morrem aqui.
  // Fica registo do que foi bloqueado, com a mensagem original do consultor.
  await logSparringSuppression({
    userId, channel, message: trimmed,
    toolCalls: decideR.decision.tool_calls,
    memoryWrites: decideR.decision.memory_writes?.length ?? 0,
    action: decideR.decision.action,
    reason: turn.ending
      ? "sparring_ending"
      : turn.autoPause
        ? "sparring_paused"
        : turn.startedNow
          ? "sparring_starting"
          : "sparring_active",
    turns: turn.turns, route: "v3-sparring",
  });
  decideR.decision.tool_calls = [];
  decideR.decision.memory_writes = [];

  let reply = sanitizeReply(decideR.decision.natural_reply);
  if (!reply) reply = NATURAL_FALLBACKS.aiDown;
  if (turn.autoPause && !reply.includes("continuar o treino")) {
    reply = `${reply}\n\n${SPARRING_CONTINUE_QUESTION}`.trim();
  }

  await logAiTurn(supabase, {
    userId, channel, intent: "sparring_turn", route: "v3-sparring",
    inputTokens: decideR.usage?.inputTokens ?? 0,
    outputTokens: decideR.usage?.outputTokens ?? 0,
    latencyMs: Date.now() - started, success: decideR.ok,
    error: decideR.error ?? null, fallbackUsed: !decideR.ok,
  });

  return { reply };
}

/**
 * Guard de arranque do turno: devolve a resposta de treino quando o turno é
 * de treino, ou `null` para o motor seguir o caminho normal. Um estado de
 * treino esquecido (ou uma pausa não retomada) é limpo aqui — nunca fica preso.
 */
export async function runSparringGuard(args: {
  supabase: any;
  userId: string;
  channel: string;
  trimmed: string;
}): Promise<EngineOutcome | null> {
  const { supabase, userId, channel, trimmed } = args;
  const state = await readSparringState(supabase as never, userId, channel);
  const turn = resolveSparringTurn({ state, text: trimmed });
  if (turn.handleAsSparring) {
    return await runSparringTurn({ supabase, userId, channel, trimmed, turn });
  }
  if (turn.stale || (turn.wasPaused && !turn.resumed)) {
    try { await stopSparring(supabase as never, userId, channel); } catch { /* noop */ }
  }
  return null;
}
