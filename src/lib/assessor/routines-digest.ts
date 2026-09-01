// Rotinas do tipo "resumo" (digest): o disparo executa uma LEITURA no momento
// e envia o resultado ao consultor. Nunca inventa conteúdo — se a leitura vier
// vazia, o texto diz isso de forma honesta.
//
// Este módulo é puro (sem BD) para ser testável: classifica o pedido escrito
// pelo consultor e compõe o texto final a partir de factos já lidos.

import { lisbonHhMm } from "./lisbon-day";

export type DigestTopic = "leads" | "agenda" | "prioridades";

const norm = (v: unknown) =>
  String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Que leitura fazer a partir do pedido em linguagem natural.
 * Sem correspondência clara, o resumo é o das prioridades do dia — é o que um
 * assessor humano diria se lhe pedissem "resume-me o dia".
 */
export function classifyDigestQuery(query: string | null | undefined): DigestTopic {
  const q = norm(query);
  if (/\blead|placa|prospe|angariac|sem resposta|por contactar\b/.test(q)) return "leads";
  if (/\bagenda|compromisso|reuni|visita|calendario\b/.test(q)) return "agenda";
  return "prioridades";
}

export interface DigestFacts {
  topic: DigestTopic;
  /** Linhas já legíveis, na ordem em que devem sair. */
  lines: string[];
  /** Total real encontrado (pode ser maior do que as linhas mostradas). */
  total: number;
}

const TITLE: Record<DigestTopic, string> = {
  leads: "Leads sem resposta",
  agenda: "Agenda",
  prioridades: "Prioridades",
};

const EMPTY: Record<DigestTopic, string> = {
  leads: "Não tens leads à espera de resposta.",
  agenda: "Não tens compromissos marcados.",
  prioridades: "Não tenho nada a destacar como prioridade.",
};

/** Texto final do resumo. Máx. 6 linhas para caber em qualquer canal. */
export function composeDigestText(facts: DigestFacts, title?: string | null): string {
  const head = (title ?? "").trim() || TITLE[facts.topic];
  if (!facts.lines.length) return `${head}: ${EMPTY[facts.topic]}`;
  const shown = facts.lines.slice(0, 6);
  const rest = facts.total - shown.length;
  const tail = rest > 0 ? `\n(+${rest})` : "";
  return `${head}:\n${shown.map((l) => `• ${l}`).join("\n")}${tail}`;
}

/** Etiqueta de um compromisso para o resumo de agenda. */
export function agendaLine(ev: { title: string; startIso: string | null }): string {
  const t = String(ev.title ?? "").trim() || "compromisso";
  return ev.startIso ? `${lisbonHhMm(ev.startIso)} — ${t}` : t;
}
