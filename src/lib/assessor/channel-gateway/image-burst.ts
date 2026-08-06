// Coalescência de rajadas de IMAGENS (parte pura).
//
// Caso real (06/08): o consultor fotografou 30 páginas (Caderneta Predial +
// Certidão Energética de um T3 em Gaia). Cada foto gerou o seu próprio ciclo
// e a sua própria pergunta — ~30 vezes "Recebi a imagem. A que se refere?".
// Uma rajada de fotos é UM assunto: processa-se tudo, responde-se uma vez.
//
// Ao contrário do texto, a janela é longa: 500-750 KB por foto em rede móvel
// demora, e o intervalo entre fotos pode passar bem dos 15s do texto.

export const IMAGE_BURST_GAP_MS = 60_000;
/** Espera máxima, dentro do turno, à espera da foto seguinte. */
export const IMAGE_BURST_SETTLE_MS = 20_000;
export const IMAGE_BURST_POLL_MS = 2_000;
/** Tecto de fotos numa mesma rajada — acima disto respondemos à mesma. */
export const IMAGE_BURST_MAX = 60;
/** Tentativas de entrega de UMA resposta, qualquer que seja a causa da falha. */
export const MAX_REPLY_ATTEMPTS = 3;
export const REPLY_RETRY_BASE_MS = 600;

export interface ImageBurstRow {
  id: string;
  role: string;
  created_at: string;
  message_type?: string | null;
}

export function isImageTurn(row: ImageBurstRow): boolean {
  return /_image$/.test(String(row.message_type ?? ""));
}

/**
 * Fotos do consultor que formam a mesma rajada da foto actual, por ordem de
 * chegada. Pára em qualquer resposta do assessor: o que já foi respondido não
 * volta a contar.
 */
export function selectImageBurst(rows: ImageBurstRow[], currentId: string): ImageBurstRow[] {
  const asc = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const idx = asc.findIndex((r) => r.id === currentId);
  if (idx < 0) return [];
  const current = asc[idx]!;
  const burst: ImageBurstRow[] = [current];
  for (let i = idx - 1; i >= 0; i--) {
    const row = asc[i]!;
    if (row.role !== "user") break;
    if (!isImageTurn(row)) break;
    const gap = Date.parse(burst[0]!.created_at) - Date.parse(row.created_at);
    if (!(gap >= 0 && gap <= IMAGE_BURST_GAP_MS)) break;
    if (burst.length >= IMAGE_BURST_MAX) break;
    burst.unshift(row);
  }
  return burst;
}

/** Chegou foto mais recente dentro da janela? Então esta cala-se. */
export function hasNewerImage(
  rows: ImageBurstRow[],
  current: { id: string; created_at: string },
): boolean {
  return rows.some(
    (r) =>
      r.id !== current.id &&
      r.role === "user" &&
      isImageTurn(r) &&
      r.created_at > current.created_at &&
      Date.parse(r.created_at) - Date.parse(current.created_at) <= IMAGE_BURST_GAP_MS,
  );
}

function listaPt(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} e ${items.at(-1)}`;
}

/**
 * Uma frase para a rajada inteira. Nunca uma por imagem.
 * Ex.: "Recebi 30 imagens — parecem ser páginas de 2 documentos (Caderneta
 * Predial e Certidão Energética) do T3 em Gaia. Confirmas?"
 */
export function summariseImageBurst(input: {
  count: number;
  docTypes?: string[];
  linkedLabel?: string | null;
}): string {
  const count = Math.max(1, input.count);
  const tipos = [...new Set((input.docTypes ?? []).map((t) => t.trim()).filter(Boolean))];
  const onde = input.linkedLabel?.trim() ? ` do ${input.linkedLabel.trim()}` : "";

  const cabeca = `Recebi ${count} imagens`;
  if (!tipos.length) {
    return `${cabeca}${onde ? ` —${onde.replace(" do ", " sobre o ")}` : ""}. A que se referem?`;
  }
  const corpo =
    tipos.length === 1
      ? `parecem ser páginas de ${tipos[0]}${onde}`
      : `parecem ser páginas de ${tipos.length} documentos (${listaPt(tipos)})${onde}`;
  return `${cabeca} — ${corpo}. Confirmas?`;
}
