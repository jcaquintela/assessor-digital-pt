// Convenção de arquivado para o DRIVE: a fonte única de verdade é
// `uploaded_files.archived_at` (arquivado) e `uploaded_files.deleted_at`
// (reciclagem). Decisão de produto sobre a quota mensal: a quota mede o
// trabalho feito no mês e continua a contar ficheiros arquivados — arquivar
// organiza, não devolve quota. Só o que foi para a reciclagem (`deleted_at`)
// deixa de contar. Invariante verificada em teste:
//   quota do mês = ativos do mês + arquivados do mês

export interface DriveFileState {
  archived_at?: string | null;
  deleted_at?: string | null;
}

export const isFileDeleted = (f: DriveFileState) => !!f.deleted_at;
export const isFileArchived = (f: DriveFileState) => !f.deleted_at && !!f.archived_at;
export const isFileActive = (f: DriveFileState) => !f.deleted_at && !f.archived_at;
/** Critério único de contagem da quota mensal. */
export const countsForQuota = (f: DriveFileState) => !f.deleted_at;
