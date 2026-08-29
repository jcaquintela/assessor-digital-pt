// Prazos de negócio — vocabulário e regras puras (cliente + servidor).
//
// Um prazo é uma data com consequência dentro de um negócio: "escritura dia
// 15", "prazo de financiamento até 20 de setembro". Não é um compromisso na
// agenda nem uma tarefa: é um marco que se aproxima e que, se passar, dói.
//
// Este módulo não fala com a base de dados — só define a escada de
// antecipação, a pontuação e o texto. Testável e reutilizável.

import { ymdDiffDays } from "@/lib/assessor/lisbon-day";

export const DEADLINE_STATUSES = ["aberto", "cumprido", "cancelado"] as const;
export type DeadlineStatus = (typeof DEADLINE_STATUSES)[number];

/** Antecedência por omissão: começa a avisar 7 dias antes. */
export const DEFAULT_NOTICE_DAYS = 7;

/** Degraus fixos de aviso: 7, 3, 1 e o próprio dia. */
export const NOTICE_LADDER = [7, 3, 1, 0] as const;

/**
 * Um prazo vencido sem qualquer ação do consultor não insiste para sempre:
 * ao fim destes dias fecha-se sozinho e cai em Diversos "Por tratar" — o
 * mesmo padrão já usado para os avisos de documentação esgotados.
 */
export const DEADLINE_AUTOCLOSE_DAYS = 7;

export interface DeadlineRow {
  id: string;
  opportunity_id: string;
  label: string;
  due_date: string; // YYYY-MM-DD
  status?: string | null;
  notes?: string | null;
  notice_days?: number | null;
  archived_at?: string | null;
}

export function isDeadlineOpen(row: Pick<DeadlineRow, "status" | "archived_at">): boolean {
  if (row.archived_at) return false;
  return String(row.status ?? "aberto") === "aberto";
}

export function noticeDaysOf(row: Pick<DeadlineRow, "notice_days">): number {
  const n = Number(row.notice_days ?? NaN);
  if (!Number.isFinite(n) || n < 0 || n > 180) return DEFAULT_NOTICE_DAYS;
  return Math.round(n);
}

/** Dias que faltam (negativo = já passou). Dias de calendário em Lisboa. */
export function daysUntilDeadline(dueYmd: string, todayYmd: string): number {
  return ymdDiffDays(dueYmd, todayYmd);
}

/**
 * O prazo entra na janela de aviso hoje?
 * Antes da data: só nos degraus da escada que cabem na antecedência pedida.
 * Depois da data: escalada diária, todos os dias, até fechar sozinho.
 */
export function isInNoticeWindow(daysLeft: number, noticeDays = DEFAULT_NOTICE_DAYS): boolean {
  if (daysLeft < 0) return true;
  if (daysLeft > noticeDays) return false;
  // Uma antecedência maior do que 7 dias acrescenta o próprio dia de arranque.
  if (noticeDays > NOTICE_LADDER[0]! && daysLeft === noticeDays) return true;
  return (NOTICE_LADDER as readonly number[]).includes(daysLeft);
}

/** Quanto mais perto (ou mais passado), mais alto. Passado > hoje > 3d > 7d. */
export function deadlineScore(daysLeft: number): number {
  if (daysLeft < 0) return Math.min(100, 88 + Math.min(12, Math.abs(daysLeft) * 2));
  if (daysLeft === 0) return 84;
  if (daysLeft <= 1) return 78;
  if (daysLeft <= 3) return 70;
  if (daysLeft <= 7) return 60;
  return 48;
}

/** "faltam 3 dias", "é hoje", "passou há 2 dias" — para o consultor ler. */
export function deadlineWhen(daysLeft: number): string {
  if (daysLeft < 0) {
    const n = Math.abs(daysLeft);
    return n === 1 ? "passou ontem" : `passou há ${n} dias`;
  }
  if (daysLeft === 0) return "é hoje";
  if (daysLeft === 1) return "é amanhã";
  return `faltam ${daysLeft} dias`;
}

export function deadlineAction(label: string): string {
  return `Prazo: ${String(label ?? "").trim() || "sem nome"}`;
}

export function deadlineDedupeKey(id: string, todayYmd: string): string {
  return `deal_deadline:${id}:${todayYmd.replaceAll("-", "")}`;
}

/** Já passou tempo suficiente sem ação para o prazo se fechar sozinho? */
export function isDeadlineStale(dueYmd: string, todayYmd: string): boolean {
  return daysUntilDeadline(dueYmd, todayYmd) <= -DEADLINE_AUTOCLOSE_DAYS;
}

const WORD_NUMBERS: Record<string, number> = {
  uma: 1, um: 1, dois: 2, duas: 2, tres: 3, "três": 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, quinze: 15,
};

/**
 * "avisa-me com duas semanas", "avisa com 10 dias de antecedência",
 * "com um mês de antecedência" → número de dias. `null` quando não há pedido.
 */
export function parseNoticeDays(raw: string): number | null {
  const t = String(raw ?? "").toLowerCase();
  if (!/\b(avisa|avise|avisar|antecedencia|antecedência|antes)\b/.test(t)) return null;
  const m = t.match(/\b(\d{1,3}|uma?|dois|duas|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|quinze)\s*(dias?|semanas?|m[êe]s(?:es)?)\b/);
  if (!m) return null;
  const n = /^\d+$/.test(m[1]!) ? Number(m[1]) : WORD_NUMBERS[m[1]!];
  if (!n || !Number.isFinite(n)) return null;
  const unit = m[2]!;
  const factor = unit.startsWith("semana") ? 7 : unit.startsWith("m") ? 30 : 1;
  const dias = n * factor;
  return dias >= 1 && dias <= 180 ? dias : null;
}
