// Deteção de conflitos de horário — módulo puro (sem BD, sem rede).
//
// Um conflito não é uma propriedade de um compromisso: é uma relação entre
// dois. Por isso não se calcula à nascença (como a categoria), mas sim sobre
// o conjunto de compromissos vivos de uma janela.
//
// Definição de colisão: qualquer sobreposição de intervalo.
//   A.inicio < B.fim  &&  B.inicio < A.fim
// Compromissos encostados (10h-11h e 11h-12h) NÃO colidem.

import { eventWindow } from "@/lib/assessor/supreme/event-window";

export interface ConflictCandidate {
  id: string;
  title: string;
  due_date?: unknown;
  due_time?: unknown;
  /** Duração real vinda do calendário externo (minutos). */
  duration_minutes?: unknown;
  /** Série recorrente de origem, quando existe — evita par master/ocorrência. */
  series_id?: string | null;
}

export interface ConflictWindow {
  id: string;
  title: string;
  startMs: number;
  endMs: number;
  series_id: string | null;
}

export interface ConflictPair {
  a: ConflictWindow;
  b: ConflictWindow;
  /** Início da sobreposição (o instante em que estão mesmo os dois). */
  overlapStartMs: number;
  overlapEndMs: number;
  /** Chave estável do par, independente da ordem. */
  pairKey: string;
}

/** Converte candidatos em janelas; descarta o que não tem hora marcada. */
export function toWindows(items: ConflictCandidate[]): ConflictWindow[] {
  const out: ConflictWindow[] = [];
  for (const item of items) {
    const { startIso, endIso } = eventWindow(item);
    if (!startIso || !endIso) continue; // dia inteiro / sem hora → não colide
    const startMs = new Date(startIso).getTime();
    const endMs = new Date(endIso).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    out.push({
      id: String(item.id),
      title: String(item.title ?? "").trim() || "Compromisso",
      startMs,
      endMs,
      series_id: item.series_id ? String(item.series_id) : null,
    });
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

function sameSeries(a: ConflictWindow, b: ConflictWindow): boolean {
  return Boolean(a.series_id && b.series_id && a.series_id === b.series_id);
}

/** Mesmo título e mesmo início: duplicado de importação, não é conflito real. */
function isDuplicate(a: ConflictWindow, b: ConflictWindow): boolean {
  return (
    a.startMs === b.startMs &&
    a.title.trim().toLowerCase() === b.title.trim().toLowerCase()
  );
}

export function pairKeyOf(idA: string, idB: string): string {
  return [idA, idB].sort().join("|");
}

/** Todos os pares em sobreposição, ordenados pelo mais próximo no tempo. */
export function findConflicts(items: ConflictCandidate[]): ConflictPair[] {
  const windows = toWindows(items);
  const pairs: ConflictPair[] = [];
  for (let i = 0; i < windows.length; i++) {
    for (let j = i + 1; j < windows.length; j++) {
      const a = windows[i]!;
      const b = windows[j]!;
      // Ordenados por início: assim que b começa depois do fim de a, os
      // seguintes também começam — não há mais colisões com a.
      if (b.startMs >= a.endMs) break;
      if (sameSeries(a, b) || isDuplicate(a, b)) continue;
      pairs.push({
        a,
        b,
        overlapStartMs: Math.max(a.startMs, b.startMs),
        overlapEndMs: Math.min(a.endMs, b.endMs),
        pairKey: pairKeyOf(a.id, b.id),
      });
    }
  }
  return pairs.sort((x, y) => x.overlapStartMs - y.overlapStartMs);
}
