// Deduplicação de eventos importados do calendário externo (Google/Outlook).
//
// Problema observado: a mesma reunião do Outlook chegou duas vezes e ficou com
// dois compromissos no Afonso (mesmo título, mesma hora), a aparecer como
// "sobreposição" na agenda. Acontece quando o delta reenvia o evento antes de
// a ligação anterior estar registada, ou quando o mesmo evento externo é
// importado por duas rondas em simultâneo.
//
// Módulo puro: só decide quem sobrevive e quem é arquivado. A escrita fica em
// sync.server.ts.

export interface ImportedRow {
  id: string;
  title: string | null;
  due_date: string | null;
  external_reference: string | null;
  created_at: string | null;
  has_link?: boolean;
  /** Ocorrência/excepção de uma série recorrente (Outlook). */
  is_occurrence?: boolean;
}

/** Título normalizado: sem acentos, sem espaços a mais, minúsculas. */
export function normalizeTitle(title: string | null | undefined): string {
  return String(title ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Chave de duplicado: título normalizado + instante ao minuto. */
export function dupeKey(row: Pick<ImportedRow, "title" | "due_date">): string | null {
  const t = normalizeTitle(row.title);
  if (!t || !row.due_date) return null;
  const d = new Date(row.due_date);
  if (Number.isNaN(d.getTime())) return null;
  const minute = Math.floor(d.getTime() / 60_000);
  return `${t}|${minute}`;
}

/**
 * Sobrevivente do grupo: primeiro o que tem ligação ao calendário, depois o
 * mais antigo (o original), por fim o id mais baixo para ser determinístico.
 */
export function chooseSurvivor<T extends ImportedRow>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) => {
    const link = Number(!!b.has_link) - Number(!!a.has_link);
    if (link !== 0) return link;
    const ta = a.created_at ? new Date(a.created_at).getTime() : Number.MAX_SAFE_INTEGER;
    const tb = b.created_at ? new Date(b.created_at).getTime() : Number.MAX_SAFE_INTEGER;
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  })[0]!;
}

export interface DedupePlan<T extends ImportedRow> {
  survivor: T;
  duplicates: T[];
}

/** Agrupa por chave e devolve, para cada grupo com 2+, quem fica e quem sai. */
export function planDedupe<T extends ImportedRow>(rows: T[]): DedupePlan<T>[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = dupeKey(row);
    if (!key) continue;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  const plans: DedupePlan<T>[] = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const survivor = chooseSurvivor(list)!;
    plans.push({ survivor, duplicates: list.filter((r) => r.id !== survivor.id) });
  }
  return plans;
}
