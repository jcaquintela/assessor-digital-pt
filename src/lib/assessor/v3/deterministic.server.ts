// Router determinístico — actua ANTES da IA para dois casos de segurança:
//
// 1) Consulta de agenda por referência temporal ("O que tenho hoje?",
//    "E hoje?", "Como está a minha agenda?"). O motor não precisa da IA:
//    reconhece o padrão, chama search_agenda e devolve dados reais.
//
// 2) Confirmação curta ("sim", "ok", "claro") sem contexto pendente.
//    Sem `pending_action` válida não há nada para confirmar. Devolvemos
//    um pedido natural de contexto e não chamamos qualquer tool.
//
// Este módulo é puro (sem I/O). O caller resolve I/O (search_agenda,
// pending_actions) e formata a resposta.

export type AgendaPeriod = "today" | "tomorrow" | "week";

// Palavras que denotam agenda mesmo sem período explícito.
const AGENDA_WORD_RE = /\b(agenda|marcad[oa]s?|marca[çc][ãa]o|compromiss[oa]s?|reuni[ãa]o|reuni[õo]es|visita[s]?|eventos?)\b/i;

// Padrões interrogativos ("o que tenho", "que tenho", "tenho alguma coisa",
// "que está marcado", "o que está marcado").
const HAVE_Q_RE = /\b(?:o\s+)?que\s+(?:tenho|est[áa]\s+marcad|h[áa])\b/i;
const HAVE_ANY_RE = /\btenho\s+(?:alguma\s+coisa|algo|algum\s+compromiss|alguma\s+reuni)/i;

// "E hoje?" / "E amanhã?"
const AND_TIME_RE = /^\s*e\s+(hoje|amanh[ãa])\??\s*$/i;

// Períodos.
const TODAY_RE = /\bhoje\b/i;
const TOMORROW_RE = /\bamanh[ãa]\b/i;
const WEEK_RE = /\b(esta\s+semana|na\s+semana|semana)\b/i;

export function detectAgendaQuery(text: string): AgendaPeriod | null {
  const t = (text ?? "").trim();
  if (!t) return null;

  const period: AgendaPeriod | null =
    TODAY_RE.test(t) ? "today" :
    TOMORROW_RE.test(t) ? "tomorrow" :
    WEEK_RE.test(t) ? "week" : null;

  // "E hoje?" — inequivocamente pergunta de agenda.
  if (AND_TIME_RE.test(t)) {
    return TOMORROW_RE.test(t) ? "tomorrow" : "today";
  }

  // Padrões interrogativos + período → agenda.
  if ((HAVE_Q_RE.test(t) || HAVE_ANY_RE.test(t)) && period) {
    return period;
  }

  // Palavra explícita de agenda ("como está a minha agenda?", "que reuniões
  // tenho hoje?") — período opcional, assume hoje se ausente.
  if (AGENDA_WORD_RE.test(t) && /\?\s*$/.test(t)) {
    return period ?? "today";
  }

  return null;
}

// Formatação natural PT-PT para a resposta de agenda.
export interface AgendaItem {
  title?: string;
  due_time?: string | null;
}

export function formatAgendaReply(period: AgendaPeriod, items: AgendaItem[]): string {
  const label =
    period === "today" ? "hoje" :
    period === "tomorrow" ? "amanhã" : "esta semana";
  if (!items.length) {
    return period === "week"
      ? "Não tens compromissos esta semana."
      : `Não tens compromissos para ${label}.`;
  }
  const lines = items.slice(0, 10).map((it) => {
    const t = it.due_time ? String(it.due_time).slice(0, 5) : "";
    const hhmm = t ? t.replace(":", "h") : "";
    const title = String(it.title ?? "").trim() || "compromisso";
    return hhmm ? `• ${hhmm} — ${title}` : `• ${title}`;
  });
  const header = period === "today" ? "Hoje tens:" : period === "tomorrow" ? "Amanhã tens:" : "Esta semana tens:";
  return `${header}\n${lines.join("\n")}`;
}

// Formulação única para "sim/ok" sem contexto — mantida consistente para
// que os testes e o consultor vejam sempre a mesma resposta.
export const BARE_CONFIRMATION_REPLY = "Claro. A que te referes?";

// Contexto pendente é considerado válido apenas se existir uma
// pending_action no estado apropriado. O caller deve ter feito o SELECT
// com o filtro certo (findActivePendingAction já garante isto).
export function hasValidPendingContext(pending: unknown): boolean {
  if (!pending || typeof pending !== "object") return false;
  const p = pending as { status?: string; expires_at?: string | null };
  if (!p.status) return false;
  const ok = ["pending_confirmation", "collecting_information", "correction_pending"].includes(p.status);
  if (!ok) return false;
  if (p.expires_at && new Date(p.expires_at).getTime() < Date.now()) return false;
  return true;
}