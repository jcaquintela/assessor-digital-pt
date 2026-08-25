// Recorrência no Outlook Calendar.
//
// O Microsoft Graph devolve, para uma série recorrente, três tipos de item:
//   - `seriesMaster`: a definição da série (start = 1ª ocorrência)
//   - `occurrence`: cada instância expandida da série
//   - `exception`: uma instância alterada (hora/título diferentes)
// Se importarmos o master como evento independente, ele colide com a primeira
// ocorrência (mesmo título, mesma hora, ids diferentes) e a agenda mostra um
// par duplicado. O Google não sofre disto porque `singleEvents=true` já expande
// a série e nunca devolve o master.
//
// Regra: só o `seriesMaster` é ignorado. `occurrence` e `exception` entram
// normalmente — a exceção com o seu horário próprio.

export type OutlookRecurrenceType = "singleInstance" | "occurrence" | "exception" | "seriesMaster";

export function recurrenceType(item: any): OutlookRecurrenceType {
  const t = String(item?.type ?? "").trim();
  if (t === "seriesMaster" || t === "occurrence" || t === "exception") return t;
  return "singleInstance";
}

/** O master de uma série nunca é importado como compromisso. */
export function isSeriesMaster(item: any): boolean {
  return recurrenceType(item) === "seriesMaster";
}

/** Id da série a que a ocorrência/exceção pertence (null para eventos simples). */
export function seriesMasterId(item: any): string | null {
  const id = item?.seriesMasterId;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

/** Uma ocorrência (ou exceção) é a entidade estável no delta; o master não. */
export function isOccurrence(item: { recurrenceType?: OutlookRecurrenceType | null }): boolean {
  return item.recurrenceType === "occurrence" || item.recurrenceType === "exception";
}
