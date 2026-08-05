// Coalescência de rajadas de mensagens (parte pura).
//
// Caso real (05/08, 08:03-08:04): três mensagens em 15 segundos ("Limpa a
// minha agenda de hoje. Bom dia", "Estou em viagem para Lisboa", "Só volto
// 16:09") deram três ciclos de raciocínio independentes e duas perguntas
// quase idênticas sobre a mesma visita. O bloqueio serializa turnos, mas não
// os junta. Aqui juntamos: o último turno da rajada leva o texto todo, por
// ordem de chegada.

export const COALESCE_GAP_MS = 15_000;
export const COALESCE_MAX_MESSAGES = 5;
export const COALESCE_MAX_SPAN_MS = 60_000;
export const SETTLE_MS = 7_000;

export interface BurstRow {
  id: string;
  role: string;
  content: string | null;
  created_at: string;
  message_type?: string | null;
}

export function isTextTurn(row: BurstRow): boolean {
  const t = String(row.message_type ?? "text");
  return t === "text" || /_text$/.test(t);
}

/**
 * A partir do histórico recente (qualquer ordem) devolve as mensagens do
 * consultor que formam a mesma rajada da mensagem actual, por ordem de
 * chegada. Pára em qualquer resposta do assessor: o que já foi respondido não
 * volta a entrar.
 */
export function selectBurst(rows: BurstRow[], currentId: string): BurstRow[] {
  const asc = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const idx = asc.findIndex((r) => r.id === currentId);
  if (idx < 0) return [];
  const current = asc[idx]!;
  const burst: BurstRow[] = [current];
  for (let i = idx - 1; i >= 0; i--) {
    const row = asc[i]!;
    if (row.role !== "user") break;
    if (!isTextTurn(row)) break;
    const gap = Date.parse(burst[0]!.created_at) - Date.parse(row.created_at);
    if (!(gap >= 0 && gap <= COALESCE_GAP_MS)) break;
    const span = Date.parse(current.created_at) - Date.parse(row.created_at);
    if (span > COALESCE_MAX_SPAN_MS) break;
    if (burst.length >= COALESCE_MAX_MESSAGES) break;
    burst.unshift(row);
  }
  return burst;
}

export function mergeBurstContent(burst: BurstRow[], fallback: string): string {
  const parts = burst
    .map((r) => String(r.content ?? "").trim())
    .filter((s) => s.length > 0);
  if (!parts.length) return fallback;
  // Sem duplicados consecutivos (reenvios do mesmo texto).
  const dedup = parts.filter((p, i) => i === 0 || p !== parts[i - 1]);
  return dedup.join("\n");
}