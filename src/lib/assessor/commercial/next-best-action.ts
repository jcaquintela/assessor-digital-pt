// Próxima melhor ação (pura): uma só, concreta, com porquê, responsável e
// prazo. Quando o negócio é inviável, a recomendação pode ser PARAR.

export interface NextAction {
  action: string;
  why: string;
  owner: string;
  /** dd/mm */
  due: string;
  /** Recomendação explícita de parar, com a condição. */
  stop?: string | null;
}

export const ddmmLisbon = (d: Date) =>
  new Intl.DateTimeFormat("pt-PT", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit" }).format(d);
export const ymdLisbon = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
export const plusDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400_000);

export function formatNextAction(n: NextAction): string {
  const lines = [`*Próximo passo:* ${n.action}. Porquê: ${n.why}. Responsável: ${n.owner}. Prazo: ${n.due}.`];
  if (n.stop) lines.push(`*Se não fechar:* ${n.stop}`);
  return lines.join("\n");
}
