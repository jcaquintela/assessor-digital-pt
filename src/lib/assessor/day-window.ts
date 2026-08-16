/**
 * Janela do chat do painel: "o que se passou hoje".
 *
 * Decisão de produto: a conversa do painel mostra só o dia corrente no fuso do
 * consultor (Europe/Lisbon), coerente com o "Hoje" que é o conceito central do
 * produto — e não as N mensagens mais recentes de sempre.
 *
 * Piso de 12h: à 00:15 o dia local acabou de começar e a conversa ficaria vazia
 * mesmo que o consultor tenha estado a falar há minutos. Por isso a janela nunca
 * é mais curta do que 12h corridas.
 */
export const CONSULTANT_TZ = "Europe/Lisbon";
export const MIN_WINDOW_MS = 12 * 60 * 60 * 1000;

/** Início do dia local (no fuso indicado) para o instante dado, em ms epoch. */
export function startOfLocalDay(now: Date, timeZone = CONSULTANT_TZ): number {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = Object.fromEntries(fmt.formatToParts(now).map((x) => [x.type, x.value])) as Record<string, string>;
  const hh = Number(p.hour === "24" ? "0" : p.hour);
  const elapsed = hh * 3600_000 + Number(p.minute) * 60_000 + Number(p.second) * 1000 + now.getMilliseconds();
  return now.getTime() - elapsed;
}

/** Instante (ISO) a partir do qual a conversa do painel é carregada. */
export function dayWindowStartIso(now: Date = new Date(), timeZone = CONSULTANT_TZ): string {
  const start = Math.min(startOfLocalDay(now, timeZone), now.getTime() - MIN_WINDOW_MS);
  return new Date(start).toISOString();
}
