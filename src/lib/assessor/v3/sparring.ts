// Modo Sparring — treino de conversas difíceis (objeções de preço, comissão,
// exclusividade). Enquanto estiver activo, nada do que é dito vira registo.

const START_RE = /\b(treina(r)?\s+comigo|vamos\s+treinar|simula(r)?\b|faz\s+de\s+conta\s+que\s+és|ajuda-me\s+a\s+(preparar|praticar)|praticar?\s+(uma|a)\s+objec?[çc][ãa]o|role\s*play)\b/i;
const END_RE = /\b(chega|j[áa]\s+chega|para\s+com\s+isso|obrigad[oa]|volta(mos)?\s+ao\s+normal|sai\s+do\s+(modo\s+)?treino|acaba(mos)?\s+(o\s+)?treino|terminar?\s+(o\s+)?treino)\b/i;

export function detectSparringStart(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  return START_RE.test(t);
}

export function detectSparringEnd(text: string): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  return END_RE.test(t);
}

/** Estado activo lido do conversation_state. */
export function isSparringActive(conversationState: unknown): boolean {
  const topic = (conversationState as { active_topic?: string | null } | null)?.active_topic;
  return String(topic ?? "") === SPARRING_TOPIC;
}

export const SPARRING_TOPIC = "sparring";

export const SPARRING_PROMPT_BLOCK = `
MODO SPARRING (ACTIVO NESTE TURNO):
- O consultor pediu para treinar. Assumes o papel da outra pessoa (proprietário, comprador, investidor), com objecções realistas do mercado português: preço acima do mercado, comissão, exclusividade, prazo, "tenho outra agência".
- Responde em personagem, curto e credível. Sem emojis, sem elogio motivacional.
- NUNCA emitas tool_calls neste modo. Nada do que for dito pode virar registo. action tem de ser "acknowledge".
- Ao fim de poucas trocas, pergunta se quer continuar.
- Quando o consultor disser "chega", "obrigado" ou pedir para voltar ao normal, sais do modo e dás um comentário curto e concreto: o que resultou bem e o que podia ser mais forte. Nunca uma nota ou pontuação.
`;
