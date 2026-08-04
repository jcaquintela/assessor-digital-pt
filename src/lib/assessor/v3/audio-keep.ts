// "Guardo ou descarto?" — regra generalizada para QUALQUER áudio processado.
//
// Antes: só um áudio que gerasse registo estruturado (pessoa, imóvel,
// seguimento) é que levava o consultor a decidir sobre o ficheiro; um áudio
// em que ele está só a pensar em voz alta ficava no Drive Inteligente sem
// ninguém perguntar nada. Passa a perguntar-se sempre uma vez.
//
// Excepção: áudios puramente sociais ("olá", "ok", "obrigado") não entram no
// Drive de todo e não geram pergunta.

import { isConfirmation, isGreeting, isRejection, isThanks } from "../culture/short-answers";

export const CONFIRM_KEEP_AUDIO_INTENT = "confirm_keep_audio";

/** Áudio sem conteúdo profissional: nem Drive, nem pergunta. */
export function isSocialAudio(transcript: string): boolean {
  const t = String(transcript ?? "").trim();
  if (t.length < 3) return true;
  if (isGreeting(t) || isThanks(t)) return true;
  if ((isConfirmation(t) || isRejection(t)) && t.length < 40) return true;
  if (t.length < 12 && !/\d/.test(t)) return true;
  return false;
}

/** Vale a pena perguntar "guardo ou descarto"? */
export function shouldAskKeepAudio(transcript: string): boolean {
  return !isSocialAudio(transcript);
}

/** Resumo curto do áudio para a pergunta ficar concreta. */
export function summariseAudio(transcript: string, subject?: string | null): string {
  const s = String(subject ?? "").trim();
  if (s) return s.length > 90 ? `${s.slice(0, 87)}…` : s;
  const flat = String(transcript ?? "").replace(/\s+/g, " ").trim();
  const first = flat.split(/(?<=[.!?…])\s/)[0] ?? flat;
  const base = first.length > 12 ? first : flat;
  return base.length > 90 ? `${base.slice(0, 87)}…` : base;
}

export function buildAudioKeepQuestion(summary: string): string {
  const resumo = summary ? ` (${summary})` : "";
  return `Já percebi o essencial deste áudio${resumo}. Guardo o ficheiro no Drive Inteligente, ou descarto?`;
}

/** Junta a pergunta à resposta do turno, sem a repetir. */
export function appendKeepQuestion(reply: string, question: string): string {
  const base = String(reply ?? "").trim();
  if (!base) return question;
  if (base.includes("Guardo o ficheiro no Drive Inteligente")) return base;
  return `${base}\n\n${question}`;
}
