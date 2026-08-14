// Antecedência dos lembretes ("avisa-me 15 min antes").
//
// Regra: o valor por consultor manda; se não estiver definido, usa-se o valor
// global da plataforma; se também não existir, 0 minutos — ou seja, o
// comportamento actual (aviso à hora do compromisso) fica intacto.

export const DEFAULT_REMINDER_LEAD_MINUTES = 0;
export const MAX_REMINDER_LEAD_MINUTES = 240;

export function normalizeLeadMinutes(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = Math.floor(v);
  if (n < 0 || n > MAX_REMINDER_LEAD_MINUTES) return null;
  return n;
}

export function resolveLeadMinutes(
  userValue: unknown,
  globalValue: unknown,
): number {
  const u = normalizeLeadMinutes(userValue);
  if (u !== null) return u;
  const g = normalizeLeadMinutes(globalValue);
  if (g !== null) return g;
  return DEFAULT_REMINDER_LEAD_MINUTES;
}

/** Desloca um instante ISO para trás pela antecedência pedida. */
export function applyLead(isoUtc: string, leadMinutes: number): string {
  const t = new Date(isoUtc).getTime();
  if (!Number.isFinite(t) || leadMinutes <= 0) return isoUtc;
  return new Date(t - leadMinutes * 60_000).toISOString();
}
