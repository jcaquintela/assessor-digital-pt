// "Descarta" dito DEPOIS de já ter guardado o áudio.
//
// Caso real: o consultor confirmou "Sim" (guardar) e logo a seguir escreveu
// "Descarta". A resposta era vaga ("fica sem efeito") sem dizer se o ficheiro
// ficou ou não no Drive Inteligente. Passa a haver duas respostas explícitas:
// desfaço mesmo (janela curta), ou digo claramente que já está guardado e
// como remover. Módulo puro, sem I/O.

/** Janela em que ainda tratamos o "descarta" como desfazer do guardar. */
export const UNDO_KEEP_WINDOW_MS = 30 * 60 * 1000;

const DISCARD_RE =
  /\b(descarta(?:r|s)?|descartado|deita fora|nao guardes|n[aã]o guardes|apaga(?:r)? (?:o )?(?:audio|áudio|ficheiro|gravacao|gravação)|elimina(?:r)? (?:o )?(?:audio|áudio|ficheiro))\b/;

function norm(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** O consultor está a pedir para descartar o ficheiro do áudio? */
export function isDiscardAudioRequest(raw: string): boolean {
  const t = norm(raw);
  if (!t || t.length > 120) return false;
  return DISCARD_RE.test(t);
}

export const UNDO_KEEP_DONE_REPLY =
  "Removi o ficheiro que tinha acabado de guardar. O que percebi do áudio fica guardado.";

export const UNDO_KEEP_TOO_LATE_REPLY =
  "Já está guardado no Drive Inteligente — para o removeres, abre o ficheiro em Drive Inteligente e escolhe Eliminar (fica 24h na reciclagem).";
