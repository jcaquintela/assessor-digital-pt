// Provedor ativo por modalidade (calendário e email).
//
// Regra do produto (15/08): nunca há fan-out silencioso nem prioridade
// escondida. Com um só provedor ligado ele é o ativo; com dois ligados e
// sem escolha feita, o Afonso pergunta antes de ler ou escrever.
//
// Ficheiro puro e seguro para o browser — sem BD, sem chaves.

export type ActiveResolution<P extends string> =
  | { status: "none"; provider: null; options: P[] }
  | { status: "ok"; provider: P; options: P[] }
  | { status: "needs_choice"; provider: null; options: P[] };

export function resolveActiveProvider<P extends string>(
  connected: readonly P[],
  chosen: P | null | undefined,
): ActiveResolution<P> {
  const options = [...new Set(connected)];
  if (options.length === 0) return { status: "none", provider: null, options };
  if (options.length === 1) return { status: "ok", provider: options[0]!, options };
  if (chosen && options.includes(chosen)) return { status: "ok", provider: chosen, options };
  return { status: "needs_choice", provider: null, options };
}

export const CALENDAR_PROVIDER_CHOICE_REPLY =
  "Tens o Google Calendar e o Outlook ligados aos dois e ainda não me disseste em qual devo marcar. "
  + "Escolhe o calendário principal em Definições > Calendário e marco já.";

export const MAIL_PROVIDER_CHOICE_REPLY =
  "Tens o Gmail e o Outlook ligados aos dois e ainda não me disseste qual devo consultar. "
  + "Escolhe a caixa principal em Definições > Email e volto a olhar.";
