// Golden tests do modo treino — incidente de 24/08/2026.
//
// Uma fala em personagem ("permita-me mostrar o que posso fazer por si e pelo
// seu apartamento") disparou uma pesquisa real de imóveis porque o treino nunca
// ficou activo: a frase do próprio menu ("simulamos uma chamada a frio") não
// era reconhecida. Estes testes fixam o comportamento corrigido.

import { describe, expect, it } from "vitest";
import { makeFakeSupabase } from "@/lib/test-utils/fake-supabase";
import { resolveSparringTurn } from "./sparring-turn";
import { readSparringState, startSparring, stopSparring } from "./sparring-state.server";
import { detectSparringStart, SPARRING_TOPIC, SPARRING_IDLE_MS } from "./sparring";
import { detectReadRequest } from "./read-intent";
import { detectAgendaQuery } from "./deterministic.server";
import { SPARRING_START_TEXT } from "../sparring.functions";

const U = "user-1";
const C = "dashboard";
const activeState = { active_topic: SPARRING_TOPIC, sparring_turns: 1, updated_at: new Date().toISOString() };

describe("modo treino — entrada explícita", () => {
  it("1) escolher \"Treino de objeções\" liga o estado imediatamente", async () => {
    const sb = makeFakeSupabase({ conversation_states: [] });
    await startSparring(sb as never, U, C);
    const state = await readSparringState(sb as never, U, C);
    expect(state?.active_topic).toBe(SPARRING_TOPIC);
    // O turno seguinte já é tratado como treino, seja qual for o texto.
    expect(resolveSparringTurn({ state, text: SPARRING_START_TEXT }).handleAsSparring).toBe(true);
  });

  it("2) a frase exacta do incidente também é detectada por texto livre", () => {
    const msg = "Treino de objeções: simulamos uma chamada a frio para ganhares ritmo e testares abordagens.";
    expect(detectSparringStart(msg)).toBe(true);
    expect(resolveSparringTurn({ state: null, text: msg }).handleAsSparring).toBe(true);
  });

  it("3) fala em personagem não executa ferramenta real", () => {
    const msg = "Compreendo, permita-me sem qualquer compromisso poder mostra o que posso fazer por si e pelo seu apartamento";
    // Antes: era lido como pedido de leitura e disparava search_properties.
    expect(detectReadRequest(msg).pure).toBe(true);
    // Agora: o turno é tratado como treino antes de qualquer atalho.
    expect(resolveSparringTurn({ state: activeState, text: msg }).handleAsSparring).toBe(true);
  });

  it("4) atalhos deterministas (agenda e Drive) ficam suprimidos em treino", () => {
    // Agenda: atalho determinístico próprio (detectAgendaQuery).
    expect(detectAgendaQuery("mostra a agenda de hoje")).toBeTruthy();
    // Drive: atalho de leitura pura.
    expect(detectReadRequest("lista os documentos da drive").tool).toBe("search_files");
    for (const msg of ["mostra a agenda de hoje", "lista os documentos da drive"]) {
      expect(resolveSparringTurn({ state: activeState, text: msg }).handleAsSparring).toBe(true);
    }
  });

  it("5) comando explícito termina o treino e o turno seguinte já não está protegido", async () => {
    const fim = resolveSparringTurn({ state: activeState, text: "chega, terminar treino" });
    expect(fim.handleAsSparring).toBe(true);
    expect(fim.ending).toBe(true);

    const sb = makeFakeSupabase({ conversation_states: [] });
    await startSparring(sb as never, U, C);
    await stopSparring(sb as never, U, C);
    const state = await readSparringState(sb as never, U, C);
    expect(state?.active_topic).toBeNull();
    expect(resolveSparringTurn({ state, text: "marca visita amanhã às 10h" }).handleAsSparring).toBe(false);
  });

  it("não fica preso: treino esquecido expira por inatividade", () => {
    const old = {
      active_topic: SPARRING_TOPIC,
      sparring_turns: 2,
      updated_at: new Date(Date.now() - SPARRING_IDLE_MS - 1000).toISOString(),
    };
    const t = resolveSparringTurn({ state: old, text: "marca visita amanhã às 10h" });
    expect(t.handleAsSparring).toBe(false);
    expect(t.stale).toBe(true);
  });
});
