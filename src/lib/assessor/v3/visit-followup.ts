// Follow-up instantâneo pós-visita — módulo puro (sem BD, sem rede).
//
// O consultor sai de uma visita e manda um áudio curto. O Afonso regista o
// que ficou e entrega um rascunho de seguimento PRONTO A COPIAR — nunca
// enviado, nunca por um canal escolhido por ele. A fronteira de execução
// perante terceiros continua fechada.
//
// Regra de suficiência: "correu bem" não é informação. Sem reação, objeção,
// comparação ou próximo passo concretos, não se inventa um rascunho genérico
// — pergunta-se o que ficou por dizer.

import type { AudioTheme } from "./audio-themes";
import { withSuggestion, withSuggestionAndQuestion } from "../culture/suggested-message";

/** Pergunta única quando o áudio não dá para escrever nada de útil. */
export const VISIT_ASK_QUESTION =
  "Registei. Queres que te escreva o seguimento? Diz-me o que ficou por dizer.";

/** Frases sem conteúdo: aparecem em quase todos os áudios e não dizem nada. */
const EMPTY_RE =
  /^(correu\s+(muito\s+)?(bem|mal|assim\s+assim)|foi\s+bom|nada\s+de\s+especial|normal|tudo\s+bem|gostou|nao\s+gostou)[.!]?$/i;

function meaningful(value: string | null | undefined): boolean {
  const t = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (t.length < 6) return false;
  return !EMPTY_RE.test(t);
}

/**
 * Há matéria para escrever um seguimento? Basta UMA coisa concreta: uma
 * reação com conteúdo, uma objeção, uma comparação com outra zona, ou um
 * próximo passo combinado.
 */
export function visitHasSubstance(theme: AudioTheme): boolean {
  const v = theme.visit;
  if (v?.objection && meaningful(v.objection)) return true;
  if (v?.comparison_zone && String(v.comparison_zone).trim().length >= 2) return true;
  if (v?.reaction && meaningful(v.reaction)) return true;
  if (theme.next_action?.text && meaningful(theme.next_action.text)) return true;
  return false;
}

/** Resumo objetivo da visita, em PT-PT e na 3.ª pessoa — vai para o histórico. */
export function visitSummaryText(theme: AudioTheme): string {
  const v = theme.visit;
  const bits: string[] = [];
  if (v?.reaction) bits.push(v.reaction);
  if (v?.objection) bits.push(`Objeção: ${v.objection}`);
  if (v?.comparison_zone) bits.push(`Compara com imóveis em ${v.comparison_zone}`);
  const text = bits.join(". ").replace(/\.\.+/g, ".").trim();
  return (text || theme.title).slice(0, 600);
}

/** Instruções dadas ao gerador de texto — só o que saiu do áudio. */
export function visitDraftInstructions(theme: AudioTheme): string {
  const v = theme.visit;
  const lines = [
    "Escreve a mensagem de seguimento a enviar logo a seguir a uma visita ao imóvel.",
    v?.reaction ? `O cliente reagiu assim: ${v.reaction}` : "",
    v?.objection ? `Levantou esta objeção: ${v.objection}. Responde-lhe com respeito, sem baixar o preço nem prometer nada.` : "",
    v?.comparison_zone ? `Disse que está a comparar com imóveis em ${v.comparison_zone}. Mostra abertura para lhe mostrar alternativas.` : "",
    theme.next_action?.text ? `Ficou combinado: ${theme.next_action.text}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

/** Primeira bolha: o que ficou registado, sem prometer envios. */
export function visitReceiptLine(theme: AudioTheme, personName?: string | null): string {
  const who = String(personName ?? theme.person?.name ?? "").trim();
  const alvo = who ? ` com ${who}` : "";
  return `Registei a visita${alvo}: ${visitSummaryText(theme)}`.replace(/\s+/g, " ").trim();
}

export interface VisitBubblesInput {
  /** Recibo geral do áudio (o que já era dito antes desta funcionalidade). */
  base: string;
  receipt: string;
  draft?: string | null;
  comparables?: string | null;
  /** Sem substância: pergunta em vez de rascunho. */
  ask?: boolean;
}

/**
 * Monta a resposta em bolhas: recibo → rascunho (bolha própria, limpa para
 * long-press copiar) → comparáveis. Sem rascunho, sai só o recibo e a
 * pergunta.
 */
export function composeVisitReply(input: VisitBubblesInput): string {
  const head = [input.base?.trim(), input.receipt?.trim()].filter(Boolean).join("\n\n");
  const draft = String(input.draft ?? "").trim();
  if (!draft) {
    return input.ask ? `${head}\n\n${VISIT_ASK_QUESTION}`.trim() : head;
  }
  const intro = `${head}\n\nDeixo-te o seguimento pronto a copiar:`;
  const tail = String(input.comparables ?? "").trim();
  return tail
    ? withSuggestionAndQuestion(intro, draft, tail)
    : withSuggestion(intro, draft);
}
