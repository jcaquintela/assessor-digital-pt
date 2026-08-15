// O evento externo ainda existe no calendário do consultor?
//
// Quando o consultor apaga o evento directamente no Google/Outlook, o delta
// nem sempre chega até nós (no Outlook, os itens removidos do `calendarView`
// vêm por vezes com um id de ocorrência que não corresponde ao id que
// guardámos). Por isso confirmamos evento a evento: se o provider responde
// "não existe" ou "cancelado", o compromisso deixou de valer no Afonso.

/** A resposta do provider indica que o evento já não existe lá fora? */
export function isExternalEventMissing(
  status: number,
  body: unknown,
  text?: string | null,
): boolean {
  if (status === 404 || status === 410) return true;
  if (status === 400 && /ErrorItemNotFound|ErrorInvalidIdMalformed/i.test(String(text ?? ""))) return true;
  if (status < 200 || status >= 300) return false;
  const b = body as any;
  if (!b) return false;
  // Google marca eventos apagados com status "cancelled".
  if (typeof b.status === "string" && b.status.toLowerCase() === "cancelled") return true;
  // Outlook: reunião cancelada pelo organizador.
  if (b.isCancelled === true) return true;
  return false;
}
