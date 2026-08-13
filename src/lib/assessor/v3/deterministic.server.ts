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

import { displayTitle } from "../titles";

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
const TODAY_RE = /\bhoje\b/iu;
const TOMORROW_RE = /(?:^|[^\p{L}])amanh[ãa](?:[^\p{L}]|$)/iu;
const WEEK_RE = /\b(esta\s+semana|na\s+semana|semana)\b/iu;

// Referência explícita ao módulo Diversos/notas — nunca é consulta de agenda.
const MISC_MODULE_RE = /\b(diversos|notas?|ideias?|apontamentos?)\b/i;

// Pergunta explícita sobre o módulo Diversos ("Diversos o que tenho?",
// "que notas tenho?"). Bug real: caía no ramo da agenda e respondia
// "Hoje não tens nada agendado".
const MISC_QUESTION_RE =
  /\b(?:(?:o\s+)?que\s+(?:tenho|h[áa]|est[áa])|tenho|mostra(?:-me)?|lista(?:r|-me)?|ver)\b/i;

// Pedidos de criação/lembrete. Bug real: "Amanhã tenho uma visita ... às
// 14:30. Recorda-me pela manhã. ... todos os dias às 9:45. Combinado?"
// era intercetado como consulta de agenda ("visita" + "?") e respondido com
// "Não tens compromissos para amanhã" — perdendo os dois pedidos.
const CREATE_INTENT_RE =
  /\b(recorda[-\s]?me|lembra[-\s]?me|lembrar[-\s]?me|avisa[-\s]?me|marca(?:r)?\b|agenda(?:r)?[-\s]?me|regista(?:r)?\b|apontar?\b|todos\s+os\s+dias|todas\s+as\s+(?:semanas|manh[ãa]s)|diariamente|sempre\s+[àa]s)\b/i;

// Hora explícita ("às 14:30", "14h30", "9:45").
const EXPLICIT_TIME_RE = /(?:\b[àa]s\s*)?\b([01]?\d|2[0-3])\s*(?:[:h]\s*[0-5]\d)\b/i;

export function detectMiscQuery(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  if (!MISC_MODULE_RE.test(t)) return false;
  if (AGENDA_WORD_RE.test(t)) return false;
  return MISC_QUESTION_RE.test(t) || /\?\s*$/.test(t);
}

// ---------------------------------------------------------------------------
// "Como está o meu dia?" — consulta de estado do dia.
//
// Caso real (08/08 e 11/08): "Bom dia Afonso. Como estou hoje?" e "Como está
// o meu dia" não batiam nenhum padrão de agenda ("dia" não é palavra de
// agenda, "como está" não é "o que tenho"), iam ao motor de raciocínio, este
// respondia de cor sem chamar nenhuma ferramenta e a rede de segurança
// arquivava a pergunta em Diversos. É leitura pura: responde-se com dados
// reais a qualquer hora, sem confirmação e sem passar por Diversos.

const DAY_STATE_RE = new RegExp(
  [
    // "como está o meu dia", "como vai o dia de hoje", "como está hoje"
    "\\bcomo\\s+(?:est[áa]|vai|corre|est[ãa]o)\\s+(?:o\\s+)?(?:meu\\s+)?dia\\b",
    "\\bcomo\\s+(?:est[áa]|vai|corre)\\s+(?:o\\s+dia\\s+de\\s+)?hoje\\b",
    // "como estou hoje", "como é que estou hoje"
    "\\bcomo\\s+(?:é\\s+que\\s+)?(?:estou|ando)\\s+hoje\\b",
    // "resumo do dia", "ponto de situação do dia/de hoje"
    "\\b(?:resumo|ponto\\s+(?:de\\s+)?situa[çc][ãa]o|balan[çc]o)\\s+(?:d[eoa]\\s+)?(?:meu\\s+)?(?:dia|hoje)\\b",
    // "o meu dia de hoje?" / "e o meu dia?"
    "\\b(?:e\\s+)?(?:o\\s+)?meu\\s+dia\\s*\\??\\s*$",
  ].join("|"),
  "i",
);

// Correcções do consultor ("Não me estás a perguntar sobre as reuniões
// passadas") não são consultas: têm de continuar a seguir o fluxo normal.
const NEGATION_RE = /\bn[ãa]o\b/i;

/** É uma pergunta de leitura sobre o estado do dia de hoje? */
export function detectDayStateQuery(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t || t.length > 160) return false;
  if (NEGATION_RE.test(t)) return false;
  if (MISC_MODULE_RE.test(t)) return false;
  if (CREATE_INTENT_RE.test(t) || EXPLICIT_TIME_RE.test(t)) return false;
  return DAY_STATE_RE.test(t);
}

export interface DayStatePriority {
  action: string;
  entity_label?: string | null;
  reasons?: string[];
}

/**
 * Estado do dia em texto: compromissos reais + prioridades reais. Sem
 * perguntas de confirmação — é uma leitura.
 */
export function composeDayStateReply(
  items: AgendaItem[],
  priorities: DayStatePriority[],
  opts: { firstName?: string } = {},
): string {
  const blocks: string[] = [];
  if (items.length) {
    blocks.push(formatAgendaReply("today", items));
  } else {
    blocks.push("Hoje não tens compromissos na agenda.");
  }
  if (priorities.length) {
    const top = priorities.slice(0, 3).map((p) => {
      const label = p.entity_label ? ` (${p.entity_label})` : "";
      return `• ${p.action}${label}`;
    });
    blocks.push(`A tratar:\n${top.join("\n")}`);
  } else if (!items.length) {
    blocks.push("Também não tens nada por tratar. Queres aproveitar para uma ronda de prospeção?");
  }
  const hello = opts.firstName ? `${opts.firstName}, ` : "";
  const head = hello ? `${hello.charAt(0).toUpperCase()}${hello.slice(1)}` : "";
  return `${head}${head ? "aqui vai o teu dia" : "O teu dia"}:\n${blocks.join("\n\n")}`;
}

export function detectAgendaQuery(text: string): AgendaPeriod | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  if (MISC_MODULE_RE.test(t) && !AGENDA_WORD_RE.test(t)) return null;

  // Mensagem que pede para criar/lembrar, ou que declara um compromisso com
  // hora, nunca é uma simples consulta: tem de ir ao motor de raciocínio.
  if (CREATE_INTENT_RE.test(t) || EXPLICIT_TIME_RE.test(t)) return null;

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
    const title = displayTitle(it.title);
    return hhmm ? `• ${hhmm} — ${title}` : `• ${title}`;
  });
  const header = period === "today" ? "Hoje tens:" : period === "tomorrow" ? "Amanhã tens:" : "Esta semana tens:";
  return `${header}\n${lines.join("\n")}`;
}

// Formulação única para "sim/ok" sem contexto — mantida consistente para
// que os testes e o consultor vejam sempre a mesma resposta.
export const BARE_CONFIRMATION_REPLY = "Claro. A que te referes?";

// "Ok" logo a seguir a uma afirmação do Assessor ("Marcada a visita...") é
// só reconhecimento — não é uma confirmação órfã. Bug real: gerava
// "Claro. A que te referes?" depois de a visita ter sido confirmada.
export const ACKNOWLEDGED_REPLY = "Combinado.";

const ACK_ONLY_RE =
  /^\s*(ok(ay|ei)?|okey|certo|perfeito|boa|[óo]ptimo|otimo|combinado|est[áa]\s+bem|fixe|top|obrigad[oa]|👍|✅|🙏)\s*[.!]*\s*$/iu;

/** Reconhecimento neutro (não pede nada, não confirma nada por decidir). */
export function isBareAcknowledgement(text: string): boolean {
  return ACK_ONLY_RE.test((text ?? "").trim());
}

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