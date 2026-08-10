// Canal admin → consultor (Fase 1: uma pergunta, uma resposta).
// Módulo puro: janelas de tempo e estados. Sem I/O, testável isoladamente.

/** Quanto tempo a pergunta fica à espera da resposta do consultor. */
export const ADMIN_MESSAGE_WINDOW_HOURS = 48;

/** Janela de sessão da Meta: fora dela só passa template aprovado. */
export const WHATSAPP_SESSION_WINDOW_HOURS = 24;

export type AdminMessageState = "pendente" | "respondida" | "expirada";

export interface AdminMessageRow {
  id: string;
  consultor_id: string;
  admin_id: string;
  pergunta: string;
  enviado_em: string;
  resposta: string | null;
  respondido_em: string | null;
  estado: string;
  janela_expira_em: string;
  resposta_lida_em: string | null;
}

export function windowExpiryFrom(sentAt: Date, hours = ADMIN_MESSAGE_WINDOW_HOURS): string {
  return new Date(sentAt.getTime() + hours * 3_600_000).toISOString();
}

/** A sessão de 24h da Meta está aberta? `null` = nunca escreveu → fechada. */
export function isSessionOpen(hoursSinceLastInbound: number | null): boolean {
  return hoursSinceLastInbound !== null && hoursSinceLastInbound < WHATSAPP_SESSION_WINDOW_HOURS;
}

export const OUT_OF_WINDOW_WARNING =
  "Fora de janela de conversa — esta mensagem pode não ser entregue sem template aprovado.";

/** Estado real de uma linha, já a contar com a passagem do tempo. */
export function effectiveState(row: AdminMessageRow, now: Date = new Date()): AdminMessageState {
  if (row.respondido_em || row.estado === "respondida") return "respondida";
  if (Date.parse(row.janela_expira_em) <= now.getTime()) return "expirada";
  return "pendente";
}

/**
 * Pergunta que a próxima mensagem deste consultor deve responder: a mais
 * recente ainda pendente e dentro da janela. Perguntas de outros consultores
 * nunca entram — o filtro é sempre por `consultor_id`.
 */
export function pickPendingForConsultant(
  rows: AdminMessageRow[],
  consultorId: string,
  now: Date = new Date(),
): AdminMessageRow | null {
  const open = rows
    .filter((r) => r.consultor_id === consultorId && effectiveState(r, now) === "pendente")
    .sort((a, b) => Date.parse(b.enviado_em) - Date.parse(a.enviado_em));
  return open[0] ?? null;
}

/** Texto que sai para o consultor quando a resposta fica registada. */
export const ADMIN_REPLY_ACK = "Recebido — a tua resposta foi registada.";

/** Como a pergunta aparece no WhatsApp do consultor. */
export function formatAdminQuestion(pergunta: string): string {
  return `Pergunta da equipa do Afonso:\n\n${pergunta.trim()}\n\nResponde aqui nesta conversa.`;
}