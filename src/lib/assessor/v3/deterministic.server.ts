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
import { resolveDateTimeFromText } from "../date-resolver";

export type AgendaPeriod = "today" | "tomorrow" | "week";

// Palavras que denotam agenda mesmo sem período explícito.
const AGENDA_WORD_RE = /\b(agenda|marcad[oa]s?|marca[çc][ãa]o|compromiss[oa]s?|reuni[ãa]o|reuni[õo]es|visita[s]?|eventos?)\b/i;

// Padrões interrogativos ("o que tenho", "que tenho", "que temos hoje",
// "tenho alguma coisa", "que está marcado", "o que está marcado").
const HAVE_Q_RE = /\b(?:o\s+)?que\s+(?:tenho|tens|temos|est[áa]\s+marcad|h[áa])\b/i;
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

/**
 * Frases da mensagem. Caso real (24/08): "Agenda hoje como está? Estou na
 * Espanha" — o sufixo conversacional depois do "?" partia a âncora /\?$/ e a
 * pergunta caía no motor. Avaliamos cada frase por si.
 */
function splitSentences(t: string): string[] {
  const parts = t
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3);
  // A mensagem inteira também conta (frases sem pontuação final).
  return parts.length > 1 ? [t, ...parts] : [t];
}

function matchAgendaClause(t: string): AgendaPeriod | null {
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

export function detectAgendaQuery(text: string): AgendaPeriod | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  if (MISC_MODULE_RE.test(t) && !AGENDA_WORD_RE.test(t)) return null;

  // Mensagem que pede para criar/lembrar, ou que declara um compromisso com
  // hora, nunca é uma simples consulta: tem de ir ao motor de raciocínio.
  if (CREATE_INTENT_RE.test(t) || EXPLICIT_TIME_RE.test(t)) return null;

  for (const clause of splitSentences(t)) {
    const hit = matchAgendaClause(clause);
    if (hit) return hit;
  }
  return null;
}


// Formatação natural PT-PT para a resposta de agenda.
export interface AgendaItem {
  title?: string;
  due_date?: string | null;
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

// ---------------------------------------------------------------------------
// Consulta de agenda para um dia nomeado ("na terça-feira", "dia 20",
// "depois de amanhã"). O fast path antigo só conhecia hoje/amanhã/semana e
// respondia com a agenda de HOJE a perguntas sobre outros dias.

const WEEKDAY_NAMES = [
  "domingo", "segunda-feira", "terça-feira", "quarta-feira",
  "quinta-feira", "sexta-feira", "sábado",
];

function weekdayOfYmd(ymd: string): number {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** "terça-feira, 18/08" */
export function formatDayLabel(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return `${WEEKDAY_NAMES[weekdayOfYmd(ymd)]}, ${d}/${m}`;
}

export interface AgendaDateQuery {
  date: string; // YYYY-MM-DD
  label: string;
}

/**
 * Pergunta de agenda sobre um dia concreto que não é hoje/amanhã/semana.
 * Devolve null quando não há intenção de agenda ou quando o dia é coberto
 * pelo fast path existente.
 */
export function detectAgendaDateQuery(
  text: string,
  now: Date = new Date(),
): AgendaDateQuery | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  if (MISC_MODULE_RE.test(t) && !AGENDA_WORD_RE.test(t)) return null;
  if (CREATE_INTENT_RE.test(t)) return null;
  const afterTomorrow = /depois\s+de\s+amanh[ãa]/i.test(t);
  if (!afterTomorrow && (TODAY_RE.test(t) || TOMORROW_RE.test(t))) return null;

  const hasIntent =
    HAVE_Q_RE.test(t) || HAVE_ANY_RE.test(t) || (AGENDA_WORD_RE.test(t) && /\?\s*$/.test(t));
  if (!hasIntent) return null;

  const r = resolveDateTimeFromText(t, now);
  if (!r.date || r.time) return null;
  return { date: r.date, label: formatDayLabel(r.date) };
}

export function formatAgendaDateReply(label: string, items: AgendaItem[]): string {
  if (!items.length) return `Não tens compromissos para ${label}.`;
  const lines = items.slice(0, 10).map((it) => {
    const t = it.due_time ? String(it.due_time).slice(0, 5) : "";
    const hhmm = t ? t.replace(":", "h") : "";
    const title = displayTitle(it.title);
    return hhmm ? `• ${hhmm} — ${title}` : `• ${title}`;
  });
  return `Para ${label} tens:\n${lines.join("\n")}`;
}

// ---------------------------------------------------------------------------
// Pesquisa de compromisso por nome ("Quando é a reunião de teste Outlook?",
// "Que dia é a visita à Rua das Flores?").
//
// Caso real (24/08): "Que dia a Marta Santana" — sem o verbo ("é"/"será") o
// padrão não casava e a pergunta acabava em Diversos. O verbo é opcional.

const EVENT_NAME_RE =
  /\b(?:quando\s+(?:é|e|ser[áa])(?:\s+que)?|que\s+dia\s+(?:(?:é|e|ser[áa]|foi|tenho|temos)\s+)?|a\s+que\s+horas\s+(?:(?:é|e|ser[áa])\s+)?)\s*(.+)$/i;

// Sem verbo, "que dia marcamos a visita?" é um pedido de marcação, não uma
// consulta. Estes arranques nunca são assunto de compromisso.
const NOT_EVENT_SUBJECT_RE =
  /^(?:marca\w*|agenda\w*|queres|quer[ea]s?|posso|podemos|devo|fica\w*|vamos|seria|prefere\w*|melhor)\b/i;

const LEADING_ARTICLE_RE = /^(?:a|o|as|os|um|uma|essa|esse|aquela|aquele|minha|meu|nossa|nosso)\s+/i;

function foldText(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const STOP_TOKENS = new Set([
  "a", "o", "as", "os", "de", "do", "da", "dos", "das", "em", "no", "na",
  "com", "para", "e", "que", "um", "uma", "minha", "meu", "the",
]);

/** Assunto do evento procurado, ou null se a frase não é uma pergunta destas. */
export function detectEventNameQuery(text: string): string | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  if (CREATE_INTENT_RE.test(t)) return null;
  const m = t.match(EVENT_NAME_RE);
  if (!m) return null;
  let subject = m[1].replace(/[?!.\s]+$/g, "").trim();
  subject = subject.replace(LEADING_ARTICLE_RE, "").trim();
  if (NOT_EVENT_SUBJECT_RE.test(subject)) return null;
  if (TODAY_RE.test(subject) || TOMORROW_RE.test(subject)) return null;
  const tokens = foldText(subject).split(" ").filter((w) => w.length > 2 && !STOP_TOKENS.has(w));
  if (!tokens.length) return null;
  return subject;
}

export interface EventRow extends AgendaItem {
  id?: string;
}

/** Ordena os compromissos por semelhança de título com o assunto pedido. */
export function rankEventsByTitle<T extends { title?: string | null }>(
  subject: string,
  rows: T[],
): T[] {
  const wanted = foldText(subject).split(" ").filter((w) => w.length > 2 && !STOP_TOKENS.has(w));
  if (!wanted.length) return [];
  const scored = rows.map((r) => {
    const hay = foldText(String(r.title ?? ""));
    const hits = wanted.filter((w) => hay.includes(w)).length;
    return { r, score: hits / wanted.length };
  });
  return scored
    .filter((s) => s.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.r);
}

export function formatEventFoundReply(subject: string, items: AgendaItem[]): string {
  if (!items.length) {
    return `Não encontrei nenhum compromisso com "${subject}" na agenda. Queres que registe um?`;
  }
  const lines = items.slice(0, 3).map((it) => {
    const day = it.due_date ? formatDayLabel(String(it.due_date).slice(0, 10)) : "sem data";
    const t = it.due_time ? String(it.due_time).slice(0, 5).replace(":", "h") : "";
    const when = t ? `${day} às ${t}` : day;
    return `• ${displayTitle(it.title)} — ${when}`;
  });
  if (items.length === 1) return lines[0]!.replace(/^• /, "");
  return `Encontrei estes:\n${lines.join("\n")}`;
}

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