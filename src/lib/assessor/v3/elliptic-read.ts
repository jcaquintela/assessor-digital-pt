// Elipses de leitura: "E documentos?", "E para a próxima semana?".
//
// O consultor encadeia perguntas sem repetir o assunto. Até aqui isto
// dependia de casar palavras no texto da resposta anterior do Afonso — se ele
// tinha listado nomes de ficheiros sem dizer "ficheiro", a elipse falhava.
// Agora depende do TÓPICO da última leitura, guardado em `conversation_states`.
//
// Módulo puro, sem I/O.

import type { ReadTool } from "./read-intent";

/** Alinhado com OPEN_QUESTION_TTL_MS: a memória de conversa expira junta. */
export const LAST_READ_TTL_MS = 10 * 60_000;

export type ReadAxis = "time" | "none";

export interface LastReadState {
  tool: string | null;
  args: Record<string, unknown> | null;
  axis: string | null;
  at: string | Date | null;
}

export interface EllipticRead {
  tool: ReadTool;
  arguments: Record<string, unknown>;
}

function norm(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Eixo de cada ferramenta de leitura: só a agenda aceita que uma elipse
 * temporal troque o período. Pedir "próxima semana" depois de listar o Drive
 * não pode inventar um Drive filtrado por semana.
 */
export function axisForTool(tool: string | null | undefined): ReadAxis {
  return tool === "search_agenda" ? "time" : "none";
}

// Forma fechada: a frase INTEIRA é a elipse. "E depois?" e "E agora?" não
// casam nada — não nomeiam tópico nem período.
const ELLIPTIC_TOPIC_RE =
  /^(?:e|entao)?\s*(?:os |as |o |a )?(documentos?|ficheiros?|drive|cadernetas?|placas?|contactos?|pessoas?|imoveis?|agenda|lembretes?|seguimentos?)\s*\??$/;

const TOPIC_TOOLS: Array<[RegExp, ReadTool, Record<string, unknown>]> = [
  [/^(documentos?|ficheiros?|drive|cadernetas?)$/, "search_files", { query: "" }],
  [/^placas?$/, "search_prospecting_leads", {}],
  [/^(contactos?|pessoas?)$/, "search_people", { query: "" }],
  [/^imoveis?$/, "search_properties", { query: "" }],
  [/^agenda$/, "search_agenda", { period: "today" }],
  [/^(lembretes?|seguimentos?)$/, "search_active_reminders", {}],
];

const ELLIPTIC_PERIOD_RE =
  /^(?:e|entao)?\s*(?:para |pra |na |no |e para )?\s*(?:a |o )?(hoje|amanha|esta semana|proxima semana|semana que vem|na proxima semana)\s*\??$/;

const PERIOD_VALUES: Array<[RegExp, "today" | "tomorrow" | "week" | "next_week"]> = [
  [/^hoje$/, "today"],
  [/^amanha$/, "tomorrow"],
  [/^esta semana$/, "week"],
  [/^(proxima semana|semana que vem|na proxima semana)$/, "next_week"],
];

// (c) Elipse SEM tópico nem período: "Que mais?", "E mais?", "Mais alguma
// coisa?". Não nomeia nada — só pede a continuação da MESMA leitura. Sem isto
// caía no caminho de escrita e acabava em Diversos.
const ELLIPTIC_MORE_RE =
  /^(?:e |entao |mas )?(?:que|o que|ha|tens|falta|sobra)?\s*(?:mais|mais alguma coisa|alguma coisa mais|mais alguma|mais algum)\s*(?:coisa|alguma coisa|para (?:hoje|ver))?\s*[?!.]*$/;

const READ_TOOLS = new Set<ReadTool>([
  "search_people",
  "search_properties",
  "search_prospecting_leads",
  "search_agenda",
  "search_active_reminders",
  "search_files",
]);

export function isLastReadFresh(state: LastReadState | null | undefined, now = Date.now()): boolean {
  if (!state?.tool || !state.at) return false;
  const at = state.at instanceof Date ? state.at : new Date(state.at);
  const ms = at.getTime();
  if (!Number.isFinite(ms)) return false;
  return now - ms >= 0 && now - ms < LAST_READ_TTL_MS;
}

/**
 * Devolve a leitura a repetir, ou `null` quando não há elipse reconhecível,
 * não há leitura recente válida, ou o eixo é incompatível.
 */
export function resolveEllipticRead(
  raw: string,
  state: LastReadState | null | undefined,
  now = Date.now(),
): EllipticRead | null {
  const text = norm(raw);
  if (!text || text.length > 40) return null;
  if (!isLastReadFresh(state, now)) return null;

  // (a) Elipse de tópico: "E documentos?" → repete a leitura desse tópico.
  const topic = text.match(ELLIPTIC_TOPIC_RE)?.[1];
  if (topic) {
    for (const [re, tool, args] of TOPIC_TOOLS) {
      if (re.test(topic)) return { tool, arguments: { ...args } };
    }
    return null;
  }

  // (b) Elipse temporal: só se aplica a tópicos com eixo temporal.
  const period = text.match(ELLIPTIC_PERIOD_RE)?.[1];
  if (period) {
    const axis = (state!.axis as ReadAxis | null) ?? axisForTool(state!.tool);
    if (axis !== "time") return null;
    for (const [re, value] of PERIOD_VALUES) {
      if (re.test(period)) {
        return {
          tool: state!.tool as ReadTool,
          arguments: { ...(state!.args ?? {}), period: value },
        };
      }
    }
  }

  // (c) "Que mais?" isolado: repete a última leitura tal e qual.
  if (ELLIPTIC_MORE_RE.test(text) && /\bmais\b/.test(text)) {
    const tool = state!.tool as ReadTool;
    if (READ_TOOLS.has(tool)) {
      return { tool, arguments: { ...(state!.args ?? {}) } };
    }
  }

  return null;
}
