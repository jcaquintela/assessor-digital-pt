// FILA DE FICHEIROS PENDENTES DO DRIVE
//
// Quando o upload é bloqueado pela quota mensal, o ficheiro escolhido não se
// perde: fica nesta fila em memória (dura enquanto o separador estiver aberto,
// incluindo navegações dentro da app, como ir a /subscricao fazer upgrade).
// Assim que a quota volta a ter espaço, o Drive retoma-os sozinho.
//
// Só memória do separador — nada é guardado em disco nem na BD.

const queue: File[] = [];

/** Guarda um ficheiro bloqueado (ignora repetidos pelo nome+tamanho). */
export function queuePendingUpload(file: File): void {
  const already = queue.some((f) => f.name === file.name && f.size === file.size);
  if (!already) queue.push(file);
}

/** Ficheiros à espera, por ordem de chegada. */
export function pendingUploads(): File[] {
  return [...queue];
}

export function pendingUploadCount(): number {
  return queue.length;
}

/** Retira todos os pendentes (para os retomar). */
export function takePendingUploads(): File[] {
  return queue.splice(0, queue.length);
}

/** Esquece os pendentes, a pedido do consultor. */
export function clearPendingUploads(): void {
  queue.length = 0;
}
