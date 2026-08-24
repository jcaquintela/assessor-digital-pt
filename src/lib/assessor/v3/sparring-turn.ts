// Decisão pura de um turno em modo treino.
//
// O motor chama isto no ARRANQUE do turno, antes de qualquer atalho
// determinístico (agenda, Drive, conclusões) e antes do DECIDE/ACT. Se
// `handleAsSparring` for true, nenhuma ferramenta real corre nesse turno.

import {
  detectSparringContinue,
  detectSparringEnd,
  detectSparringStart,
  isSparringActive,
  isSparringPaused,
  isSparringStale,
  SPARRING_MAX_TURNS,
} from "./sparring";

export interface SparringTurn {
  /** Turno tratado como treino: ferramentas reais suprimidas. */
  handleAsSparring: boolean;
  startedNow: boolean;
  wasActive: boolean;
  wasPaused: boolean;
  resumed: boolean;
  ending: boolean;
  autoPause: boolean;
  /** Estado esquecido (inatividade): limpar antes de seguir como turno normal. */
  stale: boolean;
  turns: number;
}

const NONE: SparringTurn = {
  handleAsSparring: false, startedNow: false, wasActive: false, wasPaused: false,
  resumed: false, ending: false, autoPause: false, stale: false, turns: 0,
};

export function resolveSparringTurn(input: {
  state: unknown;
  text: string;
  now?: Date;
}): SparringTurn {
  const { state, text } = input;
  const now = input.now ?? new Date();
  const topicActive = isSparringActive(state);
  const topicPaused = isSparringPaused(state);
  const stale = (topicActive || topicPaused) && isSparringStale(state, now);

  const wasActive = topicActive && !stale;
  const wasPaused = topicPaused && !stale;
  const resumed = wasPaused && detectSparringContinue(text);
  const startedNow = !wasActive && (resumed || detectSparringStart(text));
  if (!wasActive && !startedNow) {
    return { ...NONE, wasPaused, stale };
  }

  const ending = wasActive && detectSparringEnd(text);
  const prevTurns = wasActive ? sparringTurnsOf(state) : 0;
  const turns = prevTurns + 1;
  const autoPause = !ending && turns >= SPARRING_MAX_TURNS;
  return {
    handleAsSparring: true,
    startedNow,
    wasActive,
    wasPaused,
    resumed,
    ending,
    autoPause,
    stale: false,
    turns,
  };
}

function sparringTurnsOf(state: unknown): number {
  const n = Number((state as { sparring_turns?: number } | null)?.sparring_turns ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
